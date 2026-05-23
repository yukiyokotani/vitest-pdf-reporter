import { defineConfig } from 'vitest/config'
import PdfReporter from 'vitest-pdf-reporter'

export default defineConfig({
  test: {
    include: ['tests/**/*.spec.ts'],
    reporters: [
      'default',
      new PdfReporter({
        outputFile: './test-reports/spec.pdf',
        title: 'User Management API — Test Specification',
        projectName: 'Acme Auth Service',
        version: '0.1.0',
      }),
    ],
  },
})
