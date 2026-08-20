import { lazy, Suspense } from 'react'
import { Toaster } from 'react-hot-toast'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AlarmClock, Sparkles, Users, Wallet } from 'lucide-react'
import { useAppStore } from './store/useAppStore'
import './styles/global.scss'

const AppShell = lazy(() => import('./components/layout/AppShell').then((module) => ({ default: module.AppShell })))
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((module) => ({ default: module.DashboardPage })))
const PlaceholderPage = lazy(() => import('./pages/PlaceholderPage').then((module) => ({ default: module.PlaceholderPage })))
const TasksPage = lazy(() => import('./pages/TasksPage').then((module) => ({ default: module.TasksPage })))
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((module) => ({ default: module.SettingsPage })))
const AuthPage = lazy(() => import('./pages/AuthPage').then((module) => ({ default: module.AuthPage })))

function LoadingScreen() {
  return (
    <div className="loading-screen">
      <span className="brand-mark"><Sparkles size={19} strokeWidth={2.4} /></span>
      <span>Loading Quickplan...</span>
    </div>
  )
}

function App() {
  const session = useAppStore((state) => state.session)

  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '999px',
            boxShadow: 'var(--shadow)',
            color: 'var(--text)',
            fontSize: '14px',
            fontWeight: 600,
            padding: '10px 16px',
          },
          success: { iconTheme: { primary: 'var(--primary)', secondary: '#fff' } },
        }}
      />
      <Suspense fallback={<LoadingScreen />}>
        <Routes>
          <Route path="/auth" element={session ? <Navigate to="/" replace /> : <AuthPage />} />
          <Route element={session ? <AppShell /> : <Navigate to="/auth" replace />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/reminders" element={<PlaceholderPage icon={AlarmClock} title="Reminders" eyebrow="Stay on time" description="Keep important moments visible with smart reminders." />} />
            <Route path="/expenses" element={<PlaceholderPage icon={Wallet} title="Money" eyebrow="Simple finances" description="Track IOUs, expenses, and shared costs without the spreadsheet." />} />
            <Route path="/people" element={<PlaceholderPage icon={Users} title="People" eyebrow="Your circle" description="See balances and transaction history with the people you know." />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to={session ? '/' : '/auth'} replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

export default App
