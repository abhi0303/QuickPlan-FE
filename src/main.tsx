import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { registerServiceWorker } from './services/push'
import { watchSafeArea } from './utils/safeArea'

// before the first paint, so the header is never laid out twice
watchSafeArea()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Registered on load so the app is installable and can receive push. Failing
// to register is not fatal — the app works without it.
void registerServiceWorker()
