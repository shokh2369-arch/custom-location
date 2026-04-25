import './App.css'

function App() {
  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ margin: 0 }}>Telegram Mini App — Location Picker</h2>
      <p style={{ marginTop: 10, opacity: 0.8 }}>
        Open the dedicated picker page:
      </p>
      <p style={{ marginTop: 10 }}>
        <a href="/pick-location.html?mode=drop" style={{ color: 'inherit' }}>
          /pick-location.html?mode=drop
        </a>
      </p>
    </div>
  )
}

export default App
