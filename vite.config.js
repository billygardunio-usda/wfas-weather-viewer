import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: {
        weather: fileURLToPath(new URL('./index.html', import.meta.url)),
        hawaii: fileURLToPath(new URL('./hawaii/index.html', import.meta.url)),
      },
    },
  },
});