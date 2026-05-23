# vitest-pdf-reporter

> A Vitest custom reporter that renders your test suite as a typeset PDF spec document — strict grid, editorial typography, and a single sharp accent color.

Turn your `describe` / `it` hierarchy into a **single-source-of-truth specification** that's safe to ship to customers. Test code stays the spec; the PDF is regenerated automatically on every run.

![cover preview](docs/preview/cover.png)

## Why

- **Tests *are* the spec.** Stop double-maintaining a Word file alongside your test suite.
- **Shippable.** A4 PDF you can hand to a client, attach to a release, or print.
- **Designed.** shadcn-inspired editorial layout — donut pass-rate gauge on the cover, KPI cards with mini progress bars, pill badges. Looks like a real document, not a build log.
- **Rich metadata.** Per-test `task.meta` is rendered as requirement IDs, priority badges, preconditions, and notes.
- **Failure-aware.** Failing tests are highlighted; error messages, diffs, and trimmed stack traces are included inline. The cover links straight to each failure.
- **Content is yours.** Titles, project names, describes, and metadata flow through verbatim and accept any language. Structural labels (Pass Rate, Failures, Contents…) are fixed English.

## Installation

```bash
pnpm add -D vitest-pdf-reporter playwright
pnpm exec playwright install chromium
```

Peer dependencies: `vitest >= 2.0`, `playwright >= 1.40`, Node.js `>= 18`.

## Quick start

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import PdfReporter from 'vitest-pdf-reporter'

export default defineConfig({
  test: {
    reporters: [
      'default',
      new PdfReporter({
        outputFile: './test-reports/spec.pdf',
        title: 'User Management API — Spec',
        projectName: 'Acme Auth Service',
        version: '1.2.0',
      }),
    ],
  },
})
```

Run your tests, and the PDF lands at `./test-reports/spec.pdf`.

## Writing tests that read like a spec

`describe` / `it` become section / subsection / test rows. Use `task.meta` to attach spec-only metadata that the PDF picks up.

```ts
import { describe, expect, it } from 'vitest'

describe('User Management API', () => {
  describe('POST /users — Create user', () => {
    describe('Happy path', () => {
      it('creates a user with just the required fields', ({ task }) => {
        task.meta.requirementId = 'REQ-USER-001'
        task.meta.priority = 'high'
        task.meta.category = 'normal'
        task.meta.precondition = 'email is unused'
        task.meta.description = 'email and name returns a new user; id is auto-assigned.'
        // ...
      })
    })

    describe('Edge cases', () => {
      it('returns 409 when the email already exists', ({ task }) => {
        task.meta.requirementId = 'REQ-USER-002'
        task.meta.priority = 'high'
        task.meta.category = 'edge'
        // ...
      })
    })
  })
})
```

### Recognized `task.meta` keys

All optional.

| Key | Rendered as |
|---|---|
| `requirementId` | Requirement chip next to the test name |
| `priority` | Color-coded priority badge (`high` / `medium` / `low` — also `高` / `中` / `低`) |
| `category` | Category chip |
| `precondition` | Inline annotation below the test |
| `description` | Sub-text below the test name |
| `note` | Inline annotation below the test |

Unknown keys are preserved on the `SpecMeta` object — useful if you bring your own template via `customCss`.

## Options

```ts
new PdfReporter({
  outputFile: './test-reports/spec.pdf',      // default: './test-report.pdf'
  title: 'My Test Spec',                       // cover title
  projectName: 'Acme',                         // cover header + footer
  version: '1.2.0',                            // shown under the title
  paperSize: 'A4',                             // 'A4' | 'Letter'
  orientation: 'portrait',                     // 'portrait' | 'landscape'
  includeCoverPage: true,
  includeTableOfContents: true,
  includeStackTrace: true,                     // include trimmed stack in failures
  theme: 'default',                            // 'default' | 'minimal'
  customCss: '.cover-title__h1 { color: hotpink }', // append to the built-in stylesheet
  logoPath: undefined,                         // reserved
})
```

## Design notes

The default theme is built around four ideas:

1. **A strict modular grid.** All sections share the same left/right margins; section numbers live in a fixed column so the eye can scan vertical rules.
2. **One accent color.** `#e94560` is used only for: cover accent bar, the headline pass-rate number, top-level section numbers, and failure highlights. Everything else is gray-scale.
3. **Tabular numerals.** All numbers (durations, page numbers, pass rate, stat grid) use `font-variant-numeric: tabular-nums` so columns visually align without effort.
4. **Hairline grouping.** Sub-sections are separated by 0.5px hairlines; top-level sections start on a fresh page with a bolder rule.

Switch to `theme: 'minimal'` to drop the crimson accent in favor of pure achromatic editorial.

## Architecture

```
src/
  index.ts        — public exports
  reporter.ts     — Vitest Reporter implementation (onFinished hook)
  collector.ts    — walks Vitest's task tree → SpecDocument
  transformer.ts  — SpecDocument → numbered view model + TOC
  templates.ts    — view model → HTML + CSS + Playwright footer template
  renderer.ts     — Playwright Chromium → PDF on disk
  types.ts        — shared type contracts
```

Each stage is pure and independently testable; the only side-effectful piece is `renderer.ts`. See `tests/` for unit tests against the contract types.

## Example

See [`examples/basic/`](./examples/basic/) for a runnable example. The generated PDF lives under `examples/basic/test-reports/spec.pdf` after `pnpm --filter vitest-pdf-reporter-example test`.

## Development

```bash
just install      # pnpm install + playwright install chromium
just test         # unit tests
just typecheck    # tsc --noEmit
just build        # tsup → dist/
just example      # build + run the example, producing a PDF
```

## License

MIT
