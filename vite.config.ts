import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 8080,
  },
  build: {
    target: 'esnext',
  },
  assetsInclude: ['**/*.wgsl'],
});
