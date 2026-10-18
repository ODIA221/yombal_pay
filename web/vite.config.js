import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const api = 'http://localhost:3000';
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/v1': api, '/l/': api, '/sdk': api, '/webhooks': api, '/.well-known': api, '/lnurlp': api },
  },
});
