import { defineConfig } from 'astro/config'

export default defineConfig({
  site: 'https://yukiyokotani.github.io',
  base: '/vitest-pdf-reporter',
  output: 'static',
  trailingSlash: 'never',
  build: {
    assets: 'assets',
  },
})
