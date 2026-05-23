import type { Reporter } from 'vitest/reporters'
import { collectSpecDocument, type TaskLike } from './collector'
import { renderToPdf } from './renderer'
import { transformToView } from './transformer'
import type { PdfReporterOptions, ResolvedPdfReporterOptions } from './types'

const DEFAULTS = {
  outputFile: './test-report.pdf',
  title: 'Test Specification',
  paperSize: 'A4' as const,
  orientation: 'portrait' as const,
  includeCoverPage: true,
  includeTableOfContents: true,
  includeStackTrace: true,
  theme: 'default' as const,
} satisfies Partial<ResolvedPdfReporterOptions>

export function resolveOptions(opts: PdfReporterOptions = {}): ResolvedPdfReporterOptions {
  const resolved: ResolvedPdfReporterOptions = {
    outputFile: opts.outputFile ?? DEFAULTS.outputFile,
    title: opts.title ?? DEFAULTS.title,
    paperSize: opts.paperSize ?? DEFAULTS.paperSize,
    orientation: opts.orientation ?? DEFAULTS.orientation,
    includeCoverPage: opts.includeCoverPage ?? DEFAULTS.includeCoverPage,
    includeTableOfContents: opts.includeTableOfContents ?? DEFAULTS.includeTableOfContents,
    includeStackTrace: opts.includeStackTrace ?? DEFAULTS.includeStackTrace,
    theme: opts.theme ?? DEFAULTS.theme,
  }
  if (opts.projectName !== undefined) resolved.projectName = opts.projectName
  if (opts.version !== undefined) resolved.version = opts.version
  if (opts.customCss !== undefined) resolved.customCss = opts.customCss
  if (opts.logoPath !== undefined) resolved.logoPath = opts.logoPath
  return resolved
}

/**
 * Vitest custom reporter that produces a typeset PDF spec document.
 *
 * Usage:
 *
 *   // vitest.config.ts
 *   import { defineConfig } from 'vitest/config'
 *   import PdfReporter from 'vitest-pdf-reporter'
 *
 *   export default defineConfig({
 *     test: {
 *       reporters: [
 *         'default',
 *         new PdfReporter({ outputFile: './reports/spec.pdf', title: 'My Spec' }),
 *       ],
 *     },
 *   })
 */
export default class PdfReporter implements Reporter {
  private readonly options: ResolvedPdfReporterOptions
  private logger: { log: (msg: string) => void; warn: (msg: string) => void } = console

  constructor(options: PdfReporterOptions = {}) {
    this.options = resolveOptions(options)
  }

  /** Called once when Vitest boots. We grab the logger for nicer output. */
  onInit(ctx?: unknown) {
    const maybe = ctx as { logger?: { log: (m: string) => void; warn: (m: string) => void } } | undefined
    if (typeof maybe?.logger?.log === 'function' && typeof maybe.logger.warn === 'function') {
      this.logger = maybe.logger
    }
  }

  /**
   * Called after the entire run completes. We get the final task tree here.
   * Vitest passes `files: RunnerTestFile[]` — structurally compatible with
   * our `TaskLike[]`.
   */
  async onFinished(files: unknown[] = []) {
    try {
      const doc = collectSpecDocument(files as TaskLike[])
      const view = transformToView(doc, this.options)
      const path = await renderToPdf({ view, options: this.options })
      this.logger.log(`\n  📄 PDF report written: ${path}\n`)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.logger.warn(`\n  ⚠ vitest-pdf-reporter: failed to generate PDF — ${message}\n`)
    }
  }
}

export { PdfReporter }
