import { lazy, Suspense } from 'react'
import toast, { Toaster, ToastBar } from 'react-hot-toast'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Sparkles, Users, Wallet, X } from 'lucide-react'
import { useAppStore } from './store/useAppStore'
import './styles/global.scss'

const AppShell = lazy(() => import('./components/layout/AppShell').then((module) => ({ default: module.AppShell })))
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((module) => ({ default: module.DashboardPage })))
const PlaceholderPage = lazy(() => import('./pages/PlaceholderPage').then((module) => ({ default: module.PlaceholderPage })))
const RemindersPage = lazy(() => import('./pages/RemindersPage').then((module) => ({ default: module.RemindersPage })))
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
        position="top-right"
        gutter={10}
        toastOptions={{
          // every toast stays long enough to read
          duration: 5000,
          className: 'app-toast',
          success: { iconTheme: { primary: 'var(--primary)', secondary: '#fff' } },
        }}
      >
        {(item) => (
          <ToastBar toast={item}>
            {({ icon, message }) => (
              <>
                {icon}
                <span className="app-toast-message">{message}</span>
                {item.type !== 'loading' && (
                  <button
                    type="button"
                    className="app-toast-close"
                    onClick={() => toast.dismiss(item.id)}
                    aria-label="Dismiss notification"
                  >
                    <X size={15} />
                  </button>
                )}
              </>
            )}
          </ToastBar>
        )}
      </Toaster>
      <Suspense fallback={<LoadingScreen />}>
        <Routes>
          <Route path="/auth" element={session ? <Navigate to="/" replace /> : <AuthPage />} />
          <Route element={session ? <AppShell /> : <Navigate to="/auth" replace />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/reminders" element={<RemindersPage />} />
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
