import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { BellRing, LoaderCircle, Send, ShieldAlert, Smartphone } from 'lucide-react'
import { disablePush, enablePush, getPushState, sendTestPush } from '../../services/push'
import type { PushState } from '../../services/push'
import './PushToggle.scss'

const COPY: Record<PushState, string> = {
  on: 'Reminders will alert you even when QuickPlan is closed.',
  off: 'Get alerted even when QuickPlan is closed.',
  denied: 'Notifications are blocked. Allow them in your browser settings for this site.',
  unsupported: 'This browser does not support push notifications.',
  'ios-needs-install': 'On iPhone, add QuickPlan to your Home Screen first — iOS only allows notifications for installed apps.',
  unconfigured: 'Push is not configured for this build (missing VAPID key).',
}

export function PushToggle() {
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    let cancelled = false
    getPushState().then((next) => { if (!cancelled) setState(next) })
    return () => { cancelled = true }
  }, [])

  const actionable = state === 'off' || state === 'on'

  async function toggle() {
    if (!actionable) return
    setBusy(true)
    try {
      const next = state === 'on' ? await disablePush() : await enablePush()
      setState(next)
      if (next === 'on') toast.success('Push notifications enabled')
      else if (next === 'denied') toast.error('Notifications are blocked in your browser')
      else if (state === 'on') toast('Push notifications turned off')
    } catch {
      toast.error('Could not update notification settings')
    } finally {
      setBusy(false)
    }
  }

  async function test() {
    setTesting(true)
    try {
      const result = await sendTestPush()
      if (result.ok) toast.success(result.detail, { duration: 7000 })
      else toast.error(result.detail, { duration: 8000 })
    } catch {
      toast.error('The server rejected the test request.')
    } finally {
      setTesting(false)
    }
  }



  const Icon = state === 'denied' ? ShieldAlert : state === 'ios-needs-install' ? Smartphone : BellRing

  return (
    <div className="setting-row">
      <div className="setting-label">
        <span className="setting-icon"><Icon size={20} /></span>
        <div>
          <strong>Push notifications</strong>
          <small>{state ? COPY[state] : 'Checking...'}</small>
        </div>
      </div>

      {state === 'on' && (
        <button
          type="button"
          className="push-test"
          onClick={test}
          disabled={testing}
          title="Send a test notification to this device"
        >
          {testing ? <LoaderCircle size={13} className="spin" /> : <Send size={13} />} Send test
        </button>
      )}

      {actionable ? (
        <button
          type="button"
          className={`push-switch ${state === 'on' ? 'is-on' : ''}`}
          onClick={toggle}
          disabled={busy}
          role="switch"
          aria-checked={state === 'on'}
          aria-label="Push notifications"
        >
          {busy ? <LoaderCircle size={14} className="spin" /> : <i />}
        </button>
      ) : (
        <span className="push-status">{state === null ? '...' : state === 'denied' ? 'Blocked' : 'Unavailable'}</span>
      )}
    </div>
  )
}
