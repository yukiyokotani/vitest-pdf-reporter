import { mkdir } from 'node:fs/promises'
import { dirname, isAbsolute, resolve as resolvePath } from 'node:path'
import { pathToFileURL } from 'node:url'
import { renderFooterTemplate, renderHeaderTemplate, renderHtml } from './templates'
import type { ResolvedPdfReporterOptions } from './types'
import type { View } from './transformer'

/**
 * Dynamic import wrapper for Playwright so that the package can be installed
 * without forcing every consumer to immediately set up Chromium. The peer
 * dependency declaration in package.json documents the requirement; this
 * function gives a clear error if it's missing.
 */
async function loadPlaywright(): Promise<typeof import('playwright')> {
  try {
    return await import('playwright')
  } catch (err) {
    const e = err as NodeJS.ErrnoException
    throw new Error(
      'vitest-pdf-reporter: failed to load `playwright`. Install it as a dev dependency:\n' +
        '  pnpm add -D playwright\n' +
        '  pnpm exec playwright install chromium\n' +
        `Underlying error: ${e.message}`,
    )
  }
}

export interface RenderToPdfInput {
  view: View
  options: ResolvedPdfReporterOptions
}

/**
 * Generate a PDF on disk and return the resolved output path.
 *
 * Lifecycle:
 *   1. Render HTML from the view + options.
 *   2. Launch headless Chromium once.
 *   3. Load the HTML via `setContent` and wait for fonts.
 *   4. Emit PDF with the configured paper size / orientation / margins.
 *   5. Close the browser.
 */
export async function renderToPdf({ view, options }: RenderToPdfInput): Promise<string> {
  const html = renderHtml({ view, options })

  const outFile = isAbsolute(options.outputFile)
    ? options.outputFile
    : resolvePath(process.cwd(), options.outputFile)
  await mkdir(dirname(outFile), { recursive: true })

  const pw = await loadPlaywright()
  const browser = await pw.chromium.launch()
  try {
    const context = await browser.newContext()
    const page = await context.newPage()

    // Optional logo: load from local disk by converting to a file:// URL we
    // can reference from HTML if customizers want to. We just set baseURL to
    // cwd so relative paths in customCss resolve.
    await page.setContent(html, { waitUntil: 'networkidle' })
    await page.emulateMedia({ media: 'print' })

    // Ensure web fonts are flushed before snapshot.
    await page.evaluate(async () => {
      const fonts = (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts
      if (fonts?.ready) await fonts.ready
    })

    await page.pdf({
      path: outFile,
      format: options.paperSize,
      landscape: options.orientation === 'landscape',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: renderHeaderTemplate(),
      footerTemplate: renderFooterTemplate(view),
      margin: { top: '18mm', bottom: '20mm', left: '16mm', right: '16mm' },
      preferCSSPageSize: false,
    })
  } finally {
    await browser.close()
  }

  // Touch the file URL so callers can log/open easily.
  void pathToFileURL(outFile)
  return outFile
}
