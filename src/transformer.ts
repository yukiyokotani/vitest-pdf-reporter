import type {
  ResolvedPdfReporterOptions,
  SpecCase,
  SpecDocument,
  SpecError,
  SpecGroup,
  SpecMeta,
  SpecNode,
  SpecSummary,
  TestStatus,
} from './types'

export interface ViewCase {
  id: string
  status: TestStatus
  name: string
  durationMs: number
  meta: SpecMeta
  filePath: string
  error?: SpecError
}

/** Aggregate of all cases at or below a section. */
export interface ViewSectionSummary {
  total: number
  passed: number
  failed: number
  skipped: number
  todo: number
}

export interface ViewSection {
  id: string
  number: string
  depth: number
  name: string
  /** File path shown as a subtitle (only set on top-level sections). */
  subtitle?: string
  cases: ViewCase[]
  children: ViewSection[]
  summary: ViewSectionSummary
}

export interface ViewTocEntry {
  id: string
  number: string
  name: string
  depth: number
}

/** A failed case projected to the top of the document for cross-referencing. */
export interface ViewFailure {
  caseId: string
  name: string
  sectionNumber: string
  sectionPath: string
  requirementId?: string
}

export interface View {
  title: string
  projectName?: string
  version?: string
  generatedAt: Date
  summary: SpecSummary
  sections: ViewSection[]
  toc: ViewTocEntry[]
  failures: ViewFailure[]
  options: ResolvedPdfReporterOptions
}

let __idCounter = 0
function nextId(prefix: string): string {
  __idCounter += 1
  return `${prefix}-${__idCounter}`
}

function isGroup(n: SpecNode): n is SpecGroup {
  return n.kind === 'group'
}

function buildCase(c: SpecCase): ViewCase {
  return {
    id: nextId('case'),
    status: c.status,
    name: c.name,
    durationMs: c.durationMs,
    meta: c.meta,
    filePath: c.filePath,
    error: c.error,
  }
}

function buildSection(
  node: SpecGroup,
  numberPath: number[],
  depth: number,
  subtitle: string | undefined,
): ViewSection {
  const directCases: ViewCase[] = []
  const subGroups: SpecGroup[] = []
  for (const child of node.children) {
    if (isGroup(child)) subGroups.push(child)
    else directCases.push(buildCase(child))
  }

  const children: ViewSection[] = subGroups.map((g, i) =>
    buildSection(g, [...numberPath, i + 1], depth + 1, undefined),
  )

  const summary: ViewSectionSummary = { total: 0, passed: 0, failed: 0, skipped: 0, todo: 0 }
  for (const c of directCases) {
    summary.total += 1
    switch (c.status) {
      case 'pass': summary.passed += 1; break
      case 'fail': summary.failed += 1; break
      case 'skip': summary.skipped += 1; break
      case 'todo': summary.todo += 1; break
    }
  }
  for (const child of children) {
    summary.total += child.summary.total
    summary.passed += child.summary.passed
    summary.failed += child.summary.failed
    summary.skipped += child.summary.skipped
    summary.todo += child.summary.todo
  }

  const section: ViewSection = {
    id: nextId('sec'),
    number: numberPath.join('.'),
    depth,
    name: node.name,
    cases: directCases,
    children,
    summary,
  }
  if (subtitle) section.subtitle = subtitle
  return section
}

/**
 * Convert the collected SpecDocument into the view-model consumed by the
 * HTML template. Section numbering follows depth-first traversal in source
 * order. Top-level file groups that contain exactly one suite child and zero
 * direct cases are collapsed — the inner describe becomes the top section,
 * with the file path preserved as a subtitle.
 */
export function transformToView(
  doc: SpecDocument,
  options: ResolvedPdfReporterOptions,
): View {
  __idCounter = 0
  const sections: ViewSection[] = []

  doc.roots.forEach((root, idx) => {
    const onlyGroupChild =
      root.children.length === 1 && isGroup(root.children[0]!) ? (root.children[0]! as SpecGroup) : null
    const num = [idx + 1]
    if (onlyGroupChild) {
      // Collapsed: the inner describe becomes the section title — keep the
      // file path as a subtitle for traceability.
      sections.push(buildSection(onlyGroupChild, num, 1, root.filePath ?? root.name))
    } else {
      // Not collapsed: the file path *is* the section title; suppress the
      // subtitle so we don't repeat the same path twice.
      sections.push(buildSection(root, num, 1, undefined))
    }
  })

  const toc: ViewTocEntry[] = []
  const failures: ViewFailure[] = []
  const walk = (s: ViewSection, sectionPath: string[]) => {
    toc.push({ id: s.id, number: s.number, name: s.name, depth: s.depth })
    const path = [...sectionPath, s.name]
    for (const c of s.cases) {
      if (c.status === 'fail') {
        const f: ViewFailure = {
          caseId: c.id,
          name: c.name,
          sectionNumber: s.number,
          sectionPath: path.join(' › '),
        }
        if (typeof c.meta.requirementId === 'string') f.requirementId = c.meta.requirementId
        failures.push(f)
      }
    }
    s.children.forEach((child) => walk(child, path))
  }
  sections.forEach((s) => walk(s, []))

  const view: View = {
    title: options.title,
    generatedAt: doc.generatedAt,
    summary: doc.summary,
    sections,
    toc,
    failures,
    options,
  }
  if (options.projectName) view.projectName = options.projectName
  if (options.version) view.version = options.version
  return view
}
