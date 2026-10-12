import { describe, expect, it } from 'vitest'
import { describeHistory } from './history.js'

describe('describeHistory', () => {
  it('describes edits field by field, in plain words', () => {
    expect(
      describeHistory({
        action: 'user.updated',
        changes: {
          phone: { from: null, to: '555-0100' },
          start_date: { from: '2030-01-15', to: '2030-02-01' },
          role: { from: 'employee', to: 'supervisor' },
        },
      }),
    ).toBe('changed phone from blank to 555-0100; start date from Jan 15, 2030 to Feb 1, 2030; role from Employee to Supervisor')
  })

  it('describes status changes as what they mean', () => {
    const status = (from, to) => describeHistory({ action: 'user.status_changed', changes: { status: { from, to } } })
    expect(status('onboarding', 'active')).toBe('marked onboarding complete')
    expect(status('active', 'archived')).toBe('archived this person')
    expect(status('archived', 'active')).toBe('restored this person (Active)')
  })

  it('describes supervisors, tasks and notes', () => {
    expect(
      describeHistory({ action: 'user.supervisors_changed', changes: { supervisors: { from: [], to: ['Sue', 'Max'] } } }),
    ).toBe('set supervisors to Sue, Max')
    expect(
      describeHistory({ action: 'user.supervisors_changed', changes: { supervisors: { from: ['Sue'], to: [] } } }),
    ).toBe('removed all supervisors')
    expect(describeHistory({ action: 'task.completed', changes: { task: { from: null, to: 'Submit tax forms' } } })).toBe(
      'ticked “Submit tax forms”',
    )
    expect(describeHistory({ action: 'note.added', changes: null })).toBe('added a note')
  })

  it('falls back to the raw action for anything new', () => {
    expect(describeHistory({ action: 'something.new', changes: null })).toBe('something.new')
  })
})
