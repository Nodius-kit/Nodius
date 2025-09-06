
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import JsxVitePlugin from "./src/client/jsx-runtime/jsx-VitePlugin";

export default defineConfig({
    plugins: [/*JsxVitePlugin()*/],
    esbuild: {
        jsxImportSource: 'jsx'
    },

    build: {
        outDir: "export"
    },
    publicDir: "src/client/public",
});