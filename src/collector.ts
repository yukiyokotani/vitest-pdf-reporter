import type {
  SpecCase,
  SpecDocument,
  SpecGroup,
  SpecMeta,
  SpecNode,
  SpecSummary,
  TestStatus,
} from './types'

/**
 * Minimal duck-typed view of a Vitest runner task.
 *
 * We don't import Vitest's task types here so the collector can be unit-tested
 * without booting Vitest. The real Reporter calls pass `RunnerTestFile[]` which
 * is a structural superset of this interface.
 */
export interface TaskLike {
  type: 'suite' | 'test' | 'custom' | string
  name: string
  /** Present for "file" suites — absolute path on disk. */
  filepath?: string
  mode?: 'run' | 'skip' | 'todo' | 'only' | string
  tasks?: TaskLike[]
  result?: {
    state?: 'pass' | 'fail' | 'skip' | 'todo' | string
    duration?: number
    errors?: Array<{ message?: string; stack?: string; diff?: string } | undefined>
  }
  meta?: Record<string, unknown>
}

/**
 * Strip noisy framework frames from a stack trace so the PDF only highlights
 * the user-relevant call site. Keeps the first message line, plus the first
 * few frames that don't reference `node_modules`, `node:internal/`, or vitest
 * internals.
 */
function trimStack(stack: string | undefined): string | undefined {
  if (!stack) return undefined
  const lines = stack.split('\n')
  const kept: string[] = []
  for (const line of lines) {
    const isFrame = /^\s*at\s/.test(line)
    if (!isFrame) {
      kept.push(line)
      continue
    }
    if (/[\\/]node_modules[\\/]|node:internal[\\/]|[\\/]tinypool[\\/]/.test(line)) continue
    kept.push(line)
    if (kept.filter((l) => /^\s*at\s/.test(l)).length >= 6) break
  }
  return kept.join('\n').trim() || undefined
}

function resolveStatus(task: TaskLike): TestStatus {
  const s = task.result?.state
  if (s === 'pass' || s === 'fail' || s === 'skip' || s === 'todo') return s
  // No result yet — fall back to the declared mode.
  if (task.mode === 'todo') return 'todo'
  if (task.mode === 'skip') return 'skip'
  // Default: count as skip rather than silently dropping.
  return 'skip'
}

function buildCase(task: TaskLike, filePath: string): SpecCase {
  const status = resolveStatus(task)
  const meta = (task.meta ?? {}) as SpecMeta
  const node: SpecCase = {
    kind: 'case',
    name: task.name,
    status,
    durationMs: task.result?.duration ?? 0,
    filePath,
    meta,
  }
  if (status === 'fail') {
    const err = task.result?.errors?.[0]
    node.error = {
      message: err?.message ?? 'Unknown error',
      stack: trimStack(err?.stack),
      diff: err?.diff,
    }
  }
  return node
}

function buildNodes(tasks: TaskLike[], filePath: string): SpecNode[] {
  const out: SpecNode[] = []
  for (const t of tasks) {
    if (t.type === 'suite') {
      const children = buildNodes(t.tasks ?? [], filePath)
      // Skip suites that have no surviving children (e.g., dynamic suites that
      // produced nothing). Otherwise keep them as a group.
      if (children.length === 0) continue
      out.push({ kind: 'group', name: t.name, children } satisfies SpecGroup)
    } else if (t.type === 'test' || t.type === 'custom') {
      out.push(buildCase(t, filePath))
    }
  }
  return out
}

function summarize(roots: SpecGroup[]): SpecSummary {
  const counts: SpecSummary = {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    todo: 0,
    passRate: 0,
    durationMs: 0,
    fileCount: roots.length,
  }
  const visit = (node: SpecNode) => {
    if (node.kind === 'case') {
      counts.total += 1
      counts.durationMs += node.durationMs
      switch (node.status) {
        case 'pass': counts.passed += 1; break
        case 'fail': counts.failed += 1; break
        case 'skip': counts.skipped += 1; break
        case 'todo': counts.todo += 1; break
      }
    } else {
      for (const c of node.children) visit(c)
    }
  }
  for (const r of roots) visit(r)
  counts.passRate = counts.total === 0 ? 0 : counts.passed / counts.total
  return counts
}

/**
 * Walk the Vitest file tree and produce a structured, framework-independent
 * spec tree plus aggregated summary.
 */
export function collectSpecDocument(files: TaskLike[]): SpecDocument {
  const roots: SpecGroup[] = []
  for (const f of files) {
    const filePath = f.filepath ?? f.name
    const children = buildNodes(f.tasks ?? [], filePath)
    const displayName = f.name && f.name.length > 0 ? f.name : (f.filepath ?? '(unknown)')
    roots.push({ kind: 'group', name: displayName, filePath, children })
  }
  return {
    generatedAt: new Date(),
    roots,
    summary: summarize(roots),
  }
}
