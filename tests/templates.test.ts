import { describe, expect, it } from 'vitest'
import { resolveOptions } from '../src/reporter'
import { __internal, renderHtml } from '../src/templates'
import { transformToView } from '../src/transformer'
import type { SpecDocument } from '../src/types'

const baseDoc = (): SpecDocument => ({
  generatedAt: new Date('2026-05-23T01:00:00Z'),
  roots: [
    {
      kind: 'group',
      name: 'sample.spec.ts',
      filePath: 'sample.spec.ts',
      children: [
        {
          kind: 'group',
          name: 'Feature <X>',
          children: [
            {
              kind: 'case',
              name: 'does the thing',
              status: 'pass',
              durationMs: 12,
              filePath: 'sample.spec.ts',
              meta: { requirementId: 'REQ-001', priority: '高', category: '正常系' },
            },
            {
              kind: 'case',
              name: 'fails badly',
              status: 'fail',
              durationMs: 5,
              filePath: 'sample.spec.ts',
              meta: {},
              error: { message: 'expected 1 to be 2', stack: 'at file.ts:10' },
            },
          ],
        },
      ],
    },
  ],
  summary: {
    total: 2,
    passed: 1,
    failed: 1,
    skipped: 0,
    todo: 0,
    passRate: 0.5,
    durationMs: 17,
    fileCount: 1,
  },
})

describe('renderHtml', () => {
  it('produces a complete HTML document with cover, toc, and sections', () => {
    const opts = resolveOptions({ title: 'My Spec', projectName: 'Acme', version: '1.0.0' })
    const view = transformToView(baseDoc(), opts)
    const html = renderHtml({ view, options: opts })

    expect(html).toMatch(/^<!doctype html>/)
    expect(html).toContain('<title>My Spec</title>')
    expect(html).toContain('Acme')
    expect(html).toContain('v1.0.0')
    // Localized heading (default locale is English) + ASCII anchor.
    expect(html).toContain('Contents')
    expect(html).toContain(`id="toc"`)
    // Section title is HTML-escaped
    expect(html).toContain('Feature &lt;X&gt;')
    // Error rendered
    expect(html).toContain('expected 1 to be 2')
    // Stack trace block in the error component
    expect(html).toContain('STACK TRACE')
  })

  it('emits intra-document anchor links for navigation', () => {
    const opts = resolveOptions({ title: 'Linked', projectName: 'Acme' })
    const view = transformToView(baseDoc(), opts)
    const html = renderHtml({ view, options: opts })

    // TOC entries are wrapped in anchor links pointing at section ids.
    const firstSectionId = view.sections[0]!.id
    expect(html).toContain(`href="#${firstSectionId}"`)
    // Cover stat "Failed" tile links to the failures index since baseDoc
    // contains one failure.
    expect(html).toContain('href="#failures"')
    // Cover stat "Total" tile links to the TOC anchor.
    expect(html).toContain('href="#toc"')
    // Failures index links to the failing case anchor.
    const failingCaseId = view.failures[0]!.caseId
    expect(html).toContain(`href="#${failingCaseId}"`)
  })

  it('omits the failures index when there are no failures', () => {
    const passOnlyDoc = {
      ...baseDoc(),
      roots: [
        {
          kind: 'group' as const,
          name: 'ok.spec.ts',
          filePath: 'ok.spec.ts',
          children: [
            {
              kind: 'case' as const,
              name: 'ok',
              status: 'pass' as const,
              durationMs: 1,
              filePath: 'ok.spec.ts',
              meta: {},
            },
          ],
        },
      ],
      summary: { total: 1, passed: 1, failed: 0, skipped: 0, todo: 0, passRate: 1, durationMs: 1, fileCount: 1 },
    }
    const opts = resolveOptions({})
    const view = transformToView(passOnlyDoc, opts)
    const html = renderHtml({ view, options: opts })
    expect(html).not.toContain('class="page page--failures"')
    // The "Failed" tile is rendered as a plain div, not a link.
    expect(html).not.toMatch(/href="#failures"/)
  })

  it('omits cover and toc when disabled', () => {
    const opts = resolveOptions({ includeCoverPage: false, includeTableOfContents: false })
    const view = transformToView(baseDoc(), opts)
    const html = renderHtml({ view, options: opts })
    expect(html).not.toContain('class="page page--cover"')
    expect(html).not.toContain('class="page page--toc"')
  })

  it('honors theme switch', () => {
    const opts = resolveOptions({ theme: 'minimal' })
    const view = transformToView(baseDoc(), opts)
    const html = renderHtml({ view, options: opts })
    // In minimal mode destructive is collapsed to the same hue as primary.
    expect(html).toContain('--destructive: 240 5.9% 10%')
  })

  it('appends customCss after base styles', () => {
    const opts = resolveOptions({ customCss: '.cover__title { color: pink }' })
    const view = transformToView(baseDoc(), opts)
    const html = renderHtml({ view, options: opts })
    expect(html).toMatch(/customCss[\s\S]*color: pink/)
  })

  it('escapes user-controlled text', () => {
    expect(__internal.esc('<script>')).toBe('&lt;script&gt;')
    expect(__internal.esc(`"a'b"`)).toBe('&quot;a&#39;b&quot;')
  })

  it('formats durations', () => {
    expect(__internal.fmtDuration(123)).toBe('123ms')
    expect(__internal.fmtDuration(1500)).toBe('1.50s')
  })
})
