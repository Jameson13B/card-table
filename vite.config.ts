import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev, the Hono API runs on :8787 (see `npm run dev`) and Vite proxies to it.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    proxy: { '/api': 'http://localhost:8787' },
  },
});
