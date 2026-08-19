import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// Paketli sürüme sıkı CSP enjekte eder (dev'de HMR inline script'leri için uygulanmaz).
// img https: → sunucu ikonları (mcstatus data:), skin servisleri, mod ikonları.
const cspPlugin = () => ({
  name: 'hlauncher-csp',
  transformIndexHtml: {
    order: 'post',
    handler(html, ctx) {
      if (ctx.server) return html // dev
      const csp = [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' https: data:",
        "font-src 'self'",
        "connect-src 'self' https://api.mcstatus.io",
        "object-src 'none'",
        "base-uri 'self'",
      ].join('; ')
      return html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`)
    },
  },
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), cspPlugin()],
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
    emptyOutDir: true,
    // three.js (skinview3d) tek parçada ~700KB; masaüstü uygulamada sorun değil
    chunkSizeWarningLimit: 1200
  }
})

