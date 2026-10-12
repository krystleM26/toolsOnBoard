import { formatDateTime } from '../format.js'
import { describeHistory } from './history.js'

function HistoryCard({ history }) {
  return (
    <section className="panel card-section" aria-label="History">
      <h2>History</h2>
      {history.length === 0 ? (
        <p className="muted">No changes yet.</p>
      ) : (
        <ul className="timeline">
          {history.map((entry) => (
            <li key={entry.id}>
              <div className="muted task-meta">{formatDateTime(entry.created_at)}</div>
              <p>
                <strong>{entry.actor_name ?? 'System'}</strong> {describeHistory(entry)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default HistoryCard
