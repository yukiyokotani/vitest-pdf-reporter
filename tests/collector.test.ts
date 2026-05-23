import { describe, expect, it } from 'vitest'
import { collectSpecDocument } from '../src/collector'
import type { TaskLike } from '../src/collector'

/**
 * Helper to build a fake Vitest task tree for tests.
 * Mirrors the subset of Vitest's runner task shape that the collector reads.
 */
function makeTest(
  name: string,
  state: 'pass' | 'fail' | 'skip' | 'todo',
  opts: {
    duration?: number
    errors?: Array<{ message: string; stack?: string; diff?: string }>
    meta?: Record<string, unknown>
    mode?: 'run' | 'skip' | 'todo' | 'only'
  } = {},
): TaskLike {
  return {
    type: 'test',
    name,
    mode: opts.mode ?? (state === 'skip' ? 'skip' : state === 'todo' ? 'todo' : 'run'),
    result: { state, duration: opts.duration ?? 0, errors: opts.errors },
    meta: opts.meta ?? {},
  }
}

function makeSuite(name: string, tasks: TaskLike[]): TaskLike {
  return { type: 'suite', name, mode: 'run', tasks }
}

function makeFile(filepath: string, tasks: TaskLike[]): TaskLike {
  return { type: 'suite', name: filepath, filepath, mode: 'run', tasks }
}

describe('collectSpecDocument', () => {
  it('returns an empty document with zeroed summary when no files are given', () => {
    const doc = collectSpecDocument([])
    expect(doc.roots).toEqual([])
    expect(doc.summary).toMatchObject({
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      todo: 0,
      passRate: 0,
      fileCount: 0,
    })
  })

  it('collects a single passing test under a flat file', () => {
    const file = makeFile('user.spec.ts', [makeTest('adds two numbers', 'pass', { duration: 12 })])
    const doc = collectSpecDocument([file])

    expect(doc.roots).toHaveLength(1)
    const root = doc.roots[0]!
    expect(root.kind).toBe('group')
    expect(root.name).toBe('user.spec.ts')
    expect(root.children).toHaveLength(1)
    const child = root.children[0]!
    expect(child.kind).toBe('case')
    if (child.kind === 'case') {
      expect(child.name).toBe('adds two numbers')
      expect(child.status).toBe('pass')
      expect(child.durationMs).toBe(12)
      expect(child.filePath).toBe('user.spec.ts')
    }
    expect(doc.summary).toMatchObject({ total: 1, passed: 1, failed: 0, fileCount: 1, passRate: 1 })
  })

  it('preserves nested describe hierarchy', () => {
    const file = makeFile('api.spec.ts', [
      makeSuite('ユーザー管理API', [
        makeSuite('POST /users', [
          makeSuite('正常系', [makeTest('必須項目のみで作成できる', 'pass', { duration: 5 })]),
          makeSuite('異常系', [makeTest('メール重複で 409', 'pass', { duration: 7 })]),
        ]),
      ]),
    ])

    const doc = collectSpecDocument([file])
    const fileGroup = doc.roots[0]!
    expect(fileGroup.children).toHaveLength(1)

    const api = fileGroup.children[0]!
    expect(api.kind).toBe('group')
    if (api.kind === 'group') {
      expect(api.name).toBe('ユーザー管理API')
      const post = api.children[0]!
      expect(post.kind).toBe('group')
      if (post.kind === 'group') {
        expect(post.children).toHaveLength(2)
        expect(post.children[0]!.name).toBe('正常系')
        expect(post.children[1]!.name).toBe('異常系')
      }
    }
  })

  it('captures failure errors with message and stack', () => {
    const file = makeFile('fail.spec.ts', [
      makeTest('broken', 'fail', {
        duration: 3,
        errors: [{ message: 'expected 1 to equal 2', stack: 'at line 10' }],
      }),
    ])
    const doc = collectSpecDocument([file])
    const c = doc.roots[0]!.children[0]!
    if (c.kind === 'case') {
      expect(c.status).toBe('fail')
      expect(c.error?.message).toBe('expected 1 to equal 2')
      expect(c.error?.stack).toBe('at line 10')
    }
    expect(doc.summary.failed).toBe(1)
  })

  it('classifies skip and todo separately', () => {
    const file = makeFile('s.spec.ts', [
      makeTest('skipped one', 'skip'),
      makeTest('todo one', 'todo'),
      makeTest('ok one', 'pass'),
    ])
    const doc = collectSpecDocument([file])
    expect(doc.summary).toMatchObject({ total: 3, passed: 1, skipped: 1, todo: 1, failed: 0 })
  })

  it('extracts task.meta into SpecMeta', () => {
    const file = makeFile('m.spec.ts', [
      makeTest('with meta', 'pass', {
        meta: {
          requirementId: 'REQ-001',
          priority: '高',
          category: '正常系',
          precondition: 'ログイン済み',
          customField: 'kept',
        },
      }),
    ])
    const doc = collectSpecDocument([file])
    const c = doc.roots[0]!.children[0]!
    if (c.kind === 'case') {
      expect(c.meta.requirementId).toBe('REQ-001')
      expect(c.meta.priority).toBe('高')
      expect(c.meta.category).toBe('正常系')
      expect(c.meta.precondition).toBe('ログイン済み')
      expect(c.meta.customField).toBe('kept')
    }
  })

  it('aggregates summary across multiple files', () => {
    const f1 = makeFile('a.spec.ts', [
      makeTest('p1', 'pass', { duration: 10 }),
      makeTest('p2', 'pass', { duration: 20 }),
    ])
    const f2 = makeFile('b.spec.ts', [
      makeTest('f1', 'fail', { duration: 5, errors: [{ message: 'x' }] }),
    ])
    const doc = collectSpecDocument([f1, f2])
    expect(doc.summary.total).toBe(3)
    expect(doc.summary.passed).toBe(2)
    expect(doc.summary.failed).toBe(1)
    expect(doc.summary.durationMs).toBe(35)
    expect(doc.summary.fileCount).toBe(2)
    expect(doc.summary.passRate).toBeCloseTo(2 / 3, 5)
  })

  it('falls back to filepath when file.name is missing', () => {
    const file: TaskLike = {
      type: 'suite',
      name: '',
      filepath: '/abs/path/to/foo.spec.ts',
      mode: 'run',
      tasks: [makeTest('x', 'pass')],
    }
    const doc = collectSpecDocument([file])
    expect(doc.roots[0]!.name).toBe('/abs/path/to/foo.spec.ts')
  })
})
