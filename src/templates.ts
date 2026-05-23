import type { ResolvedPdfReporterOptions, SpecMeta, SpecSummary, TestStatus } from './types'
import type { View, ViewCase, ViewFailure, ViewSection } from './transformer'

const FAILURES_ANCHOR = 'failures'
const TOC_ANCHOR = 'toc'

/* -------------------------------------------------------------------------- */
/*  HTML escaping                                                              */
/* -------------------------------------------------------------------------- */

const ESC: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}
function esc(s: string | number | undefined | null): string {
  if (s === undefined || s === null) return ''
  return String(s).replace(/[&<>"']/g, (c) => ESC[c] ?? c)
}

/* -------------------------------------------------------------------------- */
/*  Formatters                                                                 */
/* -------------------------------------------------------------------------- */

function fmtDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fmtDuration(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`
  return `${Math.round(ms)}ms`
}

function statusBadgeVariant(s: TestStatus): string {
  // Each status maps to a tinted variant: green / red / gray / neutral.
  // The variant tints the badge border + icon accent; text stays black.
  switch (s) {
    case 'pass': return 'badge--success'
    case 'fail': return 'badge--destructive'
    case 'skip': return 'badge--muted'
    case 'todo': return 'badge--outline'
  }
}

function statusLabel(s: TestStatus): string {
  return ({ pass: 'PASS', fail: 'FAIL', skip: 'SKIP', todo: 'TODO' } as const)[s]
}

function priorityVariant(_priority: string | undefined): string {
  // Priority chips are plain outline like every other metadata chip.
  // The text content itself ("P 高" / "P 中" / "P 低") communicates the
  // level; visual color emphasis was overkill for non-status info.
  return 'badge--outline'
}

/* -------------------------------------------------------------------------- */
/*  Labels — fixed English strings.                                            */
/* -------------------------------------------------------------------------- */

const L = {
  docKind: 'TEST SPECIFICATION',
  passRate: 'PASS RATE',
  total: 'TOTAL',
  passed: 'PASSED',
  failed: 'FAILED',
  skipped: 'SKIPPED',
  todo: 'TODO',
  duration: 'DURATION',
  files: 'FILES',
  contents: 'CONTENTS',
  generated: 'Generated',
  metaReq: 'REQ ID',
  metaCategory: 'CATEGORY',
  metaPriority: 'PRIORITY',
  metaPrecondition: 'Precondition',
  metaNote: 'Note',
  error: 'ERROR',
  stack: 'STACK TRACE',
  diff: 'DIFF',
  failures: 'FAILURES',
  failuresLede: 'Tests that did not pass. Click any row to jump to the detail.',
  viewAll: 'View all →',
  intro: 'Auto-generated specification — from your test suite.',
} as const

/* -------------------------------------------------------------------------- */
/*  Status badge as a shadcn Badge with lucide-style icon                      */
/* -------------------------------------------------------------------------- */

/**
 * Lucide `CircleCheck` / `CircleX` / `CircleMinus` / `CircleQuestionMark` /
 * `CircleAlert` rendered in filled style: a solid circle painted with
 * `currentColor` (the accent set by the parent variant) and the inner
 * symbol stroked in white on top.
 */
const CIRCLE = '<circle cx="12" cy="12" r="10" fill="currentColor" stroke="none"/>'

function wrapIcon(children: string): string {
  return `<svg class="badge__icon" viewBox="0 0 24 24" aria-hidden="true">${children}</svg>`
}

function whiteStrokes(paths: string[]): string {
  return paths
    .map(
      (d) =>
        `<path d="${d}" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
    )
    .join('')
}

function statusIcon(s: TestStatus): string {
  switch (s) {
    case 'pass':
      return wrapIcon(CIRCLE + whiteStrokes(['m9 12 2 2 4-4']))
    case 'fail':
      return wrapIcon(CIRCLE + whiteStrokes(['m15 9-6 6', 'm9 9 6 6']))
    case 'skip':
      return wrapIcon(CIRCLE + whiteStrokes(['M8 12h8']))
    case 'todo':
      return wrapIcon(
        CIRCLE +
          whiteStrokes(['M9.1 9a3 3 0 0 1 5.82 1c0 2-3 3-3 3']) +
          '<circle cx="12" cy="17" r="0.9" fill="white"/>',
      )
  }
}

function errorIcon(): string {
  return wrapIcon(
    CIRCLE +
      whiteStrokes(['M12 8v4']) +
      '<circle cx="12" cy="16" r="0.9" fill="white"/>',
  )
}

function statusBadge(s: TestStatus): string {
  return `<span class="badge ${statusBadgeVariant(s)}">${statusIcon(s)}${statusLabel(s)}</span>`
}

/* -------------------------------------------------------------------------- */
/*  SVG donut gauge                                                            */
/* -------------------------------------------------------------------------- */

function gauge(view: View): string {
  const { summary } = view
  const pct = Math.max(0, Math.min(100, summary.passRate * 100))
  const C = 314.159
  const dash = (pct / 100) * C
  const fillClass = summary.failed > 0
    ? 'gauge__fill gauge__fill--destructive'
    : summary.total === 0
      ? 'gauge__fill gauge__fill--muted'
      : 'gauge__fill gauge__fill--success'

  return `
<div class="gauge">
  <svg viewBox="0 0 120 120" aria-hidden="true">
    <circle class="gauge__track" cx="60" cy="60" r="50" fill="none" stroke-width="8"/>
    <circle class="${fillClass}" cx="60" cy="60" r="50" fill="none"
      stroke-width="8" stroke-linecap="round"
      stroke-dasharray="${dash.toFixed(2)} ${C.toFixed(2)}"
      transform="rotate(-90 60 60)"/>
  </svg>
  <div class="gauge__center">
    <div class="gauge__num"><span>${pct.toFixed(1)}</span><span class="gauge__pct">%</span></div>
    <div class="gauge__sub">${summary.passed} / ${summary.total}</div>
  </div>
</div>`
}

/* -------------------------------------------------------------------------- */
/*  Cover                                                                      */
/* -------------------------------------------------------------------------- */

function pctOf(n: number, total: number): number {
  if (total === 0) return 0
  return (n / total) * 100
}

function renderCover(view: View): string {
  const { summary } = view
  const hasFailures = summary.failed > 0
  const hasToc = view.options.includeTableOfContents && view.toc.length > 0
  const pct = Math.max(0, Math.min(100, summary.passRate * 100))

  const headerMeta = [
    view.projectName,
    view.version ? `v${view.version}` : null,
    fmtDate(view.generatedAt),
  ]
    .filter(Boolean)
    .map((s) => esc(String(s)))
    .join(' · ')

  const subParts: string[] = [`${summary.passed} of ${summary.total} tests passed`]
  if (summary.failed) subParts.push(`${summary.failed} failed`)
  if (summary.skipped) subParts.push(`${summary.skipped} skipped`)
  if (summary.todo) subParts.push(`${summary.todo} todo`)
  const subLine = subParts.join(' · ')

  const dataCell = (label: string, value: string | number, anchor?: string, variant?: 'is-fail' | 'is-mono') => {
    const inner = `
      <div class="cover-data__label">${esc(label)}</div>
      <div class="cover-data__num ${variant ?? ''}">${esc(value)}</div>`
    return anchor
      ? `<a class="cover-data__cell cover-data__cell--link" href="#${anchor}">${inner}<span class="cover-data__arrow">→</span></a>`
      : `<div class="cover-data__cell">${inner}</div>`
  }

  return `
<section class="page page--cover">
  <div class="cover-stripe"></div>

  <header class="cover-masthead">
    <span class="eyebrow">${esc(L.docKind)}</span>
    <span class="eyebrow eyebrow--meta">${headerMeta}</span>
  </header>

  <div class="cover-title">
    <h1 class="cover-title__h1">${esc(view.title)}</h1>
    <p class="cover-title__lede">${esc(L.intro)}</p>
  </div>

  <div class="cover-hero">
    <div class="cover-hero__label">${esc(L.passRate)}</div>
    <div class="cover-hero__num ${hasFailures ? 'is-fail' : ''}">
      <span>${pct.toFixed(1)}</span><span class="cover-hero__pct">%</span>
    </div>
    <div class="cover-hero__bar">
      <div class="cover-hero__bar-fill" style="width:${pct.toFixed(2)}%"></div>
    </div>
    <div class="cover-hero__sub">${esc(subLine)}</div>
  </div>

  <div class="cover-data">
    ${dataCell(L.total, summary.total, hasToc ? TOC_ANCHOR : undefined)}
    ${dataCell(L.passed, summary.passed)}
    ${dataCell(L.failed, summary.failed, hasFailures ? FAILURES_ANCHOR : undefined, 'is-fail')}
    ${dataCell(L.skipped, summary.skipped)}
    ${dataCell(L.todo, summary.todo)}
    ${dataCell(L.duration, fmtDuration(summary.durationMs), undefined, 'is-mono')}
  </div>
</section>`
}

/* -------------------------------------------------------------------------- */
/*  Failure row (used by cover preview and standalone failures page)           */
/* -------------------------------------------------------------------------- */

function failureRow(f: ViewFailure): string {
  return `
  <li class="failure-row">
    <a class="failure-row__link" href="#detail-${esc(f.caseId)}">
      ${statusBadge('fail')}
      <div class="failure-row__body">
        <div class="failure-row__top">
          <span class="failure-row__num">${esc(f.sectionNumber)}</span>
          <span class="failure-row__name">${esc(f.name)}</span>
          ${f.requirementId ? `<span class="badge badge--outline mono failure-row__req">${esc(f.requirementId)}</span>` : `<span></span>`}
          <span class="failure-row__arrow">→</span>
        </div>
        <div class="failure-row__path">${esc(f.sectionPath)}</div>
      </div>
    </a>
  </li>`
}

function renderFailuresIndex(view: View): string {
  if (view.failures.length === 0) return ''
  return `
<section id="${FAILURES_ANCHOR}" class="page page--failures">
  <div class="page-header">
    <span class="eyebrow">${esc(L.failures)}</span>
    <h2 class="page-header__h2">Failures</h2>
    <p class="page-header__lede">${esc(L.failuresLede)}</p>
  </div>
  <div class="card failures-card">
    <ol class="failures-list">
      ${view.failures.map((f) => failureRow(f)).join('')}
    </ol>
  </div>
</section>`
}

/* -------------------------------------------------------------------------- */
/*  Table of contents                                                          */
/* -------------------------------------------------------------------------- */

function renderToc(view: View): string {
  if (view.toc.length === 0) return ''
  const items = view.toc
    .map(
      (e) => `
    <li class="toc-row toc-row--d${Math.min(e.depth, 4)}">
      <a class="toc-row__link" href="#${esc(e.id)}">
        <span class="toc-row__num">${esc(e.number)}</span>
        <span class="toc-row__name">${esc(e.name)}</span>
      </a>
    </li>`,
    )
    .join('')
  return `
<section id="${TOC_ANCHOR}" class="page page--toc">
  <div class="page-header">
    <span class="eyebrow">${esc(L.contents)}</span>
    <h2 class="page-header__h2">Contents</h2>
  </div>
  <ol class="toc">${items}</ol>
</section>`
}

/* -------------------------------------------------------------------------- */
/*  Section header + cases                                                     */
/* -------------------------------------------------------------------------- */

function chips(meta: SpecMeta): string {
  const out: string[] = []
  if (meta.requirementId) {
    out.push(`<span class="badge badge--outline mono">${esc(String(meta.requirementId))}</span>`)
  }
  if (meta.category) {
    out.push(`<span class="badge badge--outline">${esc(String(meta.category))}</span>`)
  }
  if (meta.priority) {
    out.push(`<span class="badge ${priorityVariant(String(meta.priority))}">P ${esc(String(meta.priority))}</span>`)
  }
  return out.length > 0 ? `<div class="case__chips">${out.join('')}</div>` : ''
}

function renderError(c: ViewCase, includeStack: boolean): string {
  if (!c.error) return ''
  const stack = includeStack && c.error.stack
    ? `
      <div class="error__section">
        <div class="error__label">${esc(L.stack)}</div>
        <pre class="error__pre">${esc(c.error.stack)}</pre>
      </div>`
    : ''
  const diff = c.error.diff
    ? `
      <div class="error__section">
        <div class="error__label">${esc(L.diff)}</div>
        <pre class="error__pre error__pre--diff">${esc(c.error.diff)}</pre>
      </div>`
    : ''
  return `
    <div class="error" role="alert">
      <div class="error__head">
        <span class="badge badge--destructive">${errorIcon()}${esc(L.error)}</span>
        <span class="error__msg mono">${esc(c.error.message)}</span>
      </div>
      ${diff}
      ${stack}
    </div>`
}

/**
 * Compact case row. One line for the name + duration; if any chips
 * (REQ ID, category, priority) are present they wrap to a second
 * line below. The whole row is a link to the case's detail entry,
 * so the reader can click anywhere on the row to jump to the
 * description / precondition / note / error / evidence block.
 * Description, precondition, note, error and screenshot are
 * intentionally NOT rendered here — they belong in the Details
 * section.
 */
function renderCase(c: ViewCase, _opts: ResolvedPdfReporterOptions): string {
  return `
  <li class="case is-${c.status}" id="${esc(c.id)}">
    <a class="case__link" href="#detail-${esc(c.id)}">
      <div class="case__rail">${statusBadge(c.status)}</div>
      <div class="case__body">
        <div class="case__row">
          <h4 class="case__name">${esc(c.name)}</h4>
          <span class="case__duration">${fmtDuration(c.durationMs)}</span>
        </div>
        ${chips(c.meta)}
      </div>
    </a>
  </li>`
}

function renderScreenshot(src: string): string {
  // The src is passed through verbatim. Authors should provide a data: URL
  // or an absolute http(s):// / file:// URL — local relative paths won't
  // resolve through Playwright's `page.setContent` without a baseURL.
  return `
    <figure class="evidence">
      <img class="evidence__img" src="${esc(src)}" alt="Evidence screenshot" />
      <figcaption class="evidence__caption">Evidence</figcaption>
    </figure>`
}

function renderDetailEntry(c: ViewCase, sectionNumber: string, sectionPath: string, opts: ResolvedPdfReporterOptions): string {
  const kvs: string[] = []
  if (c.meta.description) {
    kvs.push(`<div class="detail__kv"><dt>Description</dt><dd>${esc(String(c.meta.description))}</dd></div>`)
  }
  if (c.meta.precondition) {
    kvs.push(`<div class="detail__kv"><dt>${esc(L.metaPrecondition)}</dt><dd>${esc(String(c.meta.precondition))}</dd></div>`)
  }
  if (c.meta.note) {
    kvs.push(`<div class="detail__kv"><dt>${esc(L.metaNote)}</dt><dd>${esc(String(c.meta.note))}</dd></div>`)
  }
  const kvBlock = kvs.length > 0 ? `<dl class="detail__kvs">${kvs.join('')}</dl>` : ''
  const screenshot = typeof c.meta.screenshot === 'string' && c.meta.screenshot.length > 0
    ? renderScreenshot(c.meta.screenshot)
    : ''
  const error = renderError(c, opts.includeStackTrace)
  return `
  <article class="detail" id="detail-${esc(c.id)}">
    <header class="detail__head">
      <div class="detail__head-left">
        ${statusBadge(c.status)}
        <span class="detail__num">${esc(sectionNumber)}</span>
      </div>
      <h3 class="detail__name">${esc(c.name)}</h3>
      <span class="detail__duration">${fmtDuration(c.durationMs)}</span>
    </header>
    <div class="detail__path">${esc(sectionPath)}</div>
    ${chips(c.meta)}
    ${kvBlock}
    ${error}
    ${screenshot}
  </article>`
}

function renderDetailsSection(view: View, opts: ResolvedPdfReporterOptions): string {
  type Item = { case: ViewCase; sectionNumber: string; sectionPath: string }
  const items: Item[] = []
  const walk = (s: ViewSection, path: string[]) => {
    const next = [...path, s.name]
    for (const c of s.cases) {
      // Every case gets a detail entry so every summary row has a link
      // target — even when the entry only carries the status + path.
      items.push({ case: c, sectionNumber: s.number, sectionPath: next.join(' › ') })
    }
    s.children.forEach((child) => walk(child, next))
  }
  view.sections.forEach((s) => walk(s, []))
  if (items.length === 0) return ''

  const entries = items
    .map((it) => renderDetailEntry(it.case, it.sectionNumber, it.sectionPath, opts))
    .join('')
  return `
<section class="page page--details" id="details">
  <div class="page-header">
    <span class="eyebrow">Details</span>
    <h2 class="page-header__h2">Details</h2>
    <p class="page-header__lede">Failures, evidence, and per-test detail.</p>
  </div>
  <div class="details">${entries}</div>
</section>`
}

function renderSectionSummary(s: ViewSection): string {
  if (s.summary.total === 0) return '<span class="section__summary"></span>'
  const cls = s.summary.failed > 0
    ? 'section__summary section__summary--fail'
    : 'section__summary'
  const pct = Math.round((s.summary.passed / s.summary.total) * 100)
  return `<span class="${cls}"><span class="section__summary-count">${s.summary.passed}/${s.summary.total}</span><span class="section__summary-pct">${pct}%</span></span>`
}

function renderSection(s: ViewSection, opts: ResolvedPdfReporterOptions): string {
  const sectionCases = s.cases.length > 0
    ? `<ol class="cases">${s.cases.map((c) => renderCase(c, opts)).join('')}</ol>`
    : ''
  const subSections = s.children.map((c) => renderSection(c, opts)).join('')
  const subtitle = s.subtitle
    ? `<div class="section__subtitle mono">${esc(s.subtitle)}</div>`
    : ''
  const sectionCls = `section section--d${s.depth}`
  const headingTag = `h${Math.min(s.depth + 1, 6)}`
  return `
<section id="${esc(s.id)}" class="${sectionCls}">
  <header class="section__head">
    <span class="section__num">${esc(s.number)}</span>
    <${headingTag} class="section__title">${esc(s.name)}</${headingTag}>
    ${renderSectionSummary(s)}
  </header>
  ${subtitle}
  ${sectionCases}
  ${subSections}
</section>`
}

/* -------------------------------------------------------------------------- */
/*  Stylesheet — shadcn/ui tokens with strict master rail                      */
/* -------------------------------------------------------------------------- */

function styles(theme: 'default' | 'minimal'): string {
  const tokens =
    theme === 'minimal'
      ? `
    --background: 0 0% 100%;
    --foreground: 240 10% 3.9%;
    --muted: 240 4.8% 95.9%;
    --muted-foreground: 240 3.8% 46.1%;
    --border: 240 5.9% 90%;
    --border-strong: 240 5.9% 82%;
    --primary: 240 5.9% 10%;
    --primary-foreground: 0 0% 98%;
    --secondary: 240 4.8% 95.9%;
    --secondary-foreground: 240 5.9% 10%;
    --destructive: 240 5.9% 10%;
    --destructive-soft: 240 4.8% 95.9%;
    --destructive-foreground: 0 0% 98%;
    --success: 240 5.9% 25%;
    --success-foreground: 0 0% 98%;
    --success-soft: 240 4.8% 95.9%;
    --warning: 240 5.9% 35%;
    --warning-foreground: 0 0% 98%;
    --warning-soft: 240 4.8% 95.9%;
    --radius: 8px;
    --rail-w: 20mm;
    --rail-gap: 5mm;
      `
      : `
    --background: 0 0% 100%;
    --foreground: 240 10% 3.9%;
    --muted: 240 4.8% 95.9%;
    --muted-foreground: 240 3.8% 46.1%;
    --border: 240 5.9% 90%;
    --border-strong: 240 5.9% 82%;
    --primary: 240 5.9% 10%;
    --primary-foreground: 0 0% 98%;
    --secondary: 240 4.8% 95.9%;
    --secondary-foreground: 240 5.9% 10%;
    --destructive: 0 72.2% 50.6%;
    --destructive-soft: 0 86% 97%;
    --destructive-foreground: 0 0% 98%;
    --success: 142 71% 36%;
    --success-foreground: 0 0% 98%;
    --success-soft: 142 76% 96%;
    --warning: 38 92% 42%;
    --warning-foreground: 0 0% 98%;
    --warning-soft: 48 96% 93%;
    --radius: 8px;
    --rail-w: 20mm;
    --rail-gap: 5mm;
      `

  return `
:root { ${tokens} }

@page {
  size: A4;
  margin: 16mm 14mm 18mm 14mm;
}
@page :first { margin: 0; }

html, body {
  margin: 0;
  padding: 0;
  background: hsl(var(--background));
  color: hsl(var(--foreground));
  font-family: "Inter", "Helvetica Neue", "Hiragino Sans", "Hiragino Kaku Gothic ProN",
               "Yu Gothic", "Meiryo", system-ui, -apple-system, "Segoe UI", sans-serif;
  font-size: 9pt;
  line-height: 1.35;
  -webkit-font-smoothing: antialiased;
  font-feature-settings: "tnum" 1, "lnum" 1, "ss01" 1, "kern" 1;
  font-variant-numeric: tabular-nums;
}

* { box-sizing: border-box; }

.mono {
  font-family: "JetBrains Mono", "SF Mono", "Menlo", "Consolas", ui-monospace, monospace;
  font-feature-settings: "tnum" 1, "lnum" 1, "zero" 1;
}

a { color: inherit; text-decoration: none; }

/* ────────────────────────────────────────────────────────────────────────── *
 *  PRIMITIVES — shadcn/ui faithful                                            *
 * ────────────────────────────────────────────────────────────────────────── */

.card {
  background: hsl(var(--background));
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
}

/* Badge — every variant is outline-only. There are no filled badges
 * anywhere in this document. Variants differentiate via border + text +
 * icon color, never via fill. Geometry (padding, font-size, border-
 * radius, weight) is identical across all variants. */
/* Badge — verbatim copy of shadcn v4 Badge's base class string at print
 * scale. Reference:
 *   inline-flex w-fit shrink-0 items-center justify-center gap-1
 *   overflow-hidden rounded-full border border-transparent px-2 py-0.5
 *   text-xs font-medium whitespace-nowrap [&>svg]:size-3
 *
 * We use the BadgeCheck-style outline pattern (border + foreground text,
 * no fill). Variants tint the border + the icon accent color only —
 * text always stays foreground (black). */
.badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: fit-content;
  flex-shrink: 0;
  overflow: hidden;
  border-radius: 999px;
  background: transparent;
  border: 1px solid hsl(var(--border));
  color: hsl(var(--foreground));
  padding: 0.4mm 1.6mm;
  font-size: 7pt;
  font-weight: 500;
  line-height: 1;
  gap: 0.8mm;
  white-space: nowrap;
  font-feature-settings: "tnum" 1;
}
.badge--outline { /* default neutral border + foreground text */ }
.badge--destructive { border-color: hsl(var(--destructive)); }
.badge--success { border-color: hsl(var(--success)); }
.badge--warning { border-color: hsl(var(--warning)); }
.badge--muted { border-color: hsl(var(--border)); }
.badge--secondary { border-color: hsl(var(--border)); }
.badge--default { border-color: hsl(var(--foreground)); }

/* shadcn icon sizing: [&>svg]:size-3 → 12px on web ≈ 2.5mm at print. */
.badge__icon {
  width: 2.5mm;
  height: 2.5mm;
  flex-shrink: 0;
  display: block;
  color: hsl(var(--muted-foreground));
}
.badge--destructive .badge__icon { color: hsl(var(--destructive)); }
.badge--success .badge__icon { color: hsl(var(--success)); }
.badge--warning .badge__icon { color: hsl(var(--warning)); }
.badge--muted .badge__icon { color: hsl(var(--muted-foreground)); }

.eyebrow {
  display: inline-block;
  font-size: 7pt;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: hsl(var(--muted-foreground));
  font-weight: 600;
}
.eyebrow--meta { color: hsl(var(--muted-foreground)); }

/* Mini progress bar used inside KPI cards. */
.bar {
  width: 100%;
  height: 1.4mm;
  background: hsl(var(--muted));
  border-radius: 999px;
  overflow: hidden;
  margin-top: 2mm;
}
.bar__fill { height: 100%; background: hsl(var(--foreground)); }

/* ────────────────────────────────────────────────────────────────────────── *
 *  PAGE / SECTION SCAFFOLDING                                                 *
 * ────────────────────────────────────────────────────────────────────────── */

.page {
  break-after: page;
  page-break-after: always;
}
.page:last-child {
  break-after: auto;
  page-break-after: auto;
}

.page-header { margin-bottom: 6mm; }
.page-header .eyebrow { display: block; margin-bottom: 1.4mm; }
.page-header__h2 {
  font-size: 22pt;
  font-weight: 800;
  letter-spacing: -0.025em;
  margin: 0 0 1.4mm 0;
  color: hsl(var(--foreground));
  line-height: 1.05;
}
.page-header__lede {
  font-size: 8.8pt;
  color: hsl(var(--muted-foreground));
  margin: 0;
  max-width: 130mm;
  line-height: 1.4;
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  COVER — masthead / hero / data strip (no cards)                            *
 * ────────────────────────────────────────────────────────────────────────── */

.page--cover {
  position: relative;
  padding: 24mm 18mm 22mm 18mm;
  display: grid;
  grid-template-rows: auto auto 1fr auto;
  row-gap: 10mm;
  min-height: 297mm;
}
.cover-stripe {
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 2.4mm;
  background: hsl(var(--foreground));
}

.cover-masthead {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding-bottom: 3mm;
  border-bottom: 1px solid hsl(var(--border));
}

.cover-title { }
.cover-title__h1 {
  font-size: 34pt;
  font-weight: 800;
  letter-spacing: -0.028em;
  line-height: 1.02;
  margin: 0 0 3mm 0;
  color: hsl(var(--foreground));
  max-width: 170mm;
}
.cover-title__lede {
  font-size: 10pt;
  color: hsl(var(--muted-foreground));
  margin: 0;
  max-width: 130mm;
  line-height: 1.45;
}

/* HERO — fills the middle, vertically centered */
.cover-hero {
  align-self: center;
  width: 100%;
}
.cover-hero__label {
  font-size: 8pt;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: hsl(var(--muted-foreground));
  font-weight: 600;
  margin-bottom: 3mm;
}
.cover-hero__num {
  font-size: 88pt;
  font-weight: 800;
  letter-spacing: -0.04em;
  line-height: 1;
  color: hsl(var(--foreground));
  display: flex;
  align-items: baseline;
  font-feature-settings: "tnum" 1;
}
.cover-hero__num.is-fail { color: hsl(var(--destructive)); }
.cover-hero__pct {
  font-size: 36pt;
  color: hsl(var(--muted-foreground));
  margin-left: 2.6mm;
  font-weight: 500;
  letter-spacing: -0.02em;
}
.cover-hero__bar {
  width: 100%;
  height: 1.6mm;
  background: hsl(var(--muted));
  margin-top: 5mm;
  overflow: hidden;
  border-radius: 999px;
}
.cover-hero__bar-fill {
  height: 100%;
  background: hsl(var(--foreground));
  border-radius: 999px;
}
.cover-hero__sub {
  font-size: 9.4pt;
  color: hsl(var(--muted-foreground));
  margin-top: 3mm;
  letter-spacing: 0.01em;
}

/* DATA STRIP — table-like, no cards */
.cover-data {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  border-top: 1px solid hsl(var(--foreground));
  border-bottom: 1px solid hsl(var(--border));
}
.cover-data__cell {
  position: relative;
  padding: 4mm 0;
  display: flex;
  flex-direction: column;
  gap: 1.6mm;
  border-right: 1px solid hsl(var(--border));
  color: inherit;
}
.cover-data__cell:last-child { border-right: none; }
.cover-data__cell--link { /* same layout, just clickable */ }
.cover-data__label {
  font-size: 7pt;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: hsl(var(--muted-foreground));
  font-weight: 600;
  padding-left: 3mm;
}
.cover-data__num {
  font-size: 22pt;
  font-weight: 800;
  letter-spacing: -0.025em;
  line-height: 1;
  color: hsl(var(--foreground));
  font-feature-settings: "tnum" 1;
  padding-left: 3mm;
}
.cover-data__num.is-fail { color: hsl(var(--destructive)); }
.cover-data__num.is-mono { font-size: 17pt; }
.cover-data__arrow {
  position: absolute;
  top: 4mm;
  right: 3mm;
  font-size: 9pt;
  color: hsl(var(--muted-foreground));
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  FAILURES CARD (cover preview + standalone page)                            *
 * ────────────────────────────────────────────────────────────────────────── */

.failures-card { padding: 0; overflow: hidden; }
.failures-card__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 3mm 5mm;
  border-bottom: 1px solid hsl(var(--border));
  background: hsl(var(--muted) / 0.4);
}
.failures-card__more {
  color: hsl(var(--muted-foreground));
  font-size: 7pt;
  letter-spacing: 0.04em;
}
.failures-list { list-style: none; margin: 0; padding: 0; }
.failure-row { border-bottom: 1px solid hsl(var(--border)); }
.failure-row:last-child { border-bottom: none; }
.failure-row__link {
  display: grid;
  grid-template-columns: var(--rail-w) 1fr;
  gap: var(--rail-gap);
  padding: 3mm 5mm 3mm 5mm;
  align-items: center;
  color: inherit;
}
.failure-row__body { display: flex; flex-direction: column; gap: 1mm; min-width: 0; }
.failure-row__top {
  display: grid;
  grid-template-columns: 12mm 1fr auto 4mm;
  align-items: baseline;
  gap: 3mm;
}
.failure-row__num {
  font-size: 8.6pt;
  color: hsl(var(--foreground));
  font-weight: 600;
}
.failure-row__name {
  font-size: 9.4pt;
  font-weight: 600;
  color: hsl(var(--foreground));
  letter-spacing: -0.005em;
}
.failure-row__req {
  font-size: 7pt;
  color: hsl(var(--muted-foreground));
}
.failure-row__arrow {
  text-align: right;
  color: hsl(var(--muted-foreground));
  font-size: 9pt;
}
.failure-row__path {
  font-size: 7.4pt;
  color: hsl(var(--muted-foreground));
  padding-left: 0;
}

.page--failures .failures-card__head { display: none; }
.page--failures .failure-row__link { padding-left: 5mm; padding-right: 5mm; }

/* ────────────────────────────────────────────────────────────────────────── *
 *  TABLE OF CONTENTS                                                          *
 * ────────────────────────────────────────────────────────────────────────── */

/* TOC — every title starts at the same column (after the rail) regardless of
 * depth. Numbers grow longer with depth but stay within the same rail width.
 * Depth is communicated by color and weight, NOT indentation. */
.toc {
  list-style: none;
  margin: 0;
  padding: 0;
  border-top: 1px solid hsl(var(--border-strong));
}
.toc-row { border-bottom: 1px solid hsl(var(--border)); }
.toc-row__link {
  display: grid;
  grid-template-columns: var(--rail-w) 1fr;
  gap: var(--rail-gap);
  padding: 1.8mm 0;
  align-items: baseline;
  color: inherit;
}
.toc-row__num {
  font-size: 8pt;
  color: hsl(var(--muted-foreground));
  font-weight: 500;
}
.toc-row__name {
  font-size: 9.4pt;
  color: hsl(var(--foreground));
  font-weight: 500;
}
.toc-row--d1 .toc-row__link { padding: 2.8mm 0; }
.toc-row--d1 { border-bottom: 1px solid hsl(var(--border-strong)); }
.toc-row--d1 .toc-row__num { font-weight: 700; color: hsl(var(--foreground)); font-size: 9pt; }
.toc-row--d1 .toc-row__name { font-weight: 700; font-size: 11pt; letter-spacing: -0.01em; }
.toc-row--d2 .toc-row__name { font-weight: 600; font-size: 9.6pt; }
.toc-row--d3 .toc-row__name { font-weight: 400; font-size: 9.2pt; color: hsl(var(--muted-foreground)); }
.toc-row--d4 .toc-row__name { font-weight: 400; font-size: 8.8pt; color: hsl(var(--muted-foreground)); }

/* ────────────────────────────────────────────────────────────────────────── *
 *  SECTIONS                                                                    *
 * ────────────────────────────────────────────────────────────────────────── */

.section {}
.section--d1 {
  break-before: page;
  page-break-before: always;
}
.section__head {
  display: grid;
  grid-template-columns: var(--rail-w) 1fr auto;
  gap: var(--rail-gap);
  align-items: baseline;
  padding-bottom: 2.6mm;
  border-bottom: 2px solid hsl(var(--foreground));
  margin-bottom: 4mm;
}
/* Section summary: two fixed-width columns ("X/Y" and "Z%") aligned to
 * the right. Uniform font-size / column widths across every depth so
 * the count and the percentage form clean vertical columns down the
 * page. */
.section__summary {
  display: inline-grid;
  grid-template-columns: 12mm 10mm;
  column-gap: 2mm;
  font-feature-settings: "tnum" 1;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  color: hsl(var(--muted-foreground));
  font-weight: 500;
  font-size: 8.4pt;
  align-items: baseline;
  justify-self: end;
}
.section__summary-count {
  text-align: right;
  font-weight: 600;
}
.section__summary-pct {
  text-align: right;
  font-size: 7.2pt;
  color: hsl(var(--muted-foreground));
}
.section__summary--fail { color: hsl(var(--destructive)); }
.section__summary--fail .section__summary-pct { color: hsl(var(--destructive)); }
/* Section number and title are on the same row, share the same baseline,
 * and use the same font-size at each depth. Only the weight + color
 * differ. */
.section__num {
  font-size: 22pt;
  color: hsl(var(--muted-foreground));
  font-weight: 500;
  line-height: 1.05;
}
.section__title {
  margin: 0;
  font-size: 22pt;
  font-weight: 800;
  letter-spacing: -0.025em;
  line-height: 1.05;
  color: hsl(var(--foreground));
}
.section--d2 .section__head {
  border-bottom: 1px solid hsl(var(--border-strong));
  padding-bottom: 1.8mm;
  margin-top: 5mm;
  margin-bottom: 2.4mm;
}
.section--d2 .section__num { font-size: 13pt; line-height: 1.2; }
.section--d2 .section__title { font-size: 13pt; font-weight: 700; letter-spacing: -0.015em; line-height: 1.2; }
.section--d3 .section__head {
  border-bottom: 1px solid hsl(var(--border));
  padding-bottom: 1.4mm;
  margin-top: 3.6mm;
  margin-bottom: 1.8mm;
}
.section--d3 .section__num { font-size: 10.6pt; line-height: 1.2; }
.section--d3 .section__title { font-size: 10.6pt; font-weight: 700; letter-spacing: -0.005em; line-height: 1.2; }
.section--d4 .section__head {
  border-bottom: 1px solid hsl(var(--border));
  padding-bottom: 1mm;
  margin-top: 3mm;
  margin-bottom: 1.4mm;
}
.section--d4 .section__num { font-size: 9.8pt; line-height: 1.2; }
.section--d4 .section__title { font-size: 9.8pt; font-weight: 700; line-height: 1.2; }
.section--d5 .section__num { font-size: 9.2pt; line-height: 1.2; }
.section--d5 .section__title { font-size: 9.2pt; font-weight: 600; line-height: 1.2; }
.section__subtitle {
  font-size: 7.6pt;
  color: hsl(var(--muted-foreground));
  margin-top: -1mm;
  margin-bottom: 2.4mm;
  padding-left: calc(var(--rail-w) + var(--rail-gap));
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  CASES                                                                       *
 * ────────────────────────────────────────────────────────────────────────── */

/* Cases live entirely in the content column of the 2-column section grid
 * (number | content). Padding-left = rail width + gap, so every case row
 * sits below — and aligned with — its section title. The whole row is
 * a link to the corresponding detail entry. */
.cases {
  list-style: none;
  margin: 0;
  padding: 0 0 0 calc(var(--rail-w) + var(--rail-gap));
}
.case {
  border-bottom: 1px solid hsl(var(--border));
  break-inside: avoid;
  page-break-inside: avoid;
}
.case:last-child { border-bottom: none; }

.case__link {
  /* Fixed badge column so every test title starts at the same x. The
   * width is sized to fit the widest of PASS / FAIL / SKIP / TODO at
   * 7pt with shadcn padding + icon + gap (~13mm) plus a hair of slack. */
  display: grid;
  grid-template-columns: 15mm 1fr;
  column-gap: 4mm;
  align-items: start;
  padding: 1.6mm 0;
  color: inherit;
}
.case__rail { padding-top: 0.2mm; }
.case__body { display: flex; flex-direction: column; gap: 1mm; min-width: 0; }
.case__row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 4mm;
  align-items: baseline;
}
.case__name {
  margin: 0;
  font-size: 9.4pt;
  font-weight: 500;
  letter-spacing: -0.005em;
  color: hsl(var(--foreground));
  line-height: 1.3;
}
.case.is-skip .case__name,
.case.is-todo .case__name { color: hsl(var(--muted-foreground)); }
.case__duration {
  font-size: 7.6pt;
  color: hsl(var(--muted-foreground));
  white-space: nowrap;
  font-feature-settings: "tnum" 1;
}
.case__chips { display: flex; flex-wrap: wrap; gap: 1mm; }

/* ────────────────────────────────────────────────────────────────────────── *
 *  DETAILS — failure errors, evidence and per-test detail                     *
 * ────────────────────────────────────────────────────────────────────────── */

.page--details {
  break-before: page;
  page-break-before: always;
  padding-top: 2mm;
}
.details { display: flex; flex-direction: column; gap: 6mm; }
.detail {
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
  padding: 4mm 5mm;
  display: flex;
  flex-direction: column;
  gap: 2.4mm;
  break-inside: avoid;
  page-break-inside: avoid;
}
.detail__head {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 4mm;
  align-items: baseline;
}
.detail__head-left {
  display: flex;
  gap: 3mm;
  align-items: baseline;
}
.detail__num {
  font-size: 9pt;
  color: hsl(var(--muted-foreground));
  font-weight: 500;
}
.detail__name {
  margin: 0;
  font-size: 11.5pt;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: hsl(var(--foreground));
  line-height: 1.25;
}
.detail__duration {
  font-size: 8pt;
  color: hsl(var(--muted-foreground));
  white-space: nowrap;
}
.detail__path {
  font-size: 7.6pt;
  color: hsl(var(--muted-foreground));
}
.detail__kvs { margin: 0; display: flex; flex-direction: column; gap: 0.8mm; }
.detail__kv {
  display: grid;
  grid-template-columns: 26mm 1fr;
  gap: 4mm;
  align-items: baseline;
  font-size: 8.6pt;
  margin: 0;
  line-height: 1.4;
}
.detail__kv dt {
  font-size: 7.8pt;
  color: hsl(var(--muted-foreground));
  font-weight: 500;
  margin: 0;
}
.detail__kv dd { margin: 0; color: hsl(var(--foreground)); }

.evidence {
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 1.4mm;
}
.evidence__img {
  max-width: 100%;
  height: auto;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
  display: block;
}
.evidence__caption {
  font-size: 7.4pt;
  color: hsl(var(--muted-foreground));
  letter-spacing: 0.06em;
  text-transform: uppercase;
  font-weight: 500;
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  ERROR (shadcn Alert variant: destructive — outline only)                  *
 * ────────────────────────────────────────────────────────────────────────── */

.error {
  margin-top: 1mm;
  background: transparent;
  border: 1px solid hsl(var(--destructive) / 0.5);
  border-radius: var(--radius);
  padding: 2.4mm 3mm;
}
.error__head {
  display: flex;
  align-items: center;
  gap: 2mm;
  margin-bottom: 1.6mm;
}
.error__msg {
  font-size: 8.4pt;
  color: hsl(var(--foreground));
  font-weight: 600;
  word-break: break-word;
  line-height: 1.3;
}
.error__section { margin-top: 1.6mm; }
.error__label {
  font-size: 7pt;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: hsl(var(--muted-foreground));
  font-weight: 600;
  margin-bottom: 1mm;
}
.error__pre {
  margin: 0;
  font-family: "JetBrains Mono", monospace;
  font-size: 7.8pt;
  line-height: 1.35;
  color: hsl(var(--foreground));
  background: hsl(var(--background));
  border: 1px solid hsl(var(--destructive) / 0.18);
  border-radius: calc(var(--radius) - 2px);
  padding: 1.8mm 2.4mm;
  white-space: pre-wrap;
  word-break: break-word;
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  PRINT NICETIES                                                              *
 * ────────────────────────────────────────────────────────────────────────── */

.section__head, .section__subtitle, .case__top {
  break-after: avoid;
  page-break-after: avoid;
}
`
}

/* -------------------------------------------------------------------------- */
/*  Entry                                                                      */
/* -------------------------------------------------------------------------- */

export interface RenderHtmlInput {
  view: View
  options: ResolvedPdfReporterOptions
}

export function renderHtml({ view, options }: RenderHtmlInput): string {
  const cover = options.includeCoverPage ? renderCover(view) : ''
  const failures = renderFailuresIndex(view)
  const toc = options.includeTableOfContents ? renderToc(view) : ''
  const body = view.sections.map((s) => renderSection(s, options)).join('')
  const details = renderDetailsSection(view, options)
  const customCss = options.customCss ? `\n/* customCss */\n${options.customCss}` : ''

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(view.title)}</title>
<style>${styles(options.theme)}${customCss}</style>
</head>
<body>
${cover}
${failures}
${toc}
<main class="doc">${body}</main>
${details}
</body>
</html>`
}

/* -------------------------------------------------------------------------- */
/*  Header/footer templates (used by Playwright PDF API)                       */
/* -------------------------------------------------------------------------- */

export function renderFooterTemplate(view: View): string {
  return `
<div style="
  width: 100%;
  font-family: 'Inter','Helvetica Neue','Hiragino Sans',system-ui,sans-serif;
  font-size: 7px;
  color: hsl(240 3.8% 46.1%);
  padding: 0 14mm 0 14mm;
  display: flex;
  justify-content: space-between;
  align-items: center;
  letter-spacing: 0.02em;
">
  <span style="text-transform: uppercase; letter-spacing: 0.18em;">${esc(view.projectName ?? view.title)}</span>
  <span style="font-family: 'JetBrains Mono', 'SF Mono', Menlo, monospace;">
    <span class="pageNumber"></span> / <span class="totalPages"></span>
  </span>
  <span style="text-transform: uppercase; letter-spacing: 0.18em;">${esc(L.docKind)}</span>
</div>`
}

export function renderHeaderTemplate(): string {
  return `<div style="display:none"></div>`
}

/* -------------------------------------------------------------------------- */

export const __internal = { esc, fmtDuration, fmtDate, statusLabel, priorityVariant }
export type { SpecSummary }
