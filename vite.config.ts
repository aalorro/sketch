import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 8080,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5001',
        changeOrigin: true,
      },
    },
  },
  build: {
    target: 'esnext',
  },
  assetsInclude: ['**/*.wgsl'],
});
