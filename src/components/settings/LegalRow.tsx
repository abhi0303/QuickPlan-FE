import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { ScrollText } from 'lucide-react'
import { fetchProfile } from '../../services/auth'
import './LegalRow.scss'

/**
 * The policies, plus which version this person accepted and when.
 *
 * That line is the user-facing half of storing a version rather than a
 * boolean — and it answers a support question in about ten seconds.
 */
export function LegalRow() {
  const [accepted, setAccepted] = useState<{ version: string, at: string | null } | null>(null)

  useEffect(() => {
    let live = true
    fetchProfile()
      .then((profile) => {
        if (!live || !profile.termsVersion) return
        setAccepted({ version: profile.termsVersion, at: profile.termsAcceptedAt ?? null })
      })
      .catch(() => { /* the links are the point; the line is a nicety */ })
    return () => { live = false }
  }, [])

  const when = accepted?.at ? parseISO(accepted.at) : null
  const dated = when && !Number.isNaN(when.getTime()) ? format(when, 'd MMM yyyy') : null

  return (
    <div className="setting-row is-stacked">
      <div className="setting-label">
        <span className="setting-icon"><ScrollText size={20} /></span>
        <div>
          <strong>Terms &amp; privacy</strong>
          <small>
            {accepted
              ? `Accepted version ${accepted.version}${dated ? ` on ${dated}` : ''}`
              : 'What you agreed to, and what we do with your data'}
          </small>
        </div>
      </div>

      <div className="legal-links">
        <Link className="setting-action" to="/terms">Terms of Use</Link>
        <Link className="setting-action" to="/privacy">Privacy Policy</Link>
      </div>
    </div>
  )
}
