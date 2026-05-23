import { defineConfig } from 'vitest/config'
import PdfReporter from 'vitest-pdf-reporter'

export default defineConfig({
  test: {
    include: ['tests/**/*.spec.ts'],
    reporters: [
      'default',
      new PdfReporter({
        outputFile: './test-reports/spec.pdf',
        // Labels in the rendered PDF (Pass Rate, Failures, Contents…) are
        // always English. Content — title, project name, version, test
        // names from your describes — flows through verbatim and may be
        // written in any language.
        title: 'ユーザー管理API テスト仕様書',
        projectName: 'Acme Auth Service',
        version: '0.1.0',
      }),
    ],
  },
})
