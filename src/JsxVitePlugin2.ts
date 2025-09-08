import type { Plugin } from 'vite';
import { createFilter } from 'vite';

export default function customJsxPlugin(): Plugin {
    const defaultInclude = /\.[jt]sx$/;
    const defaultExclude = /node_modules/;
    const filter = createFilter(defaultInclude, defaultExclude);

    let config: any;
    let isDev = false;

    return {
        name: 'vite-plugin-custom-jsx',
        enforce: 'pre',

        config(userConfig, { command }) {
            isDev = command === 'serve';

            return {
                esbuild: {
                    jsx: 'automatic',
                    jsxFactory: 'jsx',
                    jsxFragment: 'Fragment',
                    // This should match your actual runtime location
                    jsxImportSource: 'nodius_jsx',
                },
                optimizeDeps: {
                    esbuildOptions: {
                        jsx: 'automatic',
                        jsxFactory: 'jsx',
                        jsxFragment: 'Fragment',
                    }
                },
            };
        },

        configResolved(resolvedConfig) {
            config = resolvedConfig;
        },

        async transform(code, id) {
            // Only process JSX/TSX files
            if (!filter(id)) return null;
            if (!isDev) return null;

            // Don't transform the runtime itself
            if (id.includes('jsx-runtime')) return null;

            // Check if this file exports any components
            const hasComponents = detectComponents(code);
            if (!hasComponents) return null;

            // Extract component information
            const components = extractComponentInfo(code);

            // Generate HMR code
            const hmrCode = generateHMRCode(id, components, code);

            return {
                code: hmrCode,
                map: null,
            };
        },
    };
}

function detectComponents(code: string): boolean {
    // Check for function components (PascalCase functions)
    const componentPatterns = [
        /export\s+(?:default\s+)?function\s+[A-Z]\w*/,
        /export\s+(?:default\s+)?const\s+[A-Z]\w*\s*=/,
        /const\s+[A-Z]\w*\s*=\s*(?:\([^)]*\)|[^=])*=>/,
        /function\s+[A-Z]\w*\s*\(/,
    ];

    return componentPatterns.some(pattern => pattern.test(code));
}

interface ComponentInfo {
    name: string;
    isDefault: boolean;
    isExported: boolean;
}

function extractComponentInfo(code: string): ComponentInfo[] {
    const components: ComponentInfo[] = [];

    // Match exported function components
    const exportedFunctionRegex = /export\s+(default\s+)?function\s+([A-Z]\w*)/g;
    let match;

    while ((match = exportedFunctionRegex.exec(code)) !== null) {
        components.push({
            name: match[2],
            isDefault: !!match[1],
            isExported: true,
        });
    }

    // Match exported const arrow functions
    const exportedConstRegex = /export\s+(default\s+)?const\s+([A-Z]\w*)\s*=/g;

    while ((match = exportedConstRegex.exec(code)) !== null) {
        components.push({
            name: match[2],
            isDefault: !!match[1],
            isExported: true,
        });
    }

    // Match non-exported components that might be exported later
    const constComponentRegex = /(?<!export\s+)(?<!export\s+default\s+)const\s+([A-Z]\w*)\s*=\s*(?:\([^)]*\)|[^=])*=>/g;

    while ((match = constComponentRegex.exec(code)) !== null) {
        const name = match[1];
        // Check if this component is exported elsewhere
        const isExported = new RegExp(`export\\s+{[^}]*\\b${name}\\b[^}]*}|export\\s+default\\s+${name}\\b`).test(code);

        if (isExported && !components.find(c => c.name === name)) {
            components.push({
                name,
                isDefault: new RegExp(`export\\s+default\\s+${name}\\b`).test(code),
                isExported: true,
            });
        }
    }

    // Match non-exported function components
    const functionComponentRegex = /(?<!export\s+)(?<!export\s+default\s+)function\s+([A-Z]\w*)\s*\(/g;

    while ((match = functionComponentRegex.exec(code)) !== null) {
        const name = match[1];
        const isExported = new RegExp(`export\\s+{[^}]*\\b${name}\\b[^}]*}|export\\s+default\\s+${name}\\b`).test(code);

        if (isExported && !components.find(c => c.name === name)) {
            components.push({
                name,
                isDefault: new RegExp(`export\\s+default\\s+${name}\\b`).test(code),
                isExported: true,
            });
        }
    }

    return components;
}

function generateHMRCode(id: string, components: ComponentInfo[], originalCode: string): string {
    if (components.length === 0) return originalCode;

    // Store original components in a Map for tracking
    const componentTracking = components.map(comp => {
        const varName = comp.isDefault ? '__HMR_DEFAULT__' : `__HMR_${comp.name}__`;
        return `const ${varName} = ${comp.isDefault ? '(typeof __DEFAULT_EXPORT__ !== "undefined" ? __DEFAULT_EXPORT__ : null)' : comp.name};`;
    }).join('\n');

    // Wrap default export if exists
    let modifiedCode = originalCode;
    if (components.some(c => c.isDefault)) {
        // Replace default export to capture it
        modifiedCode = modifiedCode.replace(
            /export\s+default\s+(\w+|\([^)]*\)\s*=>[\s\S]*?(?=\n(?:export|const|function|$)))/,
            (match, exported) => {
                return `const __DEFAULT_EXPORT__ = ${exported};\nexport default __DEFAULT_EXPORT__;`;
            }
        );

        // Handle export default function
        modifiedCode = modifiedCode.replace(
            /export\s+default\s+function\s+(\w+)?/,
            (match, name) => {
                if (name) {
                    return `function ${name}`;
                } else {
                    return `const __DEFAULT_EXPORT__ = function`;
                }
            }
        );

        // Add export default at the end if we captured it
        if (modifiedCode.includes('__DEFAULT_EXPORT__') && !modifiedCode.includes('export default __DEFAULT_EXPORT__')) {
            modifiedCode += '\nexport default __DEFAULT_EXPORT__;';
        }
    }

    const hmrAcceptCode = `
if (import.meta.hot) {
    // Store original components
    ${componentTracking}
    
    // Use a global store for HMR component tracking
    window.__hmrComponentStore = window.__hmrComponentStore || new Map();
    const moduleId = '${id}';
    
    // Store components for HMR
    ${components.map(comp => {
        const varName = comp.isDefault ? '__HMR_DEFAULT__' : `__HMR_${comp.name}__`;
        return `
    if (${varName}) {
        window.__hmrComponentStore.set(moduleId + ':${comp.name}', ${varName});
    }`;
    }).join('')}

    import.meta.hot.accept((newModule) => {
        if (!newModule) return;
        
        // Get the runtime HMR support
        const runtime = window.__jsxRuntime;
        if (!runtime || !runtime.updateComponent) {
            console.warn('[HMR] JSX runtime HMR support not found, falling back to full reload');
            location.reload();
            return;
        }
        
        ${components.map(comp => {
        const storageKey = `moduleId + ':${comp.name}'`;
        const newComponentAccess = comp.isDefault ? 'newModule.default' : `newModule.${comp.name}`;

        return `
        // Update ${comp.name}
        const old_${comp.name} = window.__hmrComponentStore.get(${storageKey});
        if (old_${comp.name} && ${newComponentAccess}) {
            console.log('[HMR] Updating component ${comp.name}');
            runtime.updateComponent(old_${comp.name}, ${newComponentAccess});
            // Update stored reference for next HMR
            window.__hmrComponentStore.set(${storageKey}, ${newComponentAccess});
        }`;
    }).join('')}
    });

    // Cleanup on dispose
    import.meta.hot.dispose(() => {
        // Clean up stored components for this module
        ${components.map(comp => `
        window.__hmrComponentStore.delete(moduleId + ':${comp.name}');`).join('')}
    });
}`;

    return modifiedCode + '\n' + hmrAcceptCode;
}