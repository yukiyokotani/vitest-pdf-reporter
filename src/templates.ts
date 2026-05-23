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

function priorityVariant(priority: string | undefined): string {
  if (!priority) return 'badge--outline'
  const p = priority.toLowerCase()
  if (p === '高' || p === 'high') return 'badge--destructive'
  if (p === '中' || p === 'medium' || p === 'mid') return 'badge--warning'
  if (p === '低' || p === 'low') return 'badge--muted'
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
 * Inline lucide-style icons matching the ones shadcn pairs with status
 * badges in its examples: `Check` for pass, `X` for fail, `Minus` for skip,
 * and a dashed circle for the "not yet started" todo state.
 */
function statusIcon(s: TestStatus): string {
  const open = '<svg class="badge__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
  switch (s) {
    case 'pass': return `${open}<path d="M20 6 9 17l-5-5"/></svg>`
    case 'fail': return `${open}<path d="M18 6 6 18"/><path d="M6 6l12 12"/></svg>`
    case 'skip': return `${open}<path d="M5 12h14"/></svg>`
    case 'todo': return `<svg class="badge__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke-dasharray="2.4 3.2"/></svg>`
  }
}

function statusBadge(s: TestStatus): string {
  return `<span class="badge ${statusBadgeVariant(s)} badge--status">${statusIcon(s)}<span class="badge__text">${statusLabel(s)}</span></span>`
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
    <div class="gauge__sub mono">${summary.passed} / ${summary.total}</div>
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

  const link = (target: string, body: string) =>
    `<a class="kpi-link" href="#${target}">${body}</a>`

  const kpi = (variant: '' | 'is-pass' | 'is-fail' | 'is-skip' | 'is-todo' | 'is-mono', label: string, value: string | number, sub?: string, bar?: number) => {
    const barHtml = bar !== undefined
      ? `<div class="bar"><div class="bar__fill" style="width:${bar}%"></div></div>`
      : ''
    return `
      <div class="kpi__inner">
        <div class="kpi__label">${esc(label)}</div>
        <div class="kpi__num ${variant}">${esc(value)}</div>
        ${sub ? `<div class="kpi__sub">${esc(sub)}</div>` : ''}
        ${barHtml}
      </div>`
  }

  const fileLabel = summary.fileCount === 1 ? 'file' : 'files'
  const totalContent = kpi('', L.total, summary.total, `${summary.fileCount} ${fileLabel}`)
  const totalCard = hasToc
    ? `<div class="card kpi kpi--clickable">${link(TOC_ANCHOR, totalContent)}</div>`
    : `<div class="card kpi">${totalContent}</div>`

  const passedCard = `<div class="card kpi kpi--pass">${kpi('is-pass', L.passed, summary.passed, undefined, pctOf(summary.passed, summary.total))}</div>`

  const failedContent = kpi('is-fail', L.failed, summary.failed, undefined, pctOf(summary.failed, summary.total))
  const failedCard = hasFailures
    ? `<div class="card kpi kpi--fail kpi--clickable">${link(FAILURES_ANCHOR, failedContent)}</div>`
    : `<div class="card kpi">${failedContent}</div>`

  const skippedCard = `<div class="card kpi">${kpi('is-skip', L.skipped, summary.skipped, undefined, pctOf(summary.skipped, summary.total))}</div>`
  const todoCard = `<div class="card kpi">${kpi('is-todo', L.todo, summary.todo, undefined, pctOf(summary.todo, summary.total))}</div>`
  const durationCard = `<div class="card kpi">${kpi('is-mono', L.duration, fmtDuration(summary.durationMs), `${L.generated} ${fmtDate(view.generatedAt)}`)}</div>`

  const inlineFailures = hasFailures && view.failures.length <= 5
  const previewId = inlineFailures ? FAILURES_ANCHOR : ''
  const previewMoreLink = !inlineFailures && hasFailures
    ? `<a class="failures-card__more mono" href="#${FAILURES_ANCHOR}">${esc(L.viewAll)}</a>`
    : ''
  const failurePreview = hasFailures
    ? `
    <div class="card failures-card"${previewId ? ` id="${previewId}"` : ''}>
      <div class="failures-card__head">
        <span class="eyebrow">${esc(L.failures)}</span>
        ${previewMoreLink}
      </div>
      <ol class="failures-list">
        ${view.failures.slice(0, 5).map((f) => failureRow(f)).join('')}
      </ol>
    </div>`
    : ''

  const headerMeta = [
    view.projectName,
    view.version ? `v${view.version}` : null,
    fmtDate(view.generatedAt),
  ]
    .filter(Boolean)
    .map((s) => esc(String(s)))
    .join(' · ')

  return `
<section class="page page--cover">
  <div class="cover-stripe"></div>
  <header class="cover-header">
    <span class="eyebrow">${esc(L.docKind)}</span>
    <span class="eyebrow eyebrow--meta">${headerMeta}</span>
  </header>

  <div class="cover-title">
    <h1 class="cover-title__h1">${esc(view.title)}</h1>
    <p class="cover-title__lede">${esc(L.intro)}</p>
  </div>

  <div class="cover-grid">
    <div class="card gauge-card">
      <div class="gauge-card__head">
        <span class="eyebrow">${esc(L.passRate)}</span>
      </div>
      ${gauge(view)}
    </div>
    <div class="kpi-grid">
      ${totalCard}
      ${passedCard}
      ${failedCard}
      ${skippedCard}
      ${todoCard}
      ${durationCard}
    </div>
  </div>

  ${failurePreview}
</section>`
}

/* -------------------------------------------------------------------------- */
/*  Failure row (used by cover preview and standalone failures page)           */
/* -------------------------------------------------------------------------- */

function failureRow(f: ViewFailure): string {
  return `
  <li class="failure-row">
    <a class="failure-row__link" href="#${esc(f.caseId)}">
      ${statusBadge('fail')}
      <div class="failure-row__body">
        <div class="failure-row__top">
          <span class="failure-row__num mono">${esc(f.sectionNumber)}</span>
          <span class="failure-row__name">${esc(f.name)}</span>
          ${f.requirementId ? `<span class="badge badge--outline mono failure-row__req">${esc(f.requirementId)}</span>` : `<span></span>`}
          <span class="failure-row__arrow mono">→</span>
        </div>
        <div class="failure-row__path">${esc(f.sectionPath)}</div>
      </div>
    </a>
  </li>`
}

function renderFailuresIndex(view: View): string {
  if (view.failures.length <= 5) return ''
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
        <span class="toc-row__num mono">${esc(e.number)}</span>
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
    out.push(`<span class="badge badge--secondary">${esc(String(meta.category))}</span>`)
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
        <span class="badge badge--destructive">${esc(L.error)}</span>
        <span class="error__msg mono">${esc(c.error.message)}</span>
      </div>
      ${diff}
      ${stack}
    </div>`
}

function renderCase(c: ViewCase, opts: ResolvedPdfReporterOptions): string {
  const desc = c.meta.description
    ? `<p class="case__desc">${esc(String(c.meta.description))}</p>`
    : ''

  const kvs: string[] = []
  if (c.meta.precondition) {
    kvs.push(`<div class="case__kv"><dt>${esc(L.metaPrecondition)}</dt><dd>${esc(String(c.meta.precondition))}</dd></div>`)
  }
  if (c.meta.note) {
    kvs.push(`<div class="case__kv"><dt>${esc(L.metaNote)}</dt><dd>${esc(String(c.meta.note))}</dd></div>`)
  }
  const kvBlock = kvs.length > 0 ? `<dl class="case__kvs">${kvs.join('')}</dl>` : ''

  return `
  <li class="case is-${c.status}" id="${esc(c.id)}">
    <div class="case__rail">${statusBadge(c.status)}</div>
    <div class="case__body">
      <div class="case__top">
        <h4 class="case__name">${esc(c.name)}</h4>
        <span class="case__duration mono">${fmtDuration(c.durationMs)}</span>
      </div>
      ${chips(c.meta)}
      ${desc}
      ${kvBlock}
      ${renderError(c, opts.includeStackTrace)}
    </div>
  </li>`
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
    <span class="section__num mono">${esc(s.number)}</span>
    <${headingTag} class="section__title">${esc(s.name)}</${headingTag}>
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
    --radius: 6px;
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
    --radius: 6px;
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

/* Badge — shadcn variants. Used everywhere status / tags appear. */
.badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: calc(var(--radius) - 2px);
  border: 1px solid transparent;
  padding: 0.4mm 1.8mm;
  font-size: 6.6pt;
  font-weight: 600;
  letter-spacing: 0.04em;
  line-height: 1.35;
  white-space: nowrap;
  font-feature-settings: "tnum" 1;
}
.badge--default {
  background: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
}
.badge--secondary {
  background: hsl(var(--secondary));
  color: hsl(var(--secondary-foreground));
  border-color: transparent;
}
.badge--destructive {
  background: hsl(var(--destructive));
  color: hsl(var(--destructive-foreground));
}
.badge--success {
  background: hsl(var(--success));
  color: hsl(var(--success-foreground));
}
.badge--warning {
  background: hsl(var(--warning));
  color: hsl(var(--warning-foreground));
}
.badge--muted {
  background: hsl(var(--muted));
  color: hsl(var(--muted-foreground));
}
.badge--outline {
  background: hsl(var(--background));
  border-color: hsl(var(--border-strong));
  color: hsl(var(--foreground));
  font-weight: 500;
}

/* Status badge — uniform geometry across every variant so PASS / FAIL /
 * SKIP / TODO sit at the exact same height, width and weight in the rail. */
.badge--status,
.badge--status.badge--outline,
.badge--status.badge--success,
.badge--status.badge--destructive,
.badge--status.badge--muted,
.badge--status.badge--secondary,
.badge--status.badge--warning {
  min-width: 16mm;
  height: 5mm;
  padding: 0 2mm;
  gap: 1mm;
  font-size: 7.4pt;
  font-weight: 700;
  letter-spacing: 0.08em;
  line-height: 1;
}
.badge__icon {
  width: 2.8mm;
  height: 2.8mm;
  flex-shrink: 0;
  display: inline-block;
}
.badge__text { display: inline-block; line-height: 1; }

.eyebrow {
  display: inline-block;
  font-family: "JetBrains Mono", "SF Mono", Menlo, ui-monospace, monospace;
  font-size: 6.4pt;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: hsl(var(--muted-foreground));
  font-weight: 500;
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
 *  COVER                                                                       *
 * ────────────────────────────────────────────────────────────────────────── */

.page--cover {
  position: relative;
  padding: 20mm 16mm 16mm 16mm;
  display: flex;
  flex-direction: column;
  gap: 6mm;
  min-height: 297mm;
}
.cover-stripe {
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 4mm;
  background: hsl(var(--foreground));
}

.cover-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding-bottom: 3mm;
  border-bottom: 1px solid hsl(var(--border));
}

.cover-title { margin-top: 0; }
.cover-title__h1 {
  font-size: 30pt;
  font-weight: 800;
  letter-spacing: -0.028em;
  line-height: 1.02;
  margin: 0 0 2mm 0;
  color: hsl(var(--foreground));
  max-width: 160mm;
}
.cover-title__lede {
  font-size: 9.4pt;
  color: hsl(var(--muted-foreground));
  margin: 0;
  max-width: 130mm;
  line-height: 1.4;
}

.cover-grid {
  display: grid;
  grid-template-columns: 84mm 1fr;
  gap: 4mm;
  align-items: stretch;
}

/* Gauge card */
.gauge-card {
  padding: 6mm;
  display: flex;
  flex-direction: column;
  gap: 4mm;
}
.gauge-card__head { display: flex; justify-content: space-between; }
.gauge {
  position: relative;
  width: 62mm;
  height: 62mm;
  margin: auto;
}
.gauge svg { width: 100%; height: 100%; display: block; }
.gauge__track { stroke: hsl(var(--muted)); }
.gauge__fill--success { stroke: hsl(var(--success)); }
.gauge__fill--destructive { stroke: hsl(var(--destructive)); }
.gauge__fill--muted { stroke: hsl(var(--muted-foreground)); }
.gauge__center {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
}
.gauge__num {
  font-size: 26pt;
  font-weight: 800;
  letter-spacing: -0.035em;
  line-height: 1;
  color: hsl(var(--foreground));
  display: flex;
  align-items: baseline;
  font-feature-settings: "tnum" 1;
}
.gauge__pct {
  font-size: 12pt;
  color: hsl(var(--muted-foreground));
  margin-left: 1.4mm;
  font-weight: 600;
}
.gauge__sub {
  margin-top: 1.5mm;
  font-size: 8pt;
  color: hsl(var(--muted-foreground));
  letter-spacing: 0.04em;
}

/* KPI grid: 3 columns × 2 rows */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-auto-rows: 1fr;
  gap: 3mm;
}
.kpi {
  position: relative;
  padding: 0;
}
.kpi__inner { padding: 3mm 4mm; display: flex; flex-direction: column; gap: 1mm; height: 100%; }
.kpi__label {
  font-family: "JetBrains Mono", monospace;
  font-size: 6.4pt;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: hsl(var(--muted-foreground));
  font-weight: 500;
}
.kpi__num {
  font-size: 22pt;
  font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 1;
  color: hsl(var(--foreground));
  font-feature-settings: "tnum" 1;
}
.kpi__num.is-pass { color: hsl(var(--success)); }
.kpi__num.is-fail { color: hsl(var(--destructive)); }
.kpi__num.is-skip { color: hsl(var(--muted-foreground)); }
.kpi__num.is-todo { color: hsl(var(--warning)); }
.kpi__num.is-mono {
  font-family: "JetBrains Mono", monospace;
  font-size: 16pt;
}
.kpi__sub {
  font-size: 7pt;
  color: hsl(var(--muted-foreground));
  margin-top: auto;
}
.kpi--pass { border-color: hsl(var(--success) / 0.35); }
.kpi--fail { border-color: hsl(var(--destructive) / 0.4); background: hsl(var(--destructive-soft)); }
.kpi-link { display: block; color: inherit; height: 100%; }
.kpi--clickable::after {
  content: "→";
  position: absolute;
  top: 3.4mm;
  right: 4mm;
  font-family: "JetBrains Mono", monospace;
  font-size: 8pt;
  color: hsl(var(--muted-foreground));
}
.kpi__inner .bar__fill { background: hsl(var(--foreground)); }
.kpi--pass .bar__fill { background: hsl(var(--success)); }
.kpi--fail .bar__fill { background: hsl(var(--destructive)); }
.kpi .is-skip ~ .bar .bar__fill,
.kpi .is-todo ~ .bar .bar__fill { background: hsl(var(--muted-foreground)); }

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
.toc-row--d1 .toc-row__link { padding: 2.6mm 0; }
.toc-row--d1 { border-bottom: 1px solid hsl(var(--border-strong)); }
.toc-row--d1 .toc-row__num { font-weight: 700; color: hsl(var(--foreground)); font-size: 9.4pt; }
.toc-row--d1 .toc-row__name { font-weight: 700; font-size: 11pt; letter-spacing: -0.01em; }
.toc-row--d2 .toc-row__link { padding-left: 6mm; }
.toc-row--d2 .toc-row__name { font-weight: 600; font-size: 9.6pt; }
.toc-row--d3 .toc-row__link { padding-left: 12mm; }
.toc-row--d3 .toc-row__name { color: hsl(var(--muted-foreground)); font-size: 9pt; }
.toc-row--d4 .toc-row__link { padding-left: 18mm; }
.toc-row--d4 .toc-row__name { color: hsl(var(--muted-foreground)); font-size: 8.6pt; }
.toc-row__num {
  font-size: 7.8pt;
  color: hsl(var(--muted-foreground));
  font-weight: 500;
}

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
  grid-template-columns: var(--rail-w) 1fr;
  gap: var(--rail-gap);
  align-items: baseline;
  padding-bottom: 2.6mm;
  border-bottom: 2px solid hsl(var(--foreground));
  margin-bottom: 4mm;
}
.section__num {
  font-size: 11pt;
  color: hsl(var(--muted-foreground));
  letter-spacing: 0.02em;
  font-weight: 500;
  line-height: 1;
}
.section--d1 .section__num {
  font-size: 14pt;
  color: hsl(var(--foreground));
  font-weight: 700;
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
.section--d2 .section__title { font-size: 13pt; font-weight: 700; letter-spacing: -0.015em; line-height: 1.2; }
.section--d3 .section__head {
  border-bottom: 1px solid hsl(var(--border));
  padding-bottom: 1.4mm;
  margin-top: 3.6mm;
  margin-bottom: 1.8mm;
}
.section--d3 .section__title { font-size: 10.6pt; font-weight: 700; letter-spacing: -0.005em; line-height: 1.2; }
.section--d4 .section__head {
  border-bottom: 1px solid hsl(var(--border));
  padding-bottom: 1mm;
  margin-top: 3mm;
  margin-bottom: 1.4mm;
}
.section--d4 .section__title { font-size: 9.8pt; font-weight: 700; line-height: 1.2; }
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

.cases { list-style: none; margin: 0; padding: 0; }
.case {
  display: grid;
  grid-template-columns: var(--rail-w) 1fr;
  gap: var(--rail-gap);
  align-items: start;
  padding: 1.8mm 0;
  border-bottom: 1px solid hsl(var(--border));
  break-inside: avoid;
  page-break-inside: avoid;
}
.case:last-child { border-bottom: none; }
.case__rail { padding-top: 0.4mm; }

.case__body { display: flex; flex-direction: column; gap: 1mm; min-width: 0; }
.case__top {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 4mm;
  align-items: baseline;
}
.case__name {
  margin: 0;
  font-size: 10pt;
  font-weight: 700;
  letter-spacing: -0.005em;
  color: hsl(var(--foreground));
  line-height: 1.25;
}
.case.is-fail .case__name { color: hsl(var(--destructive)); }
.case.is-skip .case__name { color: hsl(var(--muted-foreground)); font-weight: 500; }
.case__duration {
  font-size: 7.6pt;
  color: hsl(var(--muted-foreground));
  white-space: nowrap;
  font-feature-settings: "tnum" 1;
}

.case__chips { display: flex; flex-wrap: wrap; gap: 1mm; }

.case__desc {
  margin: 0;
  font-size: 8.6pt;
  color: hsl(var(--muted-foreground));
  line-height: 1.4;
  max-width: 150mm;
}

.case__kvs { margin: 0; display: flex; flex-direction: column; gap: 0.4mm; }
.case__kv {
  display: grid;
  grid-template-columns: 22mm 1fr;
  gap: 3mm;
  align-items: baseline;
  font-size: 8.4pt;
  margin: 0;
  line-height: 1.35;
}
.case__kv dt {
  font-family: "JetBrains Mono", monospace;
  font-size: 6.6pt;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: hsl(var(--muted-foreground));
  font-weight: 500;
  margin: 0;
}
.case__kv dd { margin: 0; color: hsl(var(--foreground)); }

/* ────────────────────────────────────────────────────────────────────────── *
 *  ERROR (shadcn Alert variant: destructive)                                  *
 * ────────────────────────────────────────────────────────────────────────── */

.error {
  margin-top: 1mm;
  background: hsl(var(--destructive-soft));
  border: 1px solid hsl(var(--destructive) / 0.25);
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
  color: hsl(var(--destructive));
  font-weight: 600;
  word-break: break-word;
  line-height: 1.3;
}
.error__section { margin-top: 1.6mm; }
.error__label {
  font-family: "JetBrains Mono", monospace;
  font-size: 6.4pt;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: hsl(var(--destructive));
  font-weight: 700;
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
