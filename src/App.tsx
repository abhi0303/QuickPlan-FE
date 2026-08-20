import { lazy, Suspense } from 'react'
import { Toaster } from 'react-hot-toast'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useAppStore } from './store/useAppStore'
import './styles/global.scss'

const AppShell = lazy(() => import('./components/layout/AppShell').then((module) => ({ default: module.AppShell })))
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((module) => ({ default: module.DashboardPage })))
const PlaceholderPage = lazy(() => import('./pages/PlaceholderPage').then((module) => ({ default: module.PlaceholderPage })))
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((module) => ({ default: module.SettingsPage })))
const AuthPage = lazy(() => import('./pages/AuthPage').then((module) => ({ default: module.AuthPage })))

function LoadingScreen() {
  return <div className="loading-screen"><span className="brand-mark">✦</span><span>Loading Quickplan...</span></div>
}

function App() {
  const session = useAppStore((state) => state.session)

  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Toaster position="top-right" toastOptions={{ style: { background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', fontSize: '13px' } }} />
      <Suspense fallback={<LoadingScreen />}>
        <Routes>
          <Route path="/auth" element={session ? <Navigate to="/" replace /> : <AuthPage />} />
          <Route element={session ? <AppShell /> : <Navigate to="/auth" replace />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/tasks" element={<PlaceholderPage title="Tasks" eyebrow="Your work" description="Plan, prioritize, and complete everything that matters." />} />
            <Route path="/reminders" element={<PlaceholderPage title="Reminders" eyebrow="Stay on time" description="Keep important moments visible with smart reminders." />} />
            <Route path="/expenses" element={<PlaceholderPage title="Money" eyebrow="Simple finances" description="Track IOUs, expenses, and shared costs without the spreadsheet." />} />
            <Route path="/people" element={<PlaceholderPage title="People" eyebrow="Your circle" description="See balances and transaction history with the people you know." />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to={session ? '/' : '/auth'} replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

export default App
