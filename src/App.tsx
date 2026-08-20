import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { DashboardPage } from './pages/DashboardPage'
import { PlaceholderPage } from './pages/PlaceholderPage'
import { SettingsPage } from './pages/SettingsPage'
import './styles/global.scss'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/tasks" element={<PlaceholderPage title="Tasks" eyebrow="Your work" description="Plan, prioritize, and complete everything that matters." />} />
          <Route path="/reminders" element={<PlaceholderPage title="Reminders" eyebrow="Stay on time" description="Keep important moments visible with smart reminders." />} />
          <Route path="/expenses" element={<PlaceholderPage title="Money" eyebrow="Simple finances" description="Track IOUs, expenses, and shared costs without the spreadsheet." />} />
          <Route path="/people" element={<PlaceholderPage title="People" eyebrow="Your circle" description="See balances and transaction history with the people you know." />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
