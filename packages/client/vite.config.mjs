import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

export default defineConfig(({ mode }) => {
    // Load env file from root directory
    const env = loadEnv(mode, process.cwd(), '');

    // Check if HTTPS is enabled
    const useHttps = env.VITE_USE_HTTPS === 'true';

    // HTTPS configuration
    let httpsConfig = undefined;
    if (useHttps) {
        const certsDir = path.join(process.cwd(), 'certs');
        const keyPath = path.join(certsDir, 'server.key');
        const certPath = path.join(certsDir, 'server.crt');

        if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
            httpsConfig = {
                key: fs.readFileSync(keyPath),
                cert: fs.readFileSync(certPath)
            };
            console.log('Vite: Using HTTPS with certificates from', certsDir);
        } else {
            console.warn('Vite: HTTPS enabled but certificates not found in', certsDir);
        }
    }

    return {
        plugins: [react()],

        build: {
            outDir: "export"
        },
        publicDir: "src/client/public",
        server: {
            host: process.env.VITE_HOST || "localhost",
            https: httpsConfig,
        }
    };
});