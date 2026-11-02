import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// `vite build --mode artifact` produces one self-contained script (Vue loaded from cdnjs,
// chart image inlined) that scripts/make-artifact.mjs wraps into a single HTML page.
export default defineConfig(({ mode }) => {
  const artifact = mode === 'artifact'
  return {
    plugins: [vue()],
    base: './',
    build: artifact
      ? {
          outDir: 'dist-artifact',
          assetsInlineLimit: 100_000_000,
          cssCodeSplit: false,
          rollupOptions: {
            input: 'src/main.ts',
            external: ['vue'],
            output: { format: 'iife', globals: { vue: 'Vue' }, entryFileNames: 'app.js', assetFileNames: 'app.[ext]', inlineDynamicImports: true },
          },
        }
      : { outDir: 'dist' },
  }
})
