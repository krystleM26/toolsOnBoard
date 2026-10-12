// The "needs attention" strip above the staff table, for the current tab.
function AttentionSummary({ tab, summary }) {
  const items =
    tab === 'onboarding'
      ? [
          { count: summary.onboarding.behind, label: 'started work, checklist unfinished', tone: 'warn' },
          { count: summary.onboarding.missingDocs, label: 'missing documents', tone: 'bad' },
        ]
      : [
          { count: summary.active.expired, label: 'with expired documents', tone: 'bad' },
          {
            count: summary.active.expiring,
            label: `with documents expiring within ${summary.warningDays} days`,
            tone: 'warn',
          },
          { count: summary.active.missingDocs, label: 'missing documents', tone: 'bad' },
        ]

  const needsAttention = items.filter((item) => item.count > 0)

  return (
    <section className="attention" aria-label="Needs attention">
      <h2 className="attention-title">Needs attention</h2>
      {needsAttention.length === 0 ? (
        <p className="attention-clear">All clear: nothing needs attention right now.</p>
      ) : (
        <ul className="attention-list">
          {needsAttention.map((item) => (
            <li key={item.label} className={`attention-item tone-${item.tone}`}>
              <strong>{item.count}</strong> {item.count === 1 ? 'person' : 'people'} {item.label}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default AttentionSummary
