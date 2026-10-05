import { useEffect, useState } from 'react'
import './App.css'

function App() {
  const [message, setMessage] = useState('Loading connection...')

  useEffect(() => {
    fetch('/api/hello')
      .then((response) => {
        if (!response.ok) {
          throw new Error('Network response was not ok')
        }
        return response.json()
      })
      .then((data) => setMessage(data.message))
      .catch(() => setMessage('Unable to reach the Node server.'))
  }, [])

  return (
    <main className="app-shell">
      <div className="card">
        <p className="eyebrow">Connected app</p>
        <h1>React + Node.js</h1>
        <p className="message">{message}</p>
        <p className="subtext">
          This frontend is calling the backend API through the Vite proxy.
        </p>
      </div>
    </main>
  )
}

export default App
