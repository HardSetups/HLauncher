import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    // IPv4'e sabit: wait-on ve Electron 127.0.0.1 bekliyor; bazı makinelerde
    // 'localhost' yalnızca IPv6'ya (::1) bağlanıyor ve Electron hiç açılmıyordu.
    host: '127.0.0.1',
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

