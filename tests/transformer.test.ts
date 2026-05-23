import { describe, expect, it } from 'vitest'
import { resolveOptions } from '../src/reporter'
import { transformToView } from '../src/transformer'
import type { SpecDocument, SpecGroup } from '../src/types'

function group(name: string, children: SpecGroup['children']): SpecGroup {
  return { kind: 'group', name, children }
}

function passCase(name: string) {
  return {
    kind: 'case' as const,
    name,
    status: 'pass' as const,
    durationMs: 0,
    filePath: 'x.spec.ts',
    meta: {},
  }
}

function makeDoc(roots: SpecGroup[]): SpecDocument {
  return {
    generatedAt: new Date('2026-05-23T10:00:00Z'),
    roots,
    summary: {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      todo: 0,
      passRate: 0,
      durationMs: 0,
      fileCount: roots.length,
    },
  }
}

const opts = resolveOptions({ title: 'Test Spec' })

describe('transformToView', () => {
  it('produces empty sections and toc for an empty doc', () => {
    const view = transformToView(makeDoc([]), opts)
    expect(view.sections).toEqual([])
    expect(view.toc).toEqual([])
    expect(view.title).toBe('Test Spec')
  })

  it('numbers top-level sections sequentially', () => {
    const view = transformToView(
      makeDoc([group('a.spec.ts', [passCase('t1')]), group('b.spec.ts', [passCase('t2')])]),
      opts,
    )
    expect(view.sections).toHaveLength(2)
    expect(view.sections[0]!.number).toBe('1')
    expect(view.sections[1]!.number).toBe('2')
  })

  it('numbers nested sections with dotted notation', () => {
    const view = transformToView(
      makeDoc([
        group('root.spec.ts', [
          group('A', [group('A1', [passCase('t')]), group('A2', [passCase('t')])]),
        ]),
      ]),
      opts,
    )
    // root.spec.ts collapses because it has a single suite child + no direct cases.
    // So "A" becomes section 1, A1 → 1.1, A2 → 1.2.
    const top = view.sections[0]!
    expect(top.number).toBe('1')
    expect(top.name).toBe('A')
    expect(top.children).toHaveLength(2)
    expect(top.children[0]!.number).toBe('1.1')
    expect(top.children[0]!.name).toBe('A1')
    expect(top.children[1]!.number).toBe('1.2')
  })

  it('does NOT collapse the file group when it has multiple top-level children', () => {
    const view = transformToView(
      makeDoc([
        group('multi.spec.ts', [
          group('Feature A', [passCase('a')]),
          group('Feature B', [passCase('b')]),
        ]),
      ]),
      opts,
    )
    expect(view.sections[0]!.name).toBe('multi.spec.ts')
    expect(view.sections[0]!.children).toHaveLength(2)
  })

  it('builds a flat TOC matching section order', () => {
    const view = transformToView(
      makeDoc([
        group('f.spec.ts', [
          group('Feature', [
            group('Sub A', [passCase('t1')]),
            group('Sub B', [passCase('t2')]),
          ]),
        ]),
      ]),
      opts,
    )
    expect(view.toc.map((e) => `${e.number} ${e.name}`)).toEqual([
      '1 Feature',
      '1.1 Sub A',
      '1.2 Sub B',
    ])
  })

  it('assigns unique anchor ids to every section', () => {
    const view = transformToView(
      makeDoc([
        group('a.spec.ts', [group('X', [passCase('t')])]),
        group('b.spec.ts', [group('X', [passCase('t')])]),
      ]),
      opts,
    )
    const ids = view.toc.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('keeps direct cases under their owning section', () => {
    const view = transformToView(
      makeDoc([group('s.spec.ts', [passCase('alpha'), passCase('beta')])]),
      opts,
    )
    expect(view.sections[0]!.cases.map((c) => c.name)).toEqual(['alpha', 'beta'])
  })

  it('propagates resolved options into the view', () => {
    const view = transformToView(makeDoc([]), resolveOptions({ title: 'X', projectName: 'P', version: '1.2.3' }))
    expect(view.title).toBe('X')
    expect(view.projectName).toBe('P')
    expect(view.version).toBe('1.2.3')
  })

  it('collects failures with section path for cross-referencing', () => {
    const failingCase = {
      kind: 'case' as const,
      name: 'something broke',
      status: 'fail' as const,
      durationMs: 1,
      filePath: 'b.spec.ts',
      meta: { requirementId: 'REQ-FAIL-001' },
      error: { message: 'boom' },
    }
    const view = transformToView(
      makeDoc([
        group('a.spec.ts', [passCase('ok')]),
        group('b.spec.ts', [group('Feature', [group('Sub', [failingCase])])]),
      ]),
      opts,
    )
    expect(view.failures).toHaveLength(1)
    const f = view.failures[0]!
    expect(f.name).toBe('something broke')
    expect(f.requirementId).toBe('REQ-FAIL-001')
    // Second file is section 2; collapsed once because it has a single
    // top-level child group, so the failing case lives at 2.1 (Sub).
    expect(f.sectionNumber).toBe('2.1')
    expect(f.sectionPath).toContain('Sub')
    // caseId points at the rendered case anchor.
    expect(f.caseId).toMatch(/^case-/)
  })

  it('returns an empty failures array when nothing failed', () => {
    const view = transformToView(
      makeDoc([group('a.spec.ts', [passCase('ok')])]),
      opts,
    )
    expect(view.failures).toEqual([])
  })
})
