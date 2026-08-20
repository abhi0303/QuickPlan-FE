import { useAppStore } from '../store/useAppStore'

export function SettingsPage() {
  const theme = useAppStore((state) => state.theme)
  const setTheme = useAppStore((state) => state.setTheme)
  return <section className="settings-page"><p className="eyebrow">Preferences</p><h1>Settings</h1><p className="muted">Make Quickplan feel like yours.</p><div className="settings-card"><div className="setting-row"><div><strong>Appearance</strong><small>Choose how Quickplan looks</small></div><div className="segmented"><button className={theme === 'light' ? 'active' : ''} onClick={() => setTheme('light')}>☀ Light</button><button className={theme === 'dark' ? 'active' : ''} onClick={() => setTheme('dark')}>☾ Dark</button></div></div><div className="setting-row"><div><strong>Input language</strong><small>Language used for voice and smart input</small></div><select defaultValue="auto"><option value="auto">Auto detect</option><option>English</option><option>Hindi</option></select></div><div className="setting-row"><div><strong>Default reminder</strong><small>Applied to new tasks with a due time</small></div><select defaultValue="15"><option value="15">15 minutes before</option><option value="30">30 minutes before</option><option value="60">1 hour before</option></select></div></div></section>
}
