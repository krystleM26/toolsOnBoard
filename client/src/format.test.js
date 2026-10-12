import { describe, expect, it } from 'vitest'
import { documentStatus, formatDate } from './format.js'

describe('formatDate', () => {
  it('formats a date without shifting the day', () => {
    expect(formatDate('2026-10-02')).toBe('Oct 2, 2026')
    expect(formatDate('2027-01-01')).toBe('Jan 1, 2027')
  })

  it('returns an empty string for no date', () => {
    expect(formatDate(null)).toBe('')
  })
})

describe('documentStatus', () => {
  const allGood = {
    docs_expired: 0,
    docs_expiring: 0,
    docs_missing: 0,
    docs_missing_names: [],
    next_expiry: { type: 'TB Test', expires_on: '2027-06-01' },
  }

  it('says all current when nothing is wrong', () => {
    expect(documentStatus(allGood)).toEqual({ tone: 'ok', text: 'All current', extra: null })
  })

  it('puts expired documents first, and mentions missing ones underneath', () => {
    const person = {
      ...allGood,
      docs_expired: 2,
      docs_expiring: 1,
      docs_missing: 1,
      docs_missing_names: ['TB Test'],
      next_expiry: { type: 'CPR Certification', expires_on: '2026-10-02' },
    }
    expect(documentStatus(person)).toEqual({
      tone: 'bad',
      text: 'CPR Certification expired Oct 2, 2026 (+1 more)',
      extra: 'TB Test missing',
    })
  })

  it('warns about documents expiring soon', () => {
    const person = { ...allGood, docs_expiring: 1, next_expiry: { type: 'Car Insurance', expires_on: '2026-11-01' } }
    expect(documentStatus(person)).toEqual({
      tone: 'warn',
      text: 'Car Insurance expires Nov 1, 2026',
      extra: null,
    })
  })

  it('names a single missing document, and counts several', () => {
    expect(documentStatus({ ...allGood, docs_missing: 1, docs_missing_names: ['TB Test'] }).text).toBe(
      'TB Test missing',
    )
    expect(
      documentStatus({ ...allGood, docs_missing: 3, docs_missing_names: ['A', 'B', 'C'], next_expiry: null }).text,
    ).toBe('3 documents missing')
  })
})
