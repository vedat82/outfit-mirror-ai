import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import clientPackage from './package.json' with { type: 'json' };

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(clientPackage.version)
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
      '^/payment(/|$)': 'http://localhost:4000',
      '/ai': 'http://localhost:4000'
    }
  }
});
