import { describe, expect, it } from 'vitest'

/**
 * Domain-style example: a user management API spec.
 * Tests double as the spec — `task.meta` carries spec-only metadata.
 */

interface User {
  id: string
  email: string
  name: string
}
const users = new Map<string, User>()

function createUser(input: { email: string; name: string }): User {
  if ([...users.values()].some((u) => u.email === input.email)) {
    const err = new Error('email already in use') as Error & { status?: number }
    err.status = 409
    throw err
  }
  const u: User = { id: `u_${users.size + 1}`, ...input }
  users.set(u.id, u)
  return u
}

describe('ユーザー管理API', () => {
  describe('POST /users — ユーザー作成', () => {
    describe('正常系', () => {
      it('必須項目のみでユーザーを作成できること', ({ task }) => {
        task.meta.requirementId = 'REQ-USER-001'
        task.meta.priority = '高'
        task.meta.category = '正常系'
        task.meta.precondition = '未登録のメールアドレスであること'
        task.meta.description = 'email / name を渡すと新しい User が返る。id は自動採番。'

        const u = createUser({ email: 'alice@example.com', name: 'Alice' })
        expect(u.id).toMatch(/^u_/)
        expect(u.email).toBe('alice@example.com')
      })

      it('複数ユーザーを連続して作成できること', ({ task }) => {
        task.meta.requirementId = 'REQ-USER-003'
        task.meta.priority = '中'
        task.meta.category = '正常系'

        const a = createUser({ email: 'bob@example.com', name: 'Bob' })
        const b = createUser({ email: 'carol@example.com', name: 'Carol' })
        expect(a.id).not.toBe(b.id)
      })
    })

    describe('異常系', () => {
      it('メールアドレスが重複している場合、409 を返すこと', ({ task }) => {
        task.meta.requirementId = 'REQ-USER-002'
        task.meta.priority = '高'
        task.meta.category = '異常系'
        task.meta.note = '重複検出はメールアドレスの完全一致のみ'

        expect(() => createUser({ email: 'alice@example.com', name: 'Alice Two' })).toThrow(
          /already in use/,
        )
      })
    })
  })

  describe('GET /users/:id — ユーザー取得', () => {
    it.skip('指定 ID のユーザーを返すこと', ({ task }) => {
      task.meta.requirementId = 'REQ-USER-010'
      task.meta.priority = '中'
      // 未実装
    })

    it.todo('存在しない ID の場合、404 を返すこと')
  })
})

describe('認証フロー', () => {
  describe('POST /sessions — ログイン', () => {
    it('正しい認証情報でログインできること', ({ task }) => {
      task.meta.requirementId = 'REQ-AUTH-001'
      task.meta.priority = '高'
      task.meta.category = '正常系'
      task.meta.description = 'パスワードは bcrypt 比較。成功時は session cookie を Set-Cookie。'
      expect(true).toBe(true)
    })

    it('連続失敗 5 回でアカウントをロックすること', ({ task }) => {
      task.meta.requirementId = 'REQ-AUTH-005'
      task.meta.priority = '高'
      task.meta.category = '異常系'
      task.meta.precondition = '同一 IP / 同一アカウントでの 5 回連続失敗'
      // Intentional failure to demonstrate failure rendering.
      const attempts = 5
      const lockedAfter = 6
      expect(attempts).toBe(lockedAfter)
    })
  })
})
