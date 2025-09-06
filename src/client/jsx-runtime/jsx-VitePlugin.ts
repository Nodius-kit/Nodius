import type { Plugin } from 'vite';
import type { ParserPlugin } from '@babel/parser';

export default function JsxVitePlugin(): Plugin {
    let needHmr = false;

    return {
        name: 'vite-plugin-custom-jsx',

        config() {
            return {
                esbuild: {
                    jsx: 'automatic',
                    jsxFactory: 'jsx',
                    jsxFragment: 'Fragment',
                    jsxImportSource: '@/jsx-runtime', // Adjust this path to your runtime location
                },
                optimizeDeps: {
                    esbuildOptions: {
                        jsx: 'automatic',
                        jsxFactory: 'jsx',
                        jsxFragment: 'Fragment',
                    }
                }
            };
        },

        async transform(code, id, options) {
            // Only process .jsx, .tsx files
            if (!id.match(/\.[jt]sx$/)) {
                return null;
            }

            const isSSR = options?.ssr === true;
            if (isSSR) {
                return null;
            }

            // Check if the file contains JSX/TSX
            if (!code.includes('<')) {
                return null;
            }

            // Parse to detect if this module exports components
            const hasComponentExports = detectComponentExports(code);

            if (!hasComponentExports) {
                return null;
            }

            needHmr = true;

            // Transform JSX and add HMR code
            const result = await transformJSXWithHMR(code, id);

            return {
                code: result.code,
                map: result.map,
            };
        },

        transformIndexHtml() {
            if (!needHmr) return;

            // Inject HMR runtime into HTML
            return [
                {
                    tag: 'script',
                    attrs: { type: 'module' },
                    children: `
            // Global HMR runtime for custom JSX
            window.__customJSXHMR = {
              componentMap: new Map(),
              register(id, component, name) {
                const key = id + ':' + name;
                this.componentMap.set(key, component);
              },
              update(id, newComponent, name) {
                const key = id + ':' + name;
                const oldComponent = this.componentMap.get(key);
                if (oldComponent) {
                  this.componentMap.set(key, newComponent);
                  // Trigger re-render for all instances of this component
                  this.reRenderInstances(oldComponent, newComponent);
                }
              },
              reRenderInstances(oldComponent, newComponent) {
                // Find all component instances and re-render them
                if (window.__jsxRuntime && window.__jsxRuntime.updateComponent) {
                  window.__jsxRuntime.updateComponent(oldComponent, newComponent);
                }
              }
            };
          `,
                    injectTo: 'head-prepend',
                },
            ];
        },
    };
}

function detectComponentExports(code: string): boolean {
    // Simple heuristic: check for function components
    // Look for: export function/const ComponentName
    // Or: export default function
    const componentPatterns = [
        /export\s+(default\s+)?function\s+[A-Z]\w*/,
        /export\s+(default\s+)?const\s+[A-Z]\w*\s*=/,
        /export\s+{\s*[A-Z]\w*/,
        /export\s+default\s+[A-Z]\w*/,
    ];

    return componentPatterns.some(pattern => pattern.test(code));
}

async function transformJSXWithHMR(code: string, id: string) {
    // Use babel for more sophisticated transforms if needed
    // For now, we'll do a simpler approach

    // Extract component names
    const componentNames = extractComponentNames(code);

    // Prepare HMR accept code
    const hmrCode = generateHMRCode(id, componentNames);

    // Add import for jsx runtime if not present
    const jsxImport = ensureJSXImport(code);

    // Wrap components with HMR registration
    const wrappedCode = wrapComponentsWithHMR(code, id, componentNames);

    return {
        code: jsxImport + '\n' + wrappedCode + '\n' + hmrCode,
        map: null,
    };
}

function extractComponentNames(code: string): string[] {
    const names: string[] = [];

    // Match function components
    const functionPattern = /(?:export\s+(?:default\s+)?)?function\s+([A-Z]\w*)/g;
    let match;
    while ((match = functionPattern.exec(code)) !== null) {
        names.push(match[1]);
    }

    // Match const components
    const constPattern = /(?:export\s+(?:default\s+)?)?const\s+([A-Z]\w*)\s*=/g;
    while ((match = constPattern.exec(code)) !== null) {
        names.push(match[1]);
    }

    // Check for default export
    if (/export\s+default\s+/.test(code) && !names.includes('default')) {
        names.push('default');
    }

    return [...new Set(names)];
}

function ensureJSXImport(code: string): string {
    // Check if jsx import already exists
    if (code.includes('from "@/jsx-runtime"') ||
        code.includes('from "./jsx-runtime"') ||
        code.includes('from "../jsx-runtime"')) {
        return '';
    }

    // Add the import
    return `import { jsx, jsxs, Fragment, render } from '@/jsx-runtime';\n`;
}

function wrapComponentsWithHMR(code: string, id: string, componentNames: string[]): string {
    let wrappedCode = code;

    componentNames.forEach(name => {
        if (name === 'default') {
            // Handle default export specially
            wrappedCode = wrappedCode.replace(
                /export\s+default\s+(function\s+\w+|\w+|class\s+\w+)/,
                (match, component) => {
                    return `const __hmr_default = ${component};
if (import.meta.hot) {
  window.__customJSXHMR?.register('${id}', __hmr_default, 'default');
}
export default __hmr_default`;
                }
            );
        } else {
            // Wrap named exports
            const patterns = [
                // function Component() {}
                new RegExp(`(export\\s+)?function\\s+${name}\\s*\\(`),
                // const Component = () => {}
                new RegExp(`(export\\s+)?const\\s+${name}\\s*=`),
            ];

            patterns.forEach(pattern => {
                wrappedCode = wrappedCode.replace(pattern, (match) => {
                    const isExported = match.startsWith('export');
                    const prefix = isExported ? '' : 'export ';

                    return match + `\nif (import.meta.hot) {
  window.__customJSXHMR?.register('${id}', ${name}, '${name}');
}\n${prefix}`;
                });
            });
        }
    });

    return wrappedCode;
}

function generateHMRCode(id: string, componentNames: string[]): string {
    if (componentNames.length === 0) {
        return '';
    }

    return `
if (import.meta.hot) {
  // Store original components
  ${componentNames.map(name =>
        name === 'default'
            ? `const __prev_default = window.__customJSXHMR?.componentMap.get('${id}:default');`
            : `const __prev_${name} = window.__customJSXHMR?.componentMap.get('${id}:${name}');`
    ).join('\n  ')}
  
  import.meta.hot.accept((newModule) => {
    if (!newModule) return;
    
    ${componentNames.map(name => {
        if (name === 'default') {
            return `
    // Update default export
    if (newModule.default && __prev_default) {
      window.__customJSXHMR?.update('${id}', newModule.default, 'default');
      
      // Re-render all instances
      if (window.__jsxRuntime?.reRenderAllComponents) {
        window.__jsxRuntime.reRenderAllComponents();
      } else {
        // Fallback: force update by dispatching a custom event
        window.dispatchEvent(new CustomEvent('custom-jsx-hmr-update', {
          detail: { component: newModule.default, oldComponent: __prev_default }
        }));
      }
    }`;
        } else {
            return `
    // Update ${name}
    if (newModule.${name} && __prev_${name}) {
      window.__customJSXHMR?.update('${id}', newModule.${name}, '${name}');
      
      // Re-render all instances
      if (window.__jsxRuntime?.reRenderAllComponents) {
        window.__jsxRuntime.reRenderAllComponents();
      } else {
        // Fallback: force update
        window.dispatchEvent(new CustomEvent('custom-jsx-hmr-update', {
          detail: { component: newModule.${name}, oldComponent: __prev_${name} }
        }));
      }
    }`;
        }
    }).join('\n    ')}
  });
  
  // Prevent full reload on self-accept
  import.meta.hot.dispose(() => {
    // Cleanup if needed
  });
  
  import.meta.hot.prune(() => {
    // Cleanup unused modules
  });
}
`;
}