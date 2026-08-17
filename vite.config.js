import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      // electron-builder çıktıları izlenmesin — paketleme sırasında EBUSY çökmesini önler
      ignored: ['**/release/**', '**/installer/**'],
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
})

