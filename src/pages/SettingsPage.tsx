import { BellRing, Globe, LogOut, Moon, Palette, Repeat, Sun } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import './SettingsPage.scss'

export function SettingsPage() {
  const theme = useAppStore((state) => state.theme)
  const setTheme = useAppStore((state) => state.setTheme)
  const signOut = useAppStore((state) => state.signOut)

  return (
    <section className="settings-page">
      <p className="eyebrow">Preferences</p>
      <h1>Settings</h1>
      <p className="muted">Make Quickplan feel like yours.</p>

      <div className="settings-card">
        <div className="setting-row">
          <div className="setting-label">
            <span className="setting-icon"><Palette size={20} /></span>
            <div>
              <strong>Appearance</strong>
              <small>Choose how Quickplan looks</small>
            </div>
          </div>
          <div className="segmented">
            <button className={theme === 'light' ? 'active' : ''} onClick={() => setTheme('light')}>
              <Sun size={16} /> Light
            </button>
            <button className={theme === 'dark' ? 'active' : ''} onClick={() => setTheme('dark')}>
              <Moon size={16} /> Dark
            </button>
          </div>
        </div>

        <div className="setting-row">
          <div className="setting-label">
            <span className="setting-icon"><Globe size={20} /></span>
            <div>
              <strong>Input language</strong>
              <small>Language used for voice and smart input</small>
            </div>
          </div>
          <select defaultValue="auto">
            <option value="auto">Auto detect</option>
            <option>English</option>
            <option>Hindi</option>
          </select>
        </div>

        <div className="setting-row">
          <div className="setting-label">
            <span className="setting-icon"><BellRing size={20} /></span>
            <div>
              <strong>Default reminder</strong>
              <small>Applied to new tasks with a due time</small>
            </div>
          </div>
          <select defaultValue="15">
            <option value="15">15 minutes before</option>
            <option value="30">30 minutes before</option>
            <option value="60">1 hour before</option>
          </select>
        </div>

        <div className="setting-row">
          <div className="setting-label">
            <span className="setting-icon"><Repeat size={20} /></span>
            <div>
              <strong>Week starts on</strong>
              <small>Used across your calendar and streaks</small>
            </div>
          </div>
          <select defaultValue="mon">
            <option value="mon">Monday</option>
            <option value="sun">Sunday</option>
          </select>
        </div>
      </div>

      <button className="danger-row" onClick={signOut}>
        <LogOut size={18} /> Sign out of Quickplan
      </button>
    </section>
  )
}
