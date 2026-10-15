import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// dev/preview: the Laravel API runs on `php artisan serve` (port 8000) with routes at its root
// (production: https://api.nongtrai.io.vn/farm). Proxying same-origin /api/* avoids CORS locally.
const apiProxy = {
  '/api': { target: process.env.API_PROXY ?? 'http://127.0.0.1:8000', changeOrigin: true, rewrite: (p: string) => p.replace(/^\/api/, '') },
};

export default defineConfig({
  plugins: [react()],
  server: {
    // shared/economy.json lives one level up, next to the Laravel app
    fs: { allow: ['..'] },
    proxy: apiProxy,
  },
  preview: {
    proxy: apiProxy,
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      output: {
        manualChunks: { babylon: ['@babylonjs/core'] },
      },
    },
  },
});
