import { useReminderAlerts } from '../../hooks/useReminderAlerts'
import { useReminders } from '../../hooks/useReminders'

/**
 * Renders nothing. It exists so the one-second clock that drives alerts
 * re-renders this component alone, instead of the whole app shell and the
 * routed page beneath it.
 */
export function ReminderAlerts() {
  const { reminders } = useReminders()
  useReminderAlerts(reminders)
  return null
}
