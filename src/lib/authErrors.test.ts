import { describe, expect, it } from 'vitest'
import { formatAuthError } from '@/lib/authErrors'

describe('formatAuthError', () => {
  it('handles non-Error values', () => {
    expect(formatAuthError('nope')).toMatch(/Sign-in failed/)
    expect(formatAuthError(null)).toMatch(/Sign-in failed/)
  })

  it('maps known Firebase auth codes to actionable messages', () => {
    const cases: { code: string; match: RegExp }[] = [
      {
        code: 'auth/operation-not-allowed',
        match: /Google sign-in is not enabled/i,
      },
      {
        code: 'auth/unauthorized-domain',
        match: /domain is not authorized/i,
      },
      { code: 'auth/popup-blocked', match: /popup was blocked/i },
      {
        code: 'auth/popup-closed-by-user',
        match: /closed before finishing/i,
      },
      {
        code: 'auth/network-request-failed',
        match: /Network error/i,
      },
      { code: 'auth/invalid-api-key', match: /API key/i },
    ]
    for (const { code, match } of cases) {
      const err = Object.assign(new Error('x'), { code })
      expect(formatAuthError(err)).toMatch(match)
    }
  })

  it('falls back to message + code for unknown errors', () => {
    const err = Object.assign(new Error('weird'), {
      code: 'auth/something-new',
    })
    expect(formatAuthError(err)).toMatch(/weird/)
    expect(formatAuthError(err)).toMatch(/auth\/something-new/)
  })
})
