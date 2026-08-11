import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // API'ye vekil: tarayıcı her şeyi aynı origin'den görüyor, dolayısıyla
    // cookie'ler için CORS ve SameSite ayarıyla uğraşmak gerekmiyor.
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
});
