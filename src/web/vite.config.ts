import { defineConfig } from 'vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [],
  base: './',
  build: {
    outDir: '../../dist/web',
    emptyOutDir: true,
  },
})
