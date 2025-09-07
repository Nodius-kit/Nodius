
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
//import JsxVitePlugin from "nodius_jsx/jsx-VitePlugin";

import customJsxPlugin from "./src/JsxVitePlugin2";

export default defineConfig({
    plugins: [customJsxPlugin()],
    esbuild: {
        jsxImportSource: 'nodius_jsx'
    },

    build: {
        outDir: "export"
    },
    publicDir: "src/client/public",
});