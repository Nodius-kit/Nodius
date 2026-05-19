/**
 * build-nodius-bundle.mjs
 * Produit /packages/client/src/client/public/vendors/nodius-wysiwyg.js
 * Usage : node build-nodius-bundle.mjs  (depuis la racine du monorepo)
 */

import { build } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, writeFileSync, mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

const ENTRY_FILE = resolve(__dirname, 'nodius-editor-entry.js');
const OUT_DIR    = resolve(__dirname, 'packages', 'client', 'src', 'client', 'public', 'vendors');

console.log('📂  Racine         :', __dirname);
console.log('📄  Entry          :', ENTRY_FILE);
console.log('📦  Output         :', OUT_DIR);

mkdirSync(OUT_DIR, { recursive: true });

if (!existsSync(ENTRY_FILE)) {
  writeFileSync(ENTRY_FILE, `export * from '@nodius/editor';\n`, 'utf8');
  console.log('⚙️   nodius-editor-entry.js créé automatiquement.');
}

const pkgPath = resolve(__dirname, 'node_modules', '@nodius', 'editor');
if (!existsSync(pkgPath)) {
  console.error('❌  @nodius/editor introuvable. Lancez : npm install github:Nodius-kit/Nodius_WYSIWYG');
  process.exit(1);
}

await build({
  configFile: false,
  root: __dirname,
  build: {
    outDir: OUT_DIR,
    emptyOutDir: false,
    lib: {
      entry: ENTRY_FILE,
      name: 'NodiusEditor',       // → window.NodiusEditor
      formats: ['iife'],
      fileName: () => 'nodius-wysiwyg.js',   // correspondance avec script.src
    },
    sourcemap: true,
    minify: 'esbuild',
    rollupOptions: { external: [] },
  },
});

console.log('\n✅  Bundle prêt → packages/client/src/client/public/vendors/nodius-wysiwyg.js');
console.log('    Accessible depuis le navigateur via : /vendors/nodius-wysiwyg.js');
