import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.js', 'src/runtime/main.js'],
  format: ['cjs', 'esm'],
  exports: true,
})
