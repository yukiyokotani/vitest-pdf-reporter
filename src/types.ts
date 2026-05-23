/**
 * Status of a single test case.
 */
export type TestStatus = 'pass' | 'fail' | 'skip' | 'todo'

/**
 * Metadata that test authors can attach via `task.meta` to enrich the spec.
 * All fields are optional.
 */
export interface SpecMeta {
  requirementId?: string
  priority?: '高' | '中' | '低' | 'high' | 'medium' | 'low' | string
  precondition?: string
  category?: string
  description?: string
  note?: string
  [key: string]: unknown
}

/**
 * A single test case in the structured spec tree.
 */
export interface SpecCase {
  kind: 'case'
  name: string
  status: TestStatus
  durationMs: number
  filePath: string
  meta: SpecMeta
  /** Present when status === 'fail'. */
  error?: SpecError
}

export interface SpecError {
  message: string
  stack?: string
  diff?: string
}

/**
 * A describe-block grouping cases and/or further nested groups.
 */
export interface SpecGroup {
  kind: 'group'
  name: string
  filePath?: string
  children: SpecNode[]
}

export type SpecNode = SpecGroup | SpecCase

/**
 * Aggregated counts over the whole run.
 */
export interface SpecSummary {
  total: number
  passed: number
  failed: number
  skipped: number
  todo: number
  passRate: number
  durationMs: number
  fileCount: number
}

/**
 * The fully-collected, structured representation of a Vitest run.
 * This is the canonical intermediate format consumed by `transformer`.
 */
export interface SpecDocument {
  generatedAt: Date
  roots: SpecGroup[]
  summary: SpecSummary
}

/**
 * User-facing configuration for the reporter.
 *
 * Labels (Pass Rate, Failed, Contents, etc.) are not configurable — they are
 * fixed English strings. Everything that's specific to a particular project
 * (title, project name, version, output path, etc.) is.
 */
export interface PdfReporterOptions {
  outputFile?: string
  title?: string
  projectName?: string
  version?: string
  paperSize?: 'A4' | 'Letter'
  orientation?: 'portrait' | 'landscape'
  includeCoverPage?: boolean
  includeTableOfContents?: boolean
  includeStackTrace?: boolean
  customCss?: string
  logoPath?: string
  theme?: 'default' | 'minimal'
}

export interface ResolvedPdfReporterOptions extends Required<Omit<PdfReporterOptions, 'projectName' | 'version' | 'customCss' | 'logoPath'>> {
  projectName?: string
  version?: string
  customCss?: string
  logoPath?: string
}
