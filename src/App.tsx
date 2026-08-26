import { lazy, Suspense } from 'react'
import toast, { Toaster, ToastBar } from 'react-hot-toast'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { X } from 'lucide-react'
import { ApiProgress } from './components/common/ApiProgress'
import { Loader } from './components/common/Loader'
import { useAppStore } from './store/useAppStore'
import './styles/global.scss'

const AppShell = lazy(() => import('./components/layout/AppShell').then((module) => ({ default: module.AppShell })))
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((module) => ({ default: module.DashboardPage })))
const RemindersPage = lazy(() => import('./pages/RemindersPage').then((module) => ({ default: module.RemindersPage })))
const FriendsPage = lazy(() => import('./pages/FriendsPage').then((module) => ({ default: module.FriendsPage })))
const MoneyPage = lazy(() => import('./pages/MoneyPage').then((module) => ({ default: module.MoneyPage })))
const GroupDetailPage = lazy(() => import('./pages/GroupDetailPage').then((module) => ({ default: module.GroupDetailPage })))
const PlannerPage = lazy(() => import('./pages/PlannerPage').then((module) => ({ default: module.PlannerPage })))
const BudgetsPage = lazy(() => import('./pages/BudgetsPage').then((module) => ({ default: module.BudgetsPage })))
const RecurringPage = lazy(() => import('./pages/RecurringPage').then((module) => ({ default: module.RecurringPage })))
const PersonalAnalyticsPage = lazy(() => import('./pages/PersonalAnalyticsPage').then((module) => ({ default: module.PersonalAnalyticsPage })))
const GroupAnalyticsPage = lazy(() => import('./pages/GroupAnalyticsPage').then((module) => ({ default: module.GroupAnalyticsPage })))
const TasksPage = lazy(() => import('./pages/TasksPage').then((module) => ({ default: module.TasksPage })))
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((module) => ({ default: module.SettingsPage })))
const AuthPage = lazy(() => import('./pages/AuthPage').then((module) => ({ default: module.AuthPage })))

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
      <ApiProgress />
      <Suspense fallback={<Loader full label="Loading Quickplan..." />}>
        <Routes>
          <Route path="/auth" element={session ? <Navigate to="/" replace /> : <AuthPage />} />
          <Route element={session ? <AppShell /> : <Navigate to="/auth" replace />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/reminders" element={<RemindersPage />} />
            <Route path="/expenses" element={<MoneyPage />} />
            <Route path="/expenses/analysis" element={<PersonalAnalyticsPage />} />
            <Route path="/expenses/budgets" element={<BudgetsPage />} />
            <Route path="/expenses/planner" element={<PlannerPage />} />
            <Route path="/expenses/recurring" element={<RecurringPage />} />
            <Route path="/groups/:id" element={<GroupDetailPage />} />
            <Route path="/groups/:id/analysis" element={<GroupAnalyticsPage />} />
            <Route path="/people" element={<FriendsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to={session ? '/' : '/auth'} replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

export default App
