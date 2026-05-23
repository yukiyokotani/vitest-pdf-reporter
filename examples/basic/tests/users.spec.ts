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

describe('User Management API', () => {
  describe('POST /users — Create user', () => {
    describe('Happy path', () => {
      it('creates a user with only the required fields', ({ task }) => {
        task.meta.requirementId = 'REQ-USER-001'
        task.meta.priority = 'high'
        task.meta.category = 'normal'
        task.meta.precondition = 'Email is not yet registered.'
        task.meta.description = 'email + name returns a new User; id is auto-assigned.'

        const u = createUser({ email: 'alice@example.com', name: 'Alice' })
        expect(u.id).toMatch(/^u_/)
        expect(u.email).toBe('alice@example.com')
      })

      it('creates multiple users in sequence', ({ task }) => {
        task.meta.requirementId = 'REQ-USER-003'
        task.meta.priority = 'medium'
        task.meta.category = 'normal'

        const a = createUser({ email: 'bob@example.com', name: 'Bob' })
        const b = createUser({ email: 'carol@example.com', name: 'Carol' })
        expect(a.id).not.toBe(b.id)
      })
    })

    describe('Edge cases', () => {
      it('returns 409 when the email is already in use', ({ task }) => {
        task.meta.requirementId = 'REQ-USER-002'
        task.meta.priority = 'high'
        task.meta.category = 'edge'
        task.meta.note = 'Duplicate detection is an exact match on the email field only.'

        expect(() => createUser({ email: 'alice@example.com', name: 'Alice Two' })).toThrow(
          /already in use/,
        )
      })
    })
  })

  describe('GET /users/:id — Get user', () => {
    it.skip('returns the user matching the given id', ({ task }) => {
      task.meta.requirementId = 'REQ-USER-010'
      task.meta.priority = 'medium'
      // Not implemented yet.
    })

    it.todo('returns 404 when the id does not exist')
  })
})

describe('Authentication flow', () => {
  describe('POST /sessions — Sign in', () => {
    it('signs in with valid credentials', ({ task }) => {
      task.meta.requirementId = 'REQ-AUTH-001'
      task.meta.priority = 'high'
      task.meta.category = 'normal'
      task.meta.description =
        'Password is bcrypt-compared. On success, the response sets a session cookie.'
      expect(true).toBe(true)
    })

    it('locks the account after 5 consecutive failures', ({ task }) => {
      task.meta.requirementId = 'REQ-AUTH-005'
      task.meta.priority = 'high'
      task.meta.category = 'edge'
      task.meta.precondition = '5 consecutive failures from the same IP / account'
      // Intentional failure to demonstrate failure rendering.
      const attempts = 5
      const lockedAfter = 6
      expect(attempts).toBe(lockedAfter)
    })
  })
})
