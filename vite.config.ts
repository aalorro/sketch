import { defineConfig } from 'vite';

export default defineConfig({
  base: '/sketch/',
  server: {
    port: 8080,
  },
  build: {
    target: 'esnext',
  },
  assetsInclude: ['**/*.wgsl'],
});
