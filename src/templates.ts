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

function fmtDate(d: Date, locale: 'ja' | 'en'): string {
  try {
    return new Intl.DateTimeFormat(locale === 'ja' ? 'ja-JP' : 'en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d)
  } catch {
    return d.toISOString()
  }
}

function fmtDuration(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`
  return `${Math.round(ms)}ms`
}

function statusLabel(s: TestStatus, locale: 'ja' | 'en'): string {
  if (locale === 'ja') return ({ pass: '合格', fail: '不合格', skip: 'スキップ', todo: '未着手' } as const)[s]
  return ({ pass: 'PASS', fail: 'FAIL', skip: 'SKIP', todo: 'TODO' } as const)[s]
}

function priorityVariant(priority: string | undefined): string {
  if (!priority) return ''
  const p = priority.toLowerCase()
  if (p === '高' || p === 'high') return 'badge--destructive'
  if (p === '中' || p === 'medium' || p === 'mid') return 'badge--warning'
  if (p === '低' || p === 'low') return 'badge--muted'
  return 'badge--outline'
}

/* -------------------------------------------------------------------------- */
/*  Strings                                                                    */
/* -------------------------------------------------------------------------- */

type Strings = {
  docKind: string
  summary: string
  passRate: string
  total: string
  passed: string
  failed: string
  skipped: string
  todo: string
  duration: string
  files: string
  contents: string
  generated: string
  project: string
  version: string
  metaReq: string
  metaCategory: string
  metaPriority: string
  metaPrecondition: string
  metaNote: string
  error: string
  stack: string
  diff: string
  failures: string
  failuresLede: string
  failuresEmpty: string
  showAll: string
  intro: string
  locale: string
}

const TXT: { ja: Strings; en: Strings } = {
  ja: {
    docKind: 'TEST SPECIFICATION',
    summary: 'SUMMARY',
    passRate: '合格率',
    total: '総数',
    passed: '合格',
    failed: '不合格',
    skipped: 'スキップ',
    todo: '未着手',
    duration: '実行時間',
    files: 'ファイル',
    contents: '目次',
    generated: '生成',
    project: 'プロジェクト',
    version: 'バージョン',
    metaReq: '要件ID',
    metaCategory: 'カテゴリ',
    metaPriority: '優先度',
    metaPrecondition: '前提条件',
    metaNote: '備考',
    error: 'エラー詳細',
    stack: 'スタックトレース',
    diff: '差分',
    failures: '失敗テスト',
    failuresLede: '不合格となったテストの一覧です。各行をクリックして詳細へ移動できます。',
    failuresEmpty: '失敗したテストはありません。',
    showAll: '全て見る',
    intro: 'テストコードから自動生成された仕様書です。',
    locale: 'ja-JP',
  },
  en: {
    docKind: 'TEST SPECIFICATION',
    summary: 'SUMMARY',
    passRate: 'Pass Rate',
    total: 'Total',
    passed: 'Passed',
    failed: 'Failed',
    skipped: 'Skipped',
    todo: 'Todo',
    duration: 'Duration',
    files: 'Files',
    contents: 'Contents',
    generated: 'Generated',
    project: 'Project',
    version: 'Version',
    metaReq: 'Req ID',
    metaCategory: 'Category',
    metaPriority: 'Priority',
    metaPrecondition: 'Precondition',
    metaNote: 'Note',
    error: 'Error',
    stack: 'Stack trace',
    diff: 'Diff',
    failures: 'Failures',
    failuresLede: 'Tests that did not pass. Click any row to jump to the detail.',
    failuresEmpty: 'No failing tests.',
    showAll: 'View all',
    intro: 'Auto-generated specification from your test suite.',
    locale: 'en-US',
  },
}

/* -------------------------------------------------------------------------- */
/*  SVG donut gauge                                                            */
/* -------------------------------------------------------------------------- */

function gauge(view: View): string {
  const { summary } = view
  const pct = Math.max(0, Math.min(100, summary.passRate * 100))
  // r=50 → circumference = 2π·50 ≈ 314.159. Using explicit numbers avoids
  // SVG renderers that don't honor `pathLength` reliably (notably Chromium
  // headless print in some configurations).
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
    <circle class="gauge__track" cx="60" cy="60" r="50" fill="none"
      stroke-width="10"/>
    <circle class="${fillClass}" cx="60" cy="60" r="50" fill="none"
      stroke-width="10" stroke-linecap="round"
      stroke-dasharray="${dash.toFixed(2)} ${C.toFixed(2)}"
      transform="rotate(-90 60 60)"/>
  </svg>
  <div class="gauge__center">
    <div class="gauge__num">
      <span>${pct.toFixed(1)}</span><span class="gauge__pct">%</span>
    </div>
    <div class="gauge__label">${summary.passed} / ${summary.total}</div>
  </div>
</div>`
}

/* -------------------------------------------------------------------------- */
/*  Cover                                                                      */
/* -------------------------------------------------------------------------- */

function renderCover(view: View, t: Strings): string {
  const { summary } = view
  const hasFailures = summary.failed > 0
  const hasToc = view.options.includeTableOfContents && view.toc.length > 0

  const link = (target: string, body: string, cls = '') =>
    `<a class="kpi-link ${cls}" href="#${target}">${body}</a>`

  const totalInner = `
      <div class="kpi__label">${esc(t.total)}</div>
      <div class="kpi__num">${summary.total}</div>
      <div class="kpi__caption">${summary.fileCount} ${esc(t.files.toLowerCase())}</div>`
  const totalCard = hasToc
    ? `<div class="card kpi kpi--clickable">${link(TOC_ANCHOR, totalInner)}</div>`
    : `<div class="card kpi">${totalInner}</div>`

  const passedCard = `
    <div class="card kpi">
      <div class="kpi__label">
        <span class="dot dot--success"></span>${esc(t.passed)}
      </div>
      <div class="kpi__num">${summary.passed}</div>
      <div class="bar"><div class="bar__fill bar__fill--success" style="width:${pctOf(summary.passed, summary.total)}%"></div></div>
    </div>`

  const failedInner = `
      <div class="kpi__label">
        <span class="dot dot--destructive"></span>${esc(t.failed)}
      </div>
      <div class="kpi__num kpi__num--destructive">${summary.failed}</div>
      <div class="bar"><div class="bar__fill bar__fill--destructive" style="width:${pctOf(summary.failed, summary.total)}%"></div></div>`
  const failedCard = hasFailures
    ? `<div class="card kpi kpi--clickable">${link(FAILURES_ANCHOR, failedInner)}</div>`
    : `<div class="card kpi">${failedInner}</div>`

  const skippedCard = `
    <div class="card kpi">
      <div class="kpi__label">
        <span class="dot dot--muted"></span>${esc(t.skipped)}
      </div>
      <div class="kpi__num">${summary.skipped}</div>
      <div class="bar"><div class="bar__fill bar__fill--muted" style="width:${pctOf(summary.skipped, summary.total)}%"></div></div>
    </div>`

  const todoCard = `
    <div class="card kpi">
      <div class="kpi__label">
        <span class="dot dot--warning"></span>${esc(t.todo)}
      </div>
      <div class="kpi__num">${summary.todo}</div>
      <div class="bar"><div class="bar__fill bar__fill--warning" style="width:${pctOf(summary.todo, summary.total)}%"></div></div>
    </div>`

  const durationCard = `
    <div class="card kpi">
      <div class="kpi__label">${esc(t.duration)}</div>
      <div class="kpi__num kpi__num--mono">${fmtDuration(summary.durationMs)}</div>
      <div class="kpi__caption">${esc(t.generated)} ${esc(fmtDate(view.generatedAt, view.options.locale))}</div>
    </div>`

  // Inline failure preview (first 5). The KPI tile's `#failures` link lands
  // here on the cover when there are 5 or fewer failures — no need for a
  // sparsely-populated standalone page. When there are more, the standalone
  // page below is rendered with the full list and owns the anchor.
  const inlineFailures = hasFailures && view.failures.length <= 5
  const previewId = inlineFailures ? FAILURES_ANCHOR : ''
  const previewMoreLink = !inlineFailures
    ? `<a class="cover-failures__more" href="#${FAILURES_ANCHOR}">${esc(t.showAll)} →</a>`
    : ''
  const failurePreview = hasFailures
    ? `
    <section class="cover-failures"${previewId ? ` id="${previewId}"` : ''}>
      <div class="cover-failures__head">
        <span class="eyebrow">${esc(t.failures)}</span>
        ${previewMoreLink}
      </div>
      <ol class="cover-failures__list">
        ${view.failures.slice(0, 5).map((f) => failureRow(f, 'cover')).join('')}
      </ol>
    </section>`
    : ''

  // Slim header strip.
  const headerMeta = [
    view.projectName,
    view.version ? `v${view.version}` : null,
    fmtDate(view.generatedAt, view.options.locale),
  ]
    .filter(Boolean)
    .map((s) => esc(String(s)))
    .join(' · ')

  return `
<section class="page page--cover">
  <header class="cover-header">
    <span class="eyebrow">${esc(t.docKind)}</span>
    <span class="eyebrow eyebrow--meta">${headerMeta}</span>
  </header>

  <div class="cover-title">
    <h1 class="cover-title__h1">${esc(view.title)}</h1>
    <p class="cover-title__lede">${esc(t.intro)}</p>
  </div>

  <div class="cover-grid">
    <div class="card gauge-card">
      ${gauge(view)}
      <div class="gauge-caption">${esc(t.passRate)}</div>
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

function pctOf(n: number, total: number): number {
  if (total === 0) return 0
  return (n / total) * 100
}

/* -------------------------------------------------------------------------- */
/*  Failures index (full page) and inline failure row                          */
/* -------------------------------------------------------------------------- */

function failureRow(f: ViewFailure, ctx: 'cover' | 'page'): string {
  return `
  <li class="failure-row failure-row--${ctx}">
    <a class="failure-row__link" href="#${esc(f.caseId)}">
      <span class="badge badge--destructive failure-row__badge">FAIL</span>
      <span class="mono failure-row__num">${esc(f.sectionNumber)}</span>
      <span class="failure-row__body">
        <span class="failure-row__name">${esc(f.name)}</span>
        <span class="failure-row__path">${esc(f.sectionPath)}</span>
      </span>
      ${f.requirementId ? `<span class="mono failure-row__req">${esc(f.requirementId)}</span>` : `<span class="failure-row__req"></span>`}
      <span class="failure-row__arrow mono" aria-hidden="true">→</span>
    </a>
  </li>`
}

function renderFailuresIndex(view: View, t: Strings): string {
  // Only emit the standalone page when the cover preview can't show every
  // failure (>5). Otherwise the cover preview owns the `failures` anchor.
  if (view.failures.length <= 5) return ''
  return `
<section id="${FAILURES_ANCHOR}" class="page page--failures">
  <div class="page-header">
    <span class="eyebrow">${esc(t.failures)}</span>
    <h2 class="page-header__h2">${esc(t.failures)}</h2>
    <p class="page-header__lede">${esc(t.failuresLede)}</p>
  </div>
  <ol class="failures-list">
    ${view.failures.map((f) => failureRow(f, 'page')).join('')}
  </ol>
</section>`
}

/* -------------------------------------------------------------------------- */
/*  Table of contents                                                          */
/* -------------------------------------------------------------------------- */

function renderToc(view: View, t: Strings): string {
  if (view.toc.length === 0) return ''
  const items = view.toc
    .map(
      (e) => `
    <li class="toc__item toc__item--d${Math.min(e.depth, 4)}">
      <a class="toc__link" href="#${esc(e.id)}">
        <span class="mono toc__num">${esc(e.number)}</span>
        <span class="toc__name">${esc(e.name)}</span>
      </a>
    </li>`,
    )
    .join('')
  return `
<section id="${TOC_ANCHOR}" class="page page--toc">
  <div class="page-header">
    <span class="eyebrow">${esc(t.contents)}</span>
    <h2 class="page-header__h2">${esc(t.contents)}</h2>
  </div>
  <ol class="toc">${items}</ol>
</section>`
}

/* -------------------------------------------------------------------------- */
/*  Cases                                                                      */
/* -------------------------------------------------------------------------- */

function chips(meta: SpecMeta, t: Strings): string {
  const out: string[] = []
  if (meta.requirementId) {
    out.push(
      `<span class="badge badge--outline mono">${esc(String(meta.requirementId))}</span>`,
    )
  }
  if (meta.category) {
    out.push(`<span class="badge badge--secondary">${esc(String(meta.category))}</span>`)
  }
  if (meta.priority) {
    const cls = priorityVariant(String(meta.priority))
    out.push(
      `<span class="badge ${cls}">
        <span class="badge__label">P</span>${esc(String(meta.priority))}
      </span>`,
    )
  }
  return out.length > 0 ? `<div class="case__chips">${out.join('')}</div>` : ''
}

function renderError(c: ViewCase, includeStack: boolean, t: Strings): string {
  if (!c.error) return ''
  const stack = includeStack && c.error.stack
    ? `
      <div class="error__section">
        <div class="error__label">${esc(t.stack)}</div>
        <pre class="error__pre">${esc(c.error.stack)}</pre>
      </div>`
    : ''
  const diff = c.error.diff
    ? `
      <div class="error__section">
        <div class="error__label">${esc(t.diff)}</div>
        <pre class="error__pre error__pre--diff">${esc(c.error.diff)}</pre>
      </div>`
    : ''
  return `
    <div class="error">
      <div class="error__head">
        <span class="badge badge--destructive">FAIL</span>
        <span class="error__msg">${esc(c.error.message)}</span>
      </div>
      ${diff}
      ${stack}
    </div>`
}

function statusGlyph(s: TestStatus): string {
  switch (s) {
    case 'pass': return '✓'
    case 'fail': return '✕'
    case 'skip': return '–'
    case 'todo': return '○'
  }
}

function renderCase(c: ViewCase, t: Strings, opts: ResolvedPdfReporterOptions): string {
  const desc = c.meta.description
    ? `<div class="case__desc">${esc(String(c.meta.description))}</div>`
    : ''

  const annot: string[] = []
  if (c.meta.precondition) {
    annot.push(`<div class="case__kv"><span class="case__kv-key">${esc(t.metaPrecondition)}</span><span>${esc(String(c.meta.precondition))}</span></div>`)
  }
  if (c.meta.note) {
    annot.push(`<div class="case__kv"><span class="case__kv-key">${esc(t.metaNote)}</span><span>${esc(String(c.meta.note))}</span></div>`)
  }
  const annotBlock = annot.length > 0 ? `<div class="case__annot">${annot.join('')}</div>` : ''

  return `
  <li class="case is-${c.status}" id="${esc(c.id)}">
    <div class="case__main">
      <span class="case__status">${statusGlyph(c.status)}</span>
      <span class="case__name">${esc(c.name)}</span>
      ${chips(c.meta, t)}
      <span class="case__duration mono">${fmtDuration(c.durationMs)}</span>
    </div>
    ${desc}
    ${annotBlock}
    ${renderError(c, opts.includeStackTrace, t)}
  </li>`
}

/* -------------------------------------------------------------------------- */
/*  Sections                                                                   */
/* -------------------------------------------------------------------------- */

function renderSection(s: ViewSection, t: Strings, opts: ResolvedPdfReporterOptions): string {
  const headingTag = `h${Math.min(s.depth + 1, 6)}`
  const sectionCases = s.cases.length > 0
    ? `<ol class="cases">${s.cases.map((c) => renderCase(c, t, opts)).join('')}</ol>`
    : ''
  const subSections = s.children.map((c) => renderSection(c, t, opts)).join('')
  const subtitle = s.subtitle
    ? `<div class="section__subtitle mono">${esc(s.subtitle)}</div>`
    : ''
  const sectionCls = `section section--d${s.depth}`
  return `
<section id="${esc(s.id)}" class="${sectionCls}">
  <div class="section__header">
    <span class="section__num mono">${esc(s.number)}</span>
    <${headingTag} class="section__title">${esc(s.name)}</${headingTag}>
  </div>
  ${subtitle}
  ${sectionCases}
  ${subSections}
</section>`
}

/* -------------------------------------------------------------------------- */
/*  Stylesheet — shadcn/ui token system, print-sized                           */
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
    --accent: 240 4.8% 95.9%;
    --accent-foreground: 240 5.9% 10%;
    --destructive: 240 5.9% 10%;
    --destructive-soft: 240 4.8% 95.9%;
    --destructive-foreground: 0 0% 98%;
    --success: 240 5.9% 25%;
    --success-soft: 240 4.8% 95.9%;
    --warning: 240 5.9% 35%;
    --warning-soft: 240 4.8% 95.9%;
    --radius: 6px;
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
    --accent: 240 4.8% 95.9%;
    --accent-foreground: 240 5.9% 10%;
    --destructive: 0 72.2% 50.6%;
    --destructive-soft: 0 86% 97%;
    --destructive-foreground: 0 0% 98%;
    --success: 142 71% 36%;
    --success-soft: 142 76% 96%;
    --warning: 38 92% 42%;
    --warning-soft: 48 96% 93%;
    --radius: 6px;
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
  line-height: 1.5;
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
a:hover { color: inherit; }

/* ---- Primitives --------------------------------------------------------- */

.eyebrow {
  font-family: "JetBrains Mono", "SF Mono", Menlo, ui-monospace, monospace;
  font-size: 6.5pt;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: hsl(var(--muted-foreground));
  font-weight: 500;
}
.eyebrow--meta { color: hsl(var(--muted-foreground)); }

.card {
  background: hsl(var(--background));
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 0.5mm;
  padding: 0.4mm 1.4mm;
  font-size: 6.4pt;
  font-weight: 600;
  line-height: 1.4;
  border-radius: 999px;
  border: 1px solid transparent;
  letter-spacing: 0.02em;
  white-space: nowrap;
}
.badge__label {
  font-family: "JetBrains Mono", monospace;
  font-size: 5.6pt;
  letter-spacing: 0.1em;
  opacity: 0.7;
  margin-right: 0.6mm;
}
.badge--outline {
  background: hsl(var(--background));
  border-color: hsl(var(--border));
  color: hsl(var(--foreground));
  font-weight: 500;
}
.badge--secondary {
  background: hsl(var(--secondary));
  color: hsl(var(--secondary-foreground));
}
.badge--destructive {
  background: hsl(var(--destructive));
  color: hsl(var(--destructive-foreground));
}
.badge--warning {
  background: hsl(var(--warning-soft));
  color: hsl(var(--warning));
  border-color: hsl(var(--warning) / 0.3);
}
.badge--muted {
  background: hsl(var(--muted));
  color: hsl(var(--muted-foreground));
}

.dot {
  display: inline-block;
  width: 1.6mm;
  height: 1.6mm;
  border-radius: 999px;
  background: hsl(var(--muted-foreground));
  margin-right: 1mm;
  flex-shrink: 0;
}
.dot--success { background: hsl(var(--success)); }
.dot--destructive { background: hsl(var(--destructive)); }
.dot--warning { background: hsl(var(--warning)); }
.dot--muted { background: hsl(var(--muted-foreground)); }

.bar {
  width: 100%;
  height: 1.4mm;
  background: hsl(var(--muted));
  border-radius: 999px;
  overflow: hidden;
  margin-top: 1.6mm;
}
.bar__fill { height: 100%; background: hsl(var(--foreground)); border-radius: 999px; }
.bar__fill--success { background: hsl(var(--success)); }
.bar__fill--destructive { background: hsl(var(--destructive)); }
.bar__fill--warning { background: hsl(var(--warning)); }
.bar__fill--muted { background: hsl(var(--muted-foreground)); }

/* ---- Page break helpers ------------------------------------------------- */

.page {
  break-after: page;
  page-break-after: always;
}
.page:last-child {
  break-after: auto;
  page-break-after: auto;
}

.page-header {
  margin-bottom: 6mm;
}
.page-header .eyebrow { display: block; margin-bottom: 2mm; }
.page-header__h2 {
  font-size: 16pt;
  font-weight: 700;
  letter-spacing: -0.015em;
  margin: 0 0 1.5mm 0;
  color: hsl(var(--foreground));
}
.page-header__lede {
  font-size: 8.5pt;
  color: hsl(var(--muted-foreground));
  margin: 0;
  max-width: 130mm;
}

/* ---- Cover -------------------------------------------------------------- */

.page--cover {
  padding: 18mm 16mm 18mm 16mm;
  display: flex;
  flex-direction: column;
  gap: 8mm;
  min-height: 297mm;
}
.cover-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 4mm;
  border-bottom: 1px solid hsl(var(--border));
}

.cover-title { margin-top: 2mm; }
.cover-title__h1 {
  font-size: 26pt;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.1;
  margin: 0 0 2mm 0;
  color: hsl(var(--foreground));
  max-width: 150mm;
}
.cover-title__lede {
  font-size: 8.5pt;
  color: hsl(var(--muted-foreground));
  margin: 0;
  max-width: 130mm;
}

.cover-grid {
  display: grid;
  grid-template-columns: 78mm 1fr;
  gap: 4mm;
  align-items: stretch;
}
.gauge-card {
  padding: 6mm;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2mm;
}
.gauge {
  position: relative;
  width: 56mm;
  height: 56mm;
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
  gap: 0.5mm;
}
.gauge__num {
  font-size: 22pt;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1;
  color: hsl(var(--foreground));
  font-feature-settings: "tnum" 1;
  display: flex;
  align-items: baseline;
}
.gauge__pct {
  font-size: 10pt;
  color: hsl(var(--muted-foreground));
  margin-left: 1mm;
  font-weight: 500;
}
.gauge__label {
  font-family: "JetBrains Mono", monospace;
  font-size: 7pt;
  color: hsl(var(--muted-foreground));
  letter-spacing: 0.04em;
}
.gauge-caption {
  font-family: "JetBrains Mono", monospace;
  font-size: 6.4pt;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: hsl(var(--muted-foreground));
  margin-top: 1mm;
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-auto-rows: 1fr;
  gap: 3mm;
}
.kpi {
  padding: 4mm 5mm;
  display: flex;
  flex-direction: column;
  gap: 1.4mm;
}
.kpi__label {
  display: flex;
  align-items: center;
  font-size: 7.2pt;
  color: hsl(var(--muted-foreground));
  letter-spacing: 0.02em;
}
.kpi__num {
  font-size: 18pt;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.05;
  color: hsl(var(--foreground));
}
.kpi__num--destructive { color: hsl(var(--destructive)); }
.kpi__num--mono { font-family: "JetBrains Mono", monospace; font-size: 14pt; }
.kpi__caption {
  font-size: 6.6pt;
  color: hsl(var(--muted-foreground));
  letter-spacing: 0.02em;
}
.kpi-link {
  display: flex;
  flex-direction: column;
  gap: 1.4mm;
  color: inherit;
}
.kpi--clickable {
  position: relative;
}
.kpi--clickable::after {
  content: "→";
  position: absolute;
  top: 3mm;
  right: 3.6mm;
  font-family: "JetBrains Mono", monospace;
  font-size: 8pt;
  color: hsl(var(--muted-foreground));
}

/* ---- Cover failures preview --------------------------------------------- */

.cover-failures { margin-top: 1mm; }
.cover-failures__head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding-bottom: 2mm;
  margin-bottom: 1mm;
  border-bottom: 1px solid hsl(var(--border));
}
.cover-failures__more {
  font-family: "JetBrains Mono", monospace;
  font-size: 7pt;
  color: hsl(var(--muted-foreground));
  letter-spacing: 0.04em;
}
.cover-failures__list { list-style: none; margin: 0; padding: 0; }

/* ---- Failures list (shared cover + page) -------------------------------- */

.failures-list {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
  overflow: hidden;
  background: hsl(var(--background));
}
.cover-failures .failures-list,
.cover-failures__list {
  border: none;
  border-radius: 0;
}
.failure-row {
  border-bottom: 1px solid hsl(var(--border));
}
.failure-row:last-child { border-bottom: none; }
.failure-row__link {
  display: grid;
  grid-template-columns: 12mm 12mm 1fr 28mm 6mm;
  align-items: center;
  gap: 2.5mm;
  padding: 2.6mm 4mm;
  color: inherit;
}
.failure-row__badge { justify-self: center; }
.failure-row__num {
  font-size: 8.4pt;
  font-weight: 600;
  color: hsl(var(--foreground));
}
.failure-row__body {
  display: flex;
  flex-direction: column;
  gap: 0.6mm;
  min-width: 0;
}
.failure-row__name {
  font-size: 9pt;
  font-weight: 600;
  color: hsl(var(--foreground));
  letter-spacing: -0.005em;
}
.failure-row__path {
  font-size: 7.2pt;
  color: hsl(var(--muted-foreground));
}
.failure-row__req {
  font-size: 7.2pt;
  color: hsl(var(--muted-foreground));
  text-align: right;
  letter-spacing: 0.04em;
}
.failure-row__arrow {
  text-align: right;
  color: hsl(var(--muted-foreground));
  font-size: 9pt;
}

.page--failures { padding-top: 2mm; }

/* ---- TOC ---------------------------------------------------------------- */

.page--toc { padding-top: 2mm; }
.toc {
  list-style: none;
  margin: 0;
  padding: 0;
  border-top: 1px solid hsl(var(--border));
}
.toc__item { border-bottom: 1px solid hsl(var(--border)); }
.toc__link {
  display: grid;
  grid-template-columns: 16mm 1fr;
  gap: 3mm;
  padding: 2mm 0;
  align-items: baseline;
  color: inherit;
}
.toc__item--d1 .toc__link {
  padding: 3mm 0;
}
.toc__item--d1 .toc__name {
  font-weight: 700;
  font-size: 10pt;
  letter-spacing: -0.005em;
}
.toc__item--d2 .toc__link { padding-left: 6mm; }
.toc__item--d3 .toc__link { padding-left: 12mm; }
.toc__item--d4 .toc__link { padding-left: 18mm; }
.toc__item--d3 .toc__name,
.toc__item--d4 .toc__name { color: hsl(var(--muted-foreground)); }
.toc__num {
  font-size: 7.6pt;
  color: hsl(var(--muted-foreground));
}
.toc__item--d1 .toc__num { color: hsl(var(--foreground)); font-weight: 700; }
.toc__name {
  font-size: 9pt;
  color: hsl(var(--foreground));
}

/* ---- Sections ----------------------------------------------------------- */

.section {}
.section--d1 {
  break-before: page;
  page-break-before: always;
  padding-top: 1mm;
}
.section__header {
  display: grid;
  grid-template-columns: 16mm 1fr;
  gap: 3mm;
  align-items: baseline;
  padding-bottom: 3mm;
  border-bottom: 1px solid hsl(var(--foreground));
  margin-bottom: 4mm;
}
.section--d2 .section__header,
.section--d3 .section__header,
.section--d4 .section__header,
.section--d5 .section__header {
  border-bottom: 1px solid hsl(var(--border));
  padding-bottom: 1.6mm;
  margin-top: 5mm;
  margin-bottom: 2.5mm;
}
.section__num {
  font-size: 9pt;
  color: hsl(var(--muted-foreground));
  letter-spacing: 0.04em;
  font-weight: 500;
}
.section--d1 .section__num {
  font-size: 11pt;
  color: hsl(var(--foreground));
  font-weight: 600;
}
.section__title {
  margin: 0;
  font-size: 14pt;
  font-weight: 700;
  letter-spacing: -0.015em;
  line-height: 1.2;
  color: hsl(var(--foreground));
}
.section--d2 .section__title { font-size: 11pt; font-weight: 600; }
.section--d3 .section__title { font-size: 9.8pt; font-weight: 600; }
.section--d4 .section__title { font-size: 9.2pt; font-weight: 600; }
.section--d5 .section__title { font-size: 9pt; font-weight: 600; }
.section__subtitle {
  margin-top: -2mm;
  margin-bottom: 3mm;
  font-size: 7.2pt;
  color: hsl(var(--muted-foreground));
}

/* ---- Cases -------------------------------------------------------------- */

.cases {
  list-style: none;
  margin: 0;
  padding: 0;
}
.case {
  padding: 2mm 0;
  border-bottom: 1px solid hsl(var(--border));
  break-inside: avoid;
  page-break-inside: avoid;
}
.case:last-child { border-bottom: none; }
.case__main {
  display: grid;
  grid-template-columns: 5mm 1fr auto auto;
  align-items: center;
  gap: 2.5mm;
}
.case__status {
  font-size: 10pt;
  text-align: center;
  font-weight: 600;
  line-height: 1;
  color: hsl(var(--muted-foreground));
}
.case.is-pass .case__status { color: hsl(var(--success)); }
.case.is-fail .case__status { color: hsl(var(--destructive)); }
.case.is-skip .case__status { color: hsl(var(--muted-foreground)); }
.case.is-todo .case__status { color: hsl(var(--warning)); }
.case__name {
  font-size: 9.4pt;
  font-weight: 600;
  color: hsl(var(--foreground));
  letter-spacing: -0.005em;
}
.case.is-fail .case__name { color: hsl(var(--destructive)); }
.case.is-skip .case__name { color: hsl(var(--muted-foreground)); font-weight: 500; }
.case.is-todo .case__name { color: hsl(var(--foreground)); }
.case__chips {
  display: flex;
  gap: 1mm;
  align-items: center;
  flex-wrap: wrap;
}
.case__duration {
  font-size: 7.4pt;
  color: hsl(var(--muted-foreground));
  text-align: right;
  white-space: nowrap;
}

.case__desc {
  margin: 1.4mm 0 0 7.5mm;
  font-size: 8.4pt;
  color: hsl(var(--muted-foreground));
  line-height: 1.5;
  max-width: 150mm;
}
.case__annot { margin: 1.4mm 0 0 7.5mm; display: flex; flex-direction: column; gap: 0.6mm; }
.case__kv { display: grid; grid-template-columns: 18mm 1fr; gap: 3mm; align-items: baseline; font-size: 8pt; }
.case__kv-key {
  font-family: "JetBrains Mono", monospace;
  font-size: 6.6pt;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: hsl(var(--muted-foreground));
}
.case__kv > span:last-child {
  color: hsl(var(--foreground));
}

/* ---- Error block -------------------------------------------------------- */

.error {
  margin: 2.5mm 0 1mm 7.5mm;
  background: hsl(var(--destructive-soft));
  border: 1px solid hsl(var(--destructive) / 0.18);
  border-radius: var(--radius);
  padding: 3mm 4mm;
}
.error__head {
  display: flex;
  align-items: center;
  gap: 2mm;
  margin-bottom: 2mm;
}
.error__msg {
  font-family: "JetBrains Mono", monospace;
  font-size: 8.2pt;
  color: hsl(var(--destructive));
  white-space: pre-wrap;
  word-break: break-word;
  font-weight: 600;
}
.error__section { margin-top: 2mm; }
.error__label {
  font-family: "JetBrains Mono", monospace;
  font-size: 6.4pt;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: hsl(var(--destructive));
  font-weight: 600;
  margin-bottom: 1.2mm;
}
.error__pre {
  margin: 0;
  font-family: "JetBrains Mono", monospace;
  font-size: 7.8pt;
  line-height: 1.45;
  color: hsl(var(--foreground));
  background: hsl(var(--background));
  border: 1px solid hsl(var(--destructive) / 0.15);
  border-radius: calc(var(--radius) - 2px);
  padding: 2.2mm 2.6mm;
  white-space: pre-wrap;
  word-break: break-word;
}
.error__pre--diff { color: hsl(var(--foreground)); }

/* ---- Print niceties ----------------------------------------------------- */

.section__header,
.section__subtitle,
.case__main {
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
  const t = TXT[options.locale]
  const cover = options.includeCoverPage ? renderCover(view, t) : ''
  const failures = renderFailuresIndex(view, t)
  const toc = options.includeTableOfContents ? renderToc(view, t) : ''
  const body = view.sections.map((s) => renderSection(s, t, options)).join('')
  const customCss = options.customCss ? `\n/* customCss */\n${options.customCss}` : ''

  return `<!doctype html>
<html lang="${options.locale}">
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
  const t = TXT[view.options.locale]
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
  <span style="text-transform: uppercase; letter-spacing: 0.18em;">${esc(t.docKind)}</span>
</div>`
}

export function renderHeaderTemplate(): string {
  return `<div style="display:none"></div>`
}

/* -------------------------------------------------------------------------- */

export const __internal = { esc, fmtDuration, fmtDate, statusGlyph, priorityVariant }
export type { SpecSummary }
