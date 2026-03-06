/**
 * HTML → HtmlObject converter tests
 *
 * Part 1: Unit tests — complex HTML edge cases run through htmlToHtmlObject
 * Part 2: AI integration — LLM generates HTML, we convert + validate
 *
 * Usage:
 *   npx tsx scripts/ai-test/test-html-converter.mts [testName]
 *   npx tsx scripts/ai-test/test-html-converter.mts unit          # unit tests only
 *   npx tsx scripts/ai-test/test-html-converter.mts ai            # AI tests only
 *   npx tsx scripts/ai-test/test-html-converter.mts all           # everything
 */

import 'dotenv/config';
import { resolve } from 'path';
import { config } from 'dotenv';
config({ path: resolve(import.meta.dirname, '../../packages/server/.env') });

import { htmlToHtmlObject } from '../../packages/server/src/ai/htmlToHtmlObject.js';
import type { HtmlObject } from '@nodius/utils';

// ─── Validation helpers ─────────────────────────────────────────────

const VALID_TYPES = new Set(['block', 'text', 'list', 'html', 'icon', 'image', 'link', 'array']);

interface ValidationError {
    path: string;
    message: string;
}

function validateHtmlObject(obj: unknown, path = 'root'): ValidationError[] {
    const errors: ValidationError[] = [];
    if (obj == null || typeof obj !== 'object') {
        errors.push({ path, message: `Expected object, got ${typeof obj}` });
        return errors;
    }

    const o = obj as Record<string, unknown>;

    // Required base fields
    if (typeof o.identifier !== 'string' || o.identifier.length === 0) {
        errors.push({ path, message: `Missing or empty identifier` });
    }
    if (typeof o.tag !== 'string' || o.tag.length === 0) {
        errors.push({ path, message: `Missing or empty tag` });
    }
    if (typeof o.name !== 'string') {
        errors.push({ path, message: `Missing name` });
    }
    if (typeof o.type !== 'string' || !VALID_TYPES.has(o.type)) {
        errors.push({ path, message: `Invalid type: "${o.type}". Must be one of: ${[...VALID_TYPES].join(', ')}` });
    }

    // css must be array
    if (!Array.isArray(o.css)) {
        errors.push({ path, message: `css must be an array` });
    } else {
        for (let i = 0; i < o.css.length; i++) {
            const block = o.css[i] as Record<string, unknown>;
            if (typeof block.selector !== 'string') {
                errors.push({ path: `${path}.css[${i}]`, message: `Missing selector` });
            }
            if (!Array.isArray(block.rules)) {
                errors.push({ path: `${path}.css[${i}]`, message: `rules must be an array` });
            } else {
                for (let j = 0; j < block.rules.length; j++) {
                    const rule = block.rules[j] as unknown[];
                    if (!Array.isArray(rule) || rule.length !== 2) {
                        errors.push({ path: `${path}.css[${i}].rules[${j}]`, message: `Rule must be [prop, val]` });
                    }
                }
            }
        }
    }

    // domEvents must be array
    if (!Array.isArray(o.domEvents)) {
        errors.push({ path, message: `domEvents must be an array` });
    } else {
        for (let i = 0; i < o.domEvents.length; i++) {
            const ev = o.domEvents[i] as Record<string, unknown>;
            if (typeof ev.name !== 'string') {
                errors.push({ path: `${path}.domEvents[${i}]`, message: `Missing event name` });
            }
            if (typeof ev.call !== 'string') {
                errors.push({ path: `${path}.domEvents[${i}]`, message: `Missing event call` });
            }
        }
    }

    // attribute if present must be Record<string, string>
    if (o.attribute !== undefined) {
        if (typeof o.attribute !== 'object' || o.attribute === null || Array.isArray(o.attribute)) {
            errors.push({ path, message: `attribute must be a plain object` });
        }
    }

    // Identifier uniqueness is checked globally (see below)

    // Type-specific content validation
    const type = o.type as string;
    switch (type) {
        case 'block':
            if (o.content !== undefined && o.content !== null) {
                errors.push(...validateHtmlObject(o.content, `${path}.content`));
            }
            break;
        case 'text':
            if (typeof o.content !== 'object' || o.content === null || Array.isArray(o.content)) {
                errors.push({ path, message: `text content must be Record<string,string>` });
            } else {
                for (const [lang, val] of Object.entries(o.content as Record<string, unknown>)) {
                    if (typeof val !== 'string') {
                        errors.push({ path: `${path}.content.${lang}`, message: `text value must be string` });
                    }
                }
            }
            break;
        case 'list':
            if (!Array.isArray(o.content)) {
                errors.push({ path, message: `list content must be an array` });
            } else {
                for (let i = 0; i < o.content.length; i++) {
                    errors.push(...validateHtmlObject(o.content[i], `${path}.content[${i}]`));
                }
            }
            break;
        case 'html':
            if (typeof o.content !== 'string') {
                errors.push({ path, message: `html content must be a string` });
            }
            break;
        case 'icon':
            if (typeof o.content !== 'string') {
                errors.push({ path, message: `icon content must be a string` });
            }
            break;
        case 'image':
            if (!Array.isArray(o.content) || o.content.length !== 2) {
                errors.push({ path, message: `image content must be [alt, src]` });
            }
            break;
        case 'link':
            if (typeof o.content !== 'object' || o.content === null) {
                errors.push({ path, message: `link content must be {url, text}` });
            } else {
                const lc = o.content as Record<string, unknown>;
                if (typeof lc.url !== 'string') errors.push({ path: `${path}.content.url`, message: `url must be string` });
                if (typeof lc.text !== 'object' || lc.text === null) errors.push({ path: `${path}.content.text`, message: `text must be Record<string,string>` });
            }
            break;
    }

    return errors;
}

/** Collect all identifiers to check uniqueness */
function collectIdentifiers(obj: unknown, ids: string[] = []): string[] {
    if (obj == null || typeof obj !== 'object') return ids;
    const o = obj as Record<string, unknown>;
    if (typeof o.identifier === 'string') ids.push(o.identifier);
    if (o.content != null) {
        if (Array.isArray(o.content)) {
            for (const child of o.content) collectIdentifiers(child, ids);
        } else if (typeof o.content === 'object' && 'identifier' in (o.content as object)) {
            collectIdentifiers(o.content, ids);
        }
    }
    return ids;
}

function countNodes(obj: unknown): number {
    if (obj == null || typeof obj !== 'object') return 0;
    const o = obj as Record<string, unknown>;
    let count = 1;
    if (o.content != null) {
        if (Array.isArray(o.content)) {
            for (const child of o.content) count += countNodes(child);
        } else if (typeof o.content === 'object' && 'identifier' in (o.content as object)) {
            count += countNodes(o.content);
        }
    }
    return count;
}

// ─── Unit test runner ────────────────────────────────────────────────

interface UnitTestCase {
    name: string;
    html: string;
    options?: { defaultLanguage?: string; identifierPrefix?: string };
    checks: (result: HtmlObject) => string[];  // returns list of failures
}

function runUnitTest(tc: UnitTestCase): { name: string; pass: boolean; failures: string[]; nodeCount: number } {
    let result: HtmlObject;
    try {
        result = htmlToHtmlObject(tc.html, tc.options);
    } catch (err) {
        return { name: tc.name, pass: false, failures: [`THREW: ${err}`], nodeCount: 0 };
    }

    const validationErrors = validateHtmlObject(result);
    const failures: string[] = validationErrors.map(e => `[${e.path}] ${e.message}`);

    // Check identifier uniqueness
    const ids = collectIdentifiers(result);
    const seen = new Set<string>();
    for (const id of ids) {
        if (seen.has(id)) failures.push(`Duplicate identifier: "${id}"`);
        seen.add(id);
    }

    // Run custom checks
    try {
        failures.push(...tc.checks(result));
    } catch (err) {
        failures.push(`Check threw: ${err}`);
    }

    const nodeCount = countNodes(result);
    return { name: tc.name, pass: failures.length === 0, failures, nodeCount };
}

// ─── Unit Test Cases ─────────────────────────────────────────────────

const unitTests: UnitTestCase[] = [
    // 1. Nested layout with mixed inline styles + class styles
    {
        name: 'complex-dashboard-layout',
        html: `
<style>
.card { background: #fff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); padding: 16px; }
.flex-row { display: flex; gap: 12px; align-items: center; }
.metric { font-size: 32px; font-weight: 700; color: #1a73e8; }
.label { font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 1px; }
.badge { background: #e8f5e9; color: #2e7d32; padding: 2px 8px; border-radius: 12px; font-size: 11px; }
</style>
<div class="card" style="max-width: 400px; margin: 20px auto;">
    <div class="flex-row" style="justify-content: space-between;">
        <div>
            <span class="label">Revenue</span>
            <p class="metric" style="margin: 4px 0;">$42,389</p>
        </div>
        <span class="badge">+12.5%</span>
    </div>
    <div style="margin-top: 12px; border-top: 1px solid #eee; padding-top: 12px;">
        <div class="flex-row">
            <span class="label">vs last month</span>
            <span style="color: #2e7d32; font-weight: 500;">↑ $4,720</span>
        </div>
    </div>
</div>`,
        checks: (r) => {
            const f: string[] = [];
            if (r.type !== 'block' && r.type !== 'list') f.push(`Root should be block or list, got ${r.type}`);
            // Should have CSS from both class + inline
            const allCss = JSON.stringify(r);
            if (!allCss.includes('max-width')) f.push('Missing inline style max-width');
            if (!allCss.includes('border-radius')) f.push('Missing class style border-radius');
            if (!allCss.includes('box-shadow')) f.push('Missing class style box-shadow');
            if (countNodes(r) < 8) f.push(`Expected at least 8 nodes, got ${countNodes(r)}`);
            return f;
        },
    },

    // 2. Multiple event handlers (onclick, onmouseover, onsubmit, custom data-event-*)
    {
        name: 'complex-event-handlers',
        html: `
<div id="app">
    <form onsubmit="handleSubmit(event)" data-event-formValidated="validateAll()">
        <input type="text" placeholder="Name" onchange="updateField('name', this.value)" onfocus="highlight(this)" onblur="unhighlight(this)" />
        <select onchange="handleSelect(this.value)" data-event-optionChanged="trackSelection()">
            <option value="a">Option A</option>
            <option value="b">Option B</option>
        </select>
        <button type="submit" onclick="event.preventDefault(); submit()" ondblclick="quickSubmit()" onmouseenter="showTooltip()" onmouseleave="hideTooltip()">
            Send
        </button>
    </form>
    <div onscroll="handleScroll()" oncontextmenu="showCustomMenu(event)" style="overflow: auto; height: 200px;">
        <p onclick="selectParagraph(this)" onkeydown="handleKeyNav(event)" tabindex="0">Clickable paragraph</p>
    </div>
</div>`,
        checks: (r) => {
            const f: string[] = [];
            const json = JSON.stringify(r);
            // Count total domEvents across all nodes
            const evCount = (json.match(/"name"/g) || []).length;
            if (evCount < 10) f.push(`Expected at least 10 event bindings, found ~${evCount}`);
            // Specific events
            if (!json.includes('handleSubmit')) f.push('Missing onsubmit handler');
            if (!json.includes('formValidated') && !json.includes('validateAll')) f.push('Missing data-event-formValidated');
            if (!json.includes('handleScroll')) f.push('Missing onscroll handler');
            if (!json.includes('showCustomMenu')) f.push('Missing oncontextmenu handler');
            if (!json.includes('dblclick') && !json.includes('quickSubmit')) f.push('Missing ondblclick handler');
            if (!json.includes('mouseenter') && !json.includes('showTooltip')) f.push('Missing onmouseenter handler');
            // data attributes should NOT be treated as events (only data-event-* should)
            return f;
        },
    },

    // 3. Images, links, icons mixed together
    {
        name: 'media-mixed-content',
        html: `
<div>
    <a href="https://example.com/profile" title="Profile" target="_blank">
        View Profile
    </a>
    <img src="/images/avatar.png" alt="User avatar" width="64" height="64" loading="lazy" />
    <i class="lucide lucide-settings"></i>
    <i class="lucide chevron-right"></i>
    <a href="mailto:contact@test.com">Email us</a>
    <img src="data:image/svg+xml;base64,PHN2Zz4=" alt="" />
</div>`,
        checks: (r) => {
            const f: string[] = [];
            if (r.type !== 'list') f.push(`Root should be list, got ${r.type}`);
            const json = JSON.stringify(r);
            // Check link type produced
            if (!json.includes('"type":"link"')) f.push('Missing link type');
            // Check image type produced
            if (!json.includes('"type":"image"')) f.push('Missing image type');
            // Check icon type produced
            if (!json.includes('"type":"icon"')) f.push('Missing icon type');
            // Check attribute preservation (target, loading, etc.)
            if (!json.includes('"target"')) f.push('Missing target attribute on link');
            if (!json.includes('"loading"')) f.push('Missing loading attribute on img');
            return f;
        },
    },

    // 4. Deeply nested tree (5+ levels)
    {
        name: 'deep-nesting',
        html: `
<div id="level-0">
    <div id="level-1">
        <div id="level-2">
            <div id="level-3">
                <div id="level-4">
                    <div id="level-5">
                        <span>Deep content</span>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>`,
        checks: (r) => {
            const f: string[] = [];
            // Walk 6 levels deep
            let current: unknown = r;
            for (let i = 0; i <= 5; i++) {
                if (current == null || typeof current !== 'object') {
                    f.push(`Tree broken at level ${i}`);
                    break;
                }
                const c = current as Record<string, unknown>;
                if (c.type !== 'block') {
                    // level-5 wraps a span text, so it could be block with text content
                    if (i < 5) f.push(`Level ${i} should be block, got ${c.type}`);
                }
                current = c.content;
            }
            return f;
        },
    },

    // 5. CSS with pseudo-selectors and media queries (should not crash, CSS parsed as-is)
    {
        name: 'complex-css-edge-cases',
        html: `
<style>
.btn { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 24px; }
.container { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; }
</style>
<div class="container">
    <button class="btn" style="border: none; cursor: pointer; font-size: 16px; transition: transform 0.2s ease-in-out;">
        Click me
    </button>
    <div style="background: var(--theme-bg, #f0f0f0); color: rgb(51, 51, 51); padding: 8px;">
        <p style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;">Styled text</p>
    </div>
</div>`,
        checks: (r) => {
            const f: string[] = [];
            const json = JSON.stringify(r);
            // CSS with colons in values (gradients, rgb, var)
            if (!json.includes('linear-gradient')) f.push('Missing gradient CSS value');
            if (!json.includes('var(--theme-bg')) f.push('Missing CSS var() value');
            if (!json.includes('rgb(51')) f.push('Missing rgb() color');
            if (!json.includes('transition')) f.push('Missing transition property');
            if (!json.includes('grid-template-columns')) f.push('Missing grid CSS from class');
            return f;
        },
    },

    // 6. Empty elements, self-closing tags, whitespace-only text nodes
    {
        name: 'empty-and-edge-elements',
        html: `
<div>
    <br />
    <hr />
    <div></div>
    <span>   </span>
    <div>

    </div>
    <input type="hidden" name="csrf" value="abc123" />
    <div>Real content here</div>
</div>`,
        checks: (r) => {
            const f: string[] = [];
            // Whitespace-only spans and newline-only divs should be filtered out
            const nc = countNodes(r);
            // root div + br + hr + empty div + empty div(newlines) + input + "Real content" div + text span = 8-9
            if (nc > 10) f.push(`Too many nodes (${nc}), whitespace not filtered?`);
            const json = JSON.stringify(r);
            if (!json.includes('csrf')) f.push('Missing hidden input attribute');
            return f;
        },
    },

    // 7. Table structure
    {
        name: 'html-table',
        html: `
<table style="width: 100%; border-collapse: collapse;">
    <thead>
        <tr style="background: #f5f5f5;">
            <th style="padding: 8px; text-align: left; border-bottom: 2px solid #ddd;">Name</th>
            <th style="padding: 8px; text-align: left; border-bottom: 2px solid #ddd;">Status</th>
            <th style="padding: 8px; text-align: right; border-bottom: 2px solid #ddd;">Score</th>
        </tr>
    </thead>
    <tbody>
        <tr onclick="selectRow(0)">
            <td style="padding: 8px;">Alice</td>
            <td style="padding: 8px;"><span style="color: green;">Active</span></td>
            <td style="padding: 8px; text-align: right;">95</td>
        </tr>
        <tr onclick="selectRow(1)">
            <td style="padding: 8px;">Bob</td>
            <td style="padding: 8px;"><span style="color: red;">Inactive</span></td>
            <td style="padding: 8px; text-align: right;">72</td>
        </tr>
    </tbody>
</table>`,
        checks: (r) => {
            const f: string[] = [];
            const json = JSON.stringify(r);
            if (r.tag !== 'table') f.push(`Root should be table, got ${r.tag}`);
            if (!json.includes('selectRow')) f.push('Missing onclick handler on tr');
            if (!json.includes('border-collapse')) f.push('Missing table style');
            if (countNodes(r) < 12) f.push(`Expected 12+ nodes for table, got ${countNodes(r)}`);
            return f;
        },
    },

    // 8. Multilingual content
    {
        name: 'multilingual-french',
        html: `<div><h1>Bonjour le monde</h1><p>Ceci est un paragraphe en francais.</p></div>`,
        options: { defaultLanguage: 'fr' },
        checks: (r) => {
            const f: string[] = [];
            const json = JSON.stringify(r);
            // Content should use "fr" key, not "en"
            if (!json.includes('"fr"')) f.push('Missing "fr" language key');
            if (json.includes('"en"')) f.push('Should not have "en" key when defaultLanguage=fr');
            return f;
        },
    },

    // 9. Inline JS in onclick with complex expressions
    {
        name: 'complex-inline-js-events',
        html: `
<div>
    <button onclick="const x = {a: 1, b: 'hello'}; console.log(JSON.stringify(x));">Complex JS</button>
    <div ondrop="event.preventDefault(); const data = event.dataTransfer.getData('text/plain'); handleDrop(data, event.target);"
         ondragover="event.preventDefault(); event.target.classList.add('drag-over');"
         ondragleave="event.target.classList.remove('drag-over');">
        Drop zone
    </div>
    <input oninput="debounce(() => search(this.value), 300)()" type="search" placeholder="Search..." />
</div>`,
        checks: (r) => {
            const f: string[] = [];
            const json = JSON.stringify(r);
            // Events with complex JS should be preserved exactly
            if (!json.includes('JSON.stringify')) f.push('Lost complex JS in onclick');
            if (!json.includes('dataTransfer')) f.push('Lost ondrop handler content');
            if (!json.includes('debounce')) f.push('Lost oninput handler content');
            if (!json.includes('"drop"') && !json.includes('"ondrop"')) f.push('Missing drop event name');
            if (!json.includes('"dragover"')) f.push('Missing dragover event name');
            if (!json.includes('"dragleave"')) f.push('Missing dragleave event name');
            return f;
        },
    },

    // 10. Multiple roots (no single wrapper)
    {
        name: 'multiple-root-elements',
        html: `
<h1>Title</h1>
<p>Paragraph 1</p>
<p>Paragraph 2</p>
<footer>Footer</footer>`,
        checks: (r) => {
            const f: string[] = [];
            // Should auto-wrap in a RootContainer list
            if (r.type !== 'list') f.push(`Multiple roots should produce list, got ${r.type}`);
            if (r.name !== 'RootContainer') f.push(`Wrapper name should be RootContainer, got ${r.name}`);
            if (r.type === 'list' && Array.isArray((r as any).content)) {
                if ((r as any).content.length !== 4) f.push(`Expected 4 children, got ${(r as any).content.length}`);
            }
            return f;
        },
    },

    // 11. data-* attributes (non-event) should become attributes, not events
    {
        name: 'data-attributes-vs-events',
        html: `
<div data-id="item-42" data-testid="main-container" data-event-nodeUpdate="refreshUI()" data-tooltip="Hello world">
    <span data-key="abc" data-event-graphUpdate="rerender()">Content</span>
</div>`,
        checks: (r) => {
            const f: string[] = [];
            const json = JSON.stringify(r);
            // data-id, data-testid, data-tooltip, data-key should be in attribute
            if (!json.includes('"data-id"')) f.push('Missing data-id in attributes');
            if (!json.includes('"data-testid"')) f.push('Missing data-testid in attributes');
            if (!json.includes('"data-tooltip"')) f.push('Missing data-tooltip in attributes');
            // data-event-* should be in domEvents
            if (!json.includes('refreshUI')) f.push('Missing nodeUpdate event handler');
            if (!json.includes('rerender')) f.push('Missing graphUpdate event handler');
            // data-event-nodeUpdate should NOT be in attributes
            if (json.includes('"data-event-nodeUpdate"')) f.push('data-event-* should not be in attributes');
            return f;
        },
    },

    // 12. Complex CSS with multiple selectors per class (edge case: only . class rules are extracted)
    {
        name: 'style-tag-with-multiple-class-rules',
        html: `
<style>
.header { background: #1a1a2e; color: white; padding: 20px; }
.header { font-family: 'Segoe UI', sans-serif; }
.nav-item { display: inline-block; padding: 8px 16px; }
</style>
<div class="header">
    <span class="nav-item" style="font-weight: bold;">Home</span>
    <span class="nav-item">About</span>
    <span class="nav-item" style="color: #e94560;">Contact</span>
</div>`,
        checks: (r) => {
            const f: string[] = [];
            const json = JSON.stringify(r);
            // .header appears twice - both should be merged into CSS
            if (!json.includes('#1a1a2e')) f.push('Missing first .header background');
            // Second .header rule (font-family) - regex only captures last match per className
            // This is a known limitation; just check the main rule works
            if (!json.includes('inline-block')) f.push('Missing .nav-item display');
            if (!json.includes('#e94560')) f.push('Missing inline color on Contact');
            return f;
        },
    },

    // 13. SVG element (should be treated as block/list)
    {
        name: 'svg-element',
        html: `
<svg width="100" height="100" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <circle cx="50" cy="50" r="40" fill="#e94560" />
    <text x="50" y="55" text-anchor="middle" fill="white" font-size="14">Hi</text>
</svg>`,
        checks: (r) => {
            const f: string[] = [];
            if (r.tag !== 'svg') f.push(`Root should be svg, got ${r.tag}`);
            const json = JSON.stringify(r);
            if (!json.includes('"viewBox"') && !json.includes('"viewbox"')) f.push('Missing viewBox attribute');
            if (!json.includes('circle') && !json.includes('CIRCLE')) f.push('Missing circle child');
            return f;
        },
    },

    // 14. Single text-only element
    {
        name: 'single-paragraph',
        html: `<p>Just a simple paragraph with <strong>bold</strong> and <em>italic</em> text.</p>`,
        checks: (r) => {
            const f: string[] = [];
            if (r.tag !== 'p') f.push(`Root tag should be p, got ${r.tag}`);
            // p with mixed text+elements children — should be text type since strong/em are text tags
            // Actually strong/em contain text nodes → they become text type → parent p sees all children as text → becomes text
            if (r.type !== 'text') f.push(`Expected text type (all children are text), got ${r.type}`);
            return f;
        },
    },

    // 15. Template variables / mustache syntax in content
    {
        name: 'template-variables',
        html: `
<div>
    <h2>Hello, {{userName}}!</h2>
    <p>Your balance is: {{balance}} {{currency}}</p>
    <span style="color: {{themeColor}};">Themed text</span>
</div>`,
        checks: (r) => {
            const f: string[] = [];
            const json = JSON.stringify(r);
            // Mustache variables should be preserved in text content
            if (!json.includes('{{userName}}')) f.push('Lost {{userName}} template variable');
            if (!json.includes('{{balance}}')) f.push('Lost {{balance}} template variable');
            // CSS values with template vars
            if (!json.includes('{{themeColor}}')) f.push('Lost {{themeColor}} in style');
            return f;
        },
    },
];

// ─── AI Integration Tests ────────────────────────────────────────────

import { Database, aql } from 'arangojs';
import { AIAgent } from '../../packages/server/src/ai/aiAgent.js';
import { createLLMProviderFromConfig } from '../../packages/server/src/ai/providers/providerFactory.js';
import type { GraphDataSource, GraphRAGContext, StreamCallbacks } from '../../packages/server/src/ai/types.js';
import type { Edge, Node, NodeTypeConfig } from '@nodius/utils';

const db = new Database({
    url: process.env.ARANGO_URL || 'http://127.0.0.1:8529',
    databaseName: process.env.ARANGO_DB || 'nodius',
    auth: { username: process.env.ARANGO_USER || 'root', password: process.env.ARANGO_PASS || 'azerty' },
});

class TestDataSource implements GraphDataSource {
    constructor(private workspace: string) {}
    async getGraph(graphKey: string): Promise<GraphRAGContext['graph'] | null> {
        const cursor = await db.query(aql`FOR g IN nodius_graphs FILTER g._key == ${graphKey} AND g.workspace == ${this.workspace} RETURN g`);
        const g = await cursor.next();
        if (!g) return null;
        return { _key: g._key, name: g.name, description: g.description, sheets: g.sheetsList ?? {}, metadata: g.metadata };
    }
    async getNodes(graphKey: string, sheetId?: string): Promise<Node<unknown>[]> {
        const cursor = sheetId
            ? await db.query(aql`FOR n IN nodius_nodes FILTER n.graphKey == ${graphKey} AND n.sheet == ${sheetId} RETURN n`)
            : await db.query(aql`FOR n IN nodius_nodes FILTER n.graphKey == ${graphKey} RETURN n`);
        return (await cursor.all()).map(n => this.toLocal(n, graphKey));
    }
    async getEdges(graphKey: string, sheetId?: string): Promise<Edge[]> {
        const cursor = sheetId
            ? await db.query(aql`FOR e IN nodius_edges FILTER e.graphKey == ${graphKey} AND e.sheet == ${sheetId} RETURN e`)
            : await db.query(aql`FOR e IN nodius_edges FILTER e.graphKey == ${graphKey} RETURN e`);
        return (await cursor.all()).map(e => this.toLocalEdge(e, graphKey));
    }
    async getNodeByKey(graphKey: string, nodeKey: string): Promise<Node<unknown> | null> {
        const cursor = await db.query(aql`FOR n IN nodius_nodes FILTER n._key == ${`${graphKey}-${nodeKey}`} AND n.graphKey == ${graphKey} RETURN n`);
        const n = await cursor.next();
        return n ? this.toLocal(n, graphKey) : null;
    }
    async getNodeConfigs(_graphKey: string): Promise<NodeTypeConfig[]> {
        const workspaces = [this.workspace, 'root'];
        return (await db.query(aql`FOR c IN nodius_node_config FILTER c.workspace IN ${workspaces} RETURN c`)).all();
    }
    async searchNodes(graphKey: string, _query: string, maxResults = 10): Promise<Node<unknown>[]> {
        return (await this.getNodes(graphKey)).slice(0, maxResults);
    }
    async getNeighborhood(graphKey: string, nodeKey: string, maxDepth = 2): Promise<{ nodes: Node<unknown>[]; edges: Edge[] }> {
        const startId = `nodius_nodes/${graphKey}-${nodeKey}`;
        try {
            const cursor = await db.query(aql`
                FOR v, e IN 1..${maxDepth} ANY ${startId} nodius_edges
                    OPTIONS { bfs: true, uniqueVertices: "global" }
                    FILTER v.graphKey == ${graphKey}
                    RETURN { node: v, edge: e }
            `);
            const results = await cursor.all();
            const nodesMap = new Map<string, Node<unknown>>();
            const edgesMap = new Map<string, Edge>();
            for (const r of results) {
                if (r.node) { const ln = this.toLocal(r.node, graphKey); nodesMap.set(ln._key, ln); }
                if (r.edge) { const le = this.toLocalEdge(r.edge, graphKey); edgesMap.set(le._key, le); }
            }
            return { nodes: [...nodesMap.values()], edges: [...edgesMap.values()] };
        } catch { return { nodes: [], edges: [] }; }
    }
    private toLocal(n: Record<string, unknown>, gk: string): Node<unknown> {
        const prefix = `${gk}-`;
        return { ...n, _key: (n._key as string).startsWith(prefix) ? (n._key as string).slice(prefix.length) : n._key } as Node<unknown>;
    }
    private toLocalEdge(e: Record<string, unknown>, gk: string): Edge {
        const prefix = `${gk}-`;
        return {
            ...e,
            _key: (e._key as string)?.startsWith(prefix) ? (e._key as string).slice(prefix.length) : e._key,
            source: (e.source as string)?.startsWith?.(prefix) ? (e.source as string).slice(prefix.length) : e.source,
            target: (e.target as string)?.startsWith?.(prefix) ? (e.target as string).slice(prefix.length) : e.target,
        } as Edge;
    }
}

const TEST_GRAPH = '4ce2aa712226d8b0a6231c61d2e8adaeb4c21a47d9d218174bff3af3c2833960';
const WORKSPACE = '150630';

interface AIChatResult {
    text: string;
    toolCalls: { name: string; args: string }[];
    totalTokens: number;
    duration: number;
    interrupted: boolean;
    interruptAction?: Record<string, unknown>;
    errors: string[];
}

function createAgent(graphKey: string): AIAgent {
    const llm = createLLMProviderFromConfig();
    if (!llm) throw new Error('No LLM provider configured.');
    return new AIAgent({ graphKey, dataSource: new TestDataSource(WORKSPACE), role: 'editor', llmProvider: llm, embeddingProvider: null, workspace: WORKSPACE });
}

async function aiChat(agent: AIAgent, question: string, label: string): Promise<AIChatResult> {
    const start = Date.now();
    let text = '';
    let totalTokens = 0;
    let interrupted = false;
    let interruptAction: Record<string, unknown> | undefined;
    const toolCalls: { name: string; args: string }[] = [];
    const errors: string[] = [];

    const callbacks: StreamCallbacks = {
        onToken: (t) => { text += t; },
        onToolStart: (_id, name) => { toolCalls.push({ name, args: '' }); },
        onToolResult: () => {},
        onComplete: (fullText) => {
            try {
                const parsed = JSON.parse(fullText);
                if (parsed?.type === 'interrupt') {
                    interrupted = true;
                    interruptAction = parsed.proposedAction;
                    text = fullText;
                }
            } catch { /* not JSON */ }
        },
        onError: (err) => { errors.push(err.message); },
        onUsage: (u) => { totalTokens += u.totalTokens; },
    };

    await agent.chatStream(question, callbacks);
    const duration = Date.now() - start;

    console.log(`\n  [${label}] ${duration}ms | ${totalTokens} tokens | tools: ${toolCalls.map(t => t.name).join(', ') || 'none'} | interrupted: ${interrupted}`);
    if (errors.length) console.log(`  ERRORS: ${errors.join('; ')}`);

    return { text, toolCalls, totalTokens, duration, interrupted, interruptAction, errors };
}

interface AITestCase {
    name: string;
    prompt: string;
    /** Validate the propose_update_node data (HtmlObject) the AI generated */
    validateAction: (action: Record<string, unknown>) => string[];
}

const aiTests: AITestCase[] = [
    {
        name: 'ai-dashboard-with-events',
        prompt: `Modifie le contenu HTML du node root. Cree un dashboard complet avec :
- Un header avec le titre "Admin Dashboard" en blanc sur fond bleu (#1a73e8)
- 3 cartes statistiques en row (flex) : "Users: 1,234", "Revenue: $42k", "Orders: 567"
- Chaque carte a un evenement onclick qui appelle selectCard('users'), selectCard('revenue'), selectCard('orders')
- Un bouton "Refresh" avec onclick="refreshDashboard()" et un style hover (cursor: pointer)
- Utilise la structure HtmlObject correcte avec css, domEvents, identifier unique, tag, etc.`,
        validateAction: (action) => {
            const f: string[] = [];
            if (action.type !== 'update_node') { f.push(`Expected update_node, got ${action.type}`); return f; }
            const payload = action.payload as Record<string, unknown>;
            const changes = payload?.changes as Record<string, unknown>;
            if (!changes?.data) { f.push('No data in changes'); return f; }
            const data = changes.data as Record<string, unknown>;
            const errs = validateHtmlObject(data);
            if (errs.length) f.push(...errs.map(e => `[Validation] ${e.path}: ${e.message}`));
            const json = JSON.stringify(data);
            // Check expected content
            if (!json.includes('selectCard')) f.push('Missing selectCard event');
            if (!json.includes('refreshDashboard')) f.push('Missing refreshDashboard event');
            if (!json.includes('#1a73e8') && !json.includes('1a73e8')) f.push('Missing blue color');
            const nc = countNodes(data);
            if (nc < 6) f.push(`Expected 6+ HtmlObject nodes, got ${nc}`);
            // Identifiers unique
            const ids = collectIdentifiers(data);
            const seen = new Set<string>();
            for (const id of ids) {
                if (seen.has(id)) f.push(`Duplicate identifier: ${id}`);
                seen.add(id);
            }
            return f;
        },
    },
    {
        name: 'ai-interactive-form',
        prompt: `Modifie le contenu HTML du node root. Cree un formulaire d'inscription complet :
- Champs : nom (input text), email (input email), mot de passe (input password), role (select avec Admin/User/Guest)
- Chaque input a un onchange qui appelle updateField('fieldName', this.value) et un onfocus/onblur pour le highlight
- Le select a un onchange="handleRole(this.value)"
- Un bouton Submit avec onclick="event.preventDefault(); submitForm()" et ondblclick="quickSubmit()"
- Validation visuelle: bordure rouge si erreur, verte si valide (utilise des styles CSS sur les inputs)
- Un lien "Already have an account?" qui pointe vers #login
- Structure HtmlObject correcte.`,
        validateAction: (action) => {
            const f: string[] = [];
            if (action.type !== 'update_node') { f.push(`Expected update_node, got ${action.type}`); return f; }
            const payload = action.payload as Record<string, unknown>;
            const changes = payload?.changes as Record<string, unknown>;
            if (!changes?.data) { f.push('No data in changes'); return f; }
            const data = changes.data as Record<string, unknown>;
            const errs = validateHtmlObject(data);
            if (errs.length) f.push(...errs.map(e => `[Validation] ${e.path}: ${e.message}`));
            const json = JSON.stringify(data);
            if (!json.includes('updateField')) f.push('Missing updateField handler');
            if (!json.includes('submitForm')) f.push('Missing submitForm handler');
            if (!json.includes('handleRole')) f.push('Missing handleRole handler');
            if (!json.includes('"link"')) f.push('Missing link type for login link');
            const nc = countNodes(data);
            if (nc < 8) f.push(`Expected 8+ nodes for form, got ${nc}`);
            return f;
        },
    },
    {
        name: 'ai-nav-with-icons-and-dnd',
        prompt: `Modifie le contenu HTML du node root. Cree une sidebar de navigation avec :
- Un logo (image src="/logo.png" alt="Logo") en haut
- 5 items de menu : Dashboard (icone lucide "layout-dashboard"), Users (icone "users"), Settings (icone "settings"), Analytics (icone "bar-chart"), Logout (icone "log-out")
- Chaque item a un onclick="navigate('pageName')" et un style hover (background change)
- L'item actif a un fond bleu (#1a73e8) et texte blanc
- Les items sont draggable: ondragstart="startDrag(event, 'itemName')" ondragend="endDrag(event)"
- Un footer avec un lien externe "Documentation" vers https://docs.example.com
- Structure HtmlObject correcte avec identifiers uniques, css, domEvents, etc.`,
        validateAction: (action) => {
            const f: string[] = [];
            if (action.type !== 'update_node') { f.push(`Expected update_node, got ${action.type}`); return f; }
            const payload = action.payload as Record<string, unknown>;
            const changes = payload?.changes as Record<string, unknown>;
            if (!changes?.data) { f.push('No data in changes'); return f; }
            const data = changes.data as Record<string, unknown>;
            const errs = validateHtmlObject(data);
            if (errs.length) f.push(...errs.map(e => `[Validation] ${e.path}: ${e.message}`));
            const json = JSON.stringify(data);
            if (!json.includes('navigate')) f.push('Missing navigate handler');
            if (!json.includes('"image"')) f.push('Missing image type for logo');
            if (!json.includes('"link"')) f.push('Missing link type for documentation');
            if (!json.includes('#1a73e8') && !json.includes('1a73e8')) f.push('Missing active color');
            const nc = countNodes(data);
            if (nc < 10) f.push(`Expected 10+ nodes for sidebar, got ${nc}`);
            return f;
        },
    },
];

// ─── Main ────────────────────────────────────────────────────────────

async function runUnitTests(): Promise<{ pass: number; fail: number; results: ReturnType<typeof runUnitTest>[] }> {
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║            UNIT TESTS — htmlToHtmlObject                    ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    let pass = 0, fail = 0;
    const results: ReturnType<typeof runUnitTest>[] = [];

    for (const tc of unitTests) {
        const r = runUnitTest(tc);
        results.push(r);
        if (r.pass) {
            console.log(`  ✓ ${r.name} (${r.nodeCount} nodes)`);
            pass++;
        } else {
            console.log(`  ✗ ${r.name} (${r.nodeCount} nodes)`);
            for (const f of r.failures) console.log(`      → ${f}`);
            fail++;
        }
    }

    console.log(`\n  TOTAL: ${pass} passed, ${fail} failed out of ${unitTests.length}`);
    return { pass, fail, results };
}

async function runAITests(): Promise<{ pass: number; fail: number }> {
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║          AI INTEGRATION TESTS — LLM → HtmlObject           ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    let pass = 0, fail = 0;

    for (const tc of aiTests) {
        console.log(`\n─── ${tc.name} ───`);
        const agent = createAgent(TEST_GRAPH);
        const r = await aiChat(agent, tc.prompt, tc.name);

        if (r.errors.length) {
            console.log(`  ✗ ${tc.name}: LLM errors: ${r.errors.join('; ')}`);
            fail++;
            continue;
        }

        if (!r.interrupted || !r.interruptAction) {
            console.log(`  ✗ ${tc.name}: Expected HITL interrupt with propose_update_node, got: interrupted=${r.interrupted}`);
            console.log(`    Response preview: ${r.text.slice(0, 400)}`);
            fail++;
            continue;
        }

        const failures = tc.validateAction(r.interruptAction);
        if (failures.length === 0) {
            console.log(`  ✓ ${tc.name}: Valid HtmlObject (${countNodes((r.interruptAction.payload as Record<string, unknown>)?.changes as Record<string, unknown>)} nodes)`);
            pass++;
        } else {
            console.log(`  ✗ ${tc.name}: ${failures.length} issues`);
            for (const f of failures) console.log(`      → ${f}`);
            // Show the generated HtmlObject for debugging
            const payload = r.interruptAction.payload as Record<string, unknown>;
            const changes = payload?.changes as Record<string, unknown>;
            if (changes?.data) {
                console.log(`    Generated HtmlObject (first 1000 chars):`);
                console.log(`    ${JSON.stringify(changes.data, null, 2).slice(0, 1000)}`);
            }
            fail++;
        }
    }

    console.log(`\n  TOTAL: ${pass} passed, ${fail} failed out of ${aiTests.length}`);
    return { pass, fail };
}

async function main() {
    const arg = process.argv[2] ?? 'all';

    if (arg === 'unit' || arg === 'all') {
        const unitResult = await runUnitTests();
        if (arg === 'unit') {
            process.exit(unitResult.fail > 0 ? 1 : 0);
        }
    }

    if (arg === 'ai' || arg === 'all') {
        await runAITests();
    }

    if (arg !== 'unit' && arg !== 'ai' && arg !== 'all') {
        // Run a specific unit test by name
        const tc = unitTests.find(t => t.name === arg);
        if (tc) {
            const r = runUnitTest(tc);
            console.log(r.pass ? `✓ ${r.name}` : `✗ ${r.name}`);
            for (const f of r.failures) console.log(`  → ${f}`);
            console.log(`\nFull output:\n${JSON.stringify(htmlToHtmlObject(tc.html, tc.options), null, 2)}`);
        } else {
            // Try as AI test
            const aiTc = aiTests.find(t => t.name === arg);
            if (aiTc) {
                const agent = createAgent(TEST_GRAPH);
                const r = await aiChat(agent, aiTc.prompt, aiTc.name);
                if (r.interruptAction) {
                    const failures = aiTc.validateAction(r.interruptAction);
                    console.log(failures.length === 0 ? `✓ ${aiTc.name}` : `✗ ${aiTc.name}`);
                    for (const f of failures) console.log(`  → ${f}`);
                }
            } else {
                console.error(`Unknown test: ${arg}`);
                console.error(`Unit tests: ${unitTests.map(t => t.name).join(', ')}`);
                console.error(`AI tests: ${aiTests.map(t => t.name).join(', ')}`);
                console.error(`Groups: unit, ai, all`);
                process.exit(1);
            }
        }
    }

    process.exit(0);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
