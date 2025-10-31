
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
    plugins: [react()],

    build: {
        outDir: "export"
    },
    publicDir: "src/client/public",
    server: {
        host: "0.0.0.0",
    }
});