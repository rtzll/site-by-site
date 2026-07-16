import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    outDir: 'dist/client',
    rollupOptions: {
      input: './app/assets/entry.ts',
      output: {
        entryFileNames: 'assets/entry.js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
})
