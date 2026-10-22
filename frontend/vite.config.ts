import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// Renderer base is relative so the production build can be loaded from
// file:// inside Electron (build/renderer/index.html).
export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      // Browser development talks to the local backend through the Vite
      // proxy (production Electron uses the IPC bridge instead).
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: 'build/renderer',
    emptyOutDir: true,
    sourcemap: false,
  },
})
