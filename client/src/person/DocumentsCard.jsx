import { formatDate } from '../format.js'

const STATE_DISPLAY = {
  missing: { tone: 'bad', icon: '✕', label: 'Missing' },
  expired: { tone: 'bad', icon: '✕', label: 'Expired' },
  expiring: { tone: 'warn', icon: '⚠', label: 'Expiring soon' },
  current: { tone: 'ok', icon: '✓', label: 'Current' },
}

// Each required document and where it stands.
function DocumentsCard({ documents, warningDays }) {
  return (
    <section className="panel card-section" aria-label="Documents">
      <div className="card-header">
        <h2>Documents</h2>
        <span className="muted">“Expiring soon” = within {warningDays} days</span>
      </div>
      <div className="table-scroll table-plain">
        <table className="staff-table documents-table">
          <thead>
            <tr>
              <th scope="col">Document</th>
              <th scope="col">Status</th>
              <th scope="col">Expires</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((doc) => {
              const { tone, icon, label } = STATE_DISPLAY[doc.state]
              return (
                <tr key={doc.type_id}>
                  <td>
                    {doc.type}
                    {doc.valid_for_months && (
                      <div className="muted task-meta">Valid {doc.valid_for_months} months from test date</div>
                    )}
                  </td>
                  <td className={`doc-status tone-${tone}`}>
                    <span aria-hidden="true">{icon}</span> {label}
                  </td>
                  <td>{formatDate(doc.expires_on) || '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default DocumentsCard
