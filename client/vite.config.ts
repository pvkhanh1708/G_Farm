import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // shared/economy.json lives one level up, next to the Laravel app
    fs: { allow: ['..'] },
    // dev: the Laravel API runs on `php artisan serve` (port 8000); same-origin /api avoids CORS
    proxy: { '/api': { target: process.env.API_PROXY ?? 'http://127.0.0.1:8000', changeOrigin: true } },
  },
  preview: {
    proxy: { '/api': { target: process.env.API_PROXY ?? 'http://127.0.0.1:8000', changeOrigin: true } },
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
