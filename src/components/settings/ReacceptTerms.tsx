import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import toast from 'react-hot-toast'
import { CircleAlert, LoaderCircle, ScrollText } from 'lucide-react'
import { getApiErrorMessage } from '../../services/api'
import { acceptTerms, fetchProfile } from '../../services/auth'
import { needsReacceptance } from '../../data/legal'
import './ReacceptTerms.scss'

/**
 * The one-time screen for everyone who predates the policies.
 *
 * Every existing account was backfilled as "legacy", which never equals the
 * current version — deliberately, because they were never shown a policy and
 * recording that they agreed to one would be worthless the one time it counts.
 *
 * Not dismissable. It is the whole consent, and a notice somebody can wave away
 * is not one. It is also not shown until the profile has actually loaded, so a
 * slow connection never flashes it at somebody who has already agreed.
 */
export function ReacceptTerms() {
  const [needed, setNeeded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    fetchProfile()
      .then((profile) => {
        if (live && needsReacceptance(profile.termsVersion)) setNeeded(true)
      })
      .catch(() => {
        /* An unreachable profile is not consent either way. Asking on a failed
           request would block the app over a dropped connection. */
      })
    return () => { live = false }
  }, [])

  if (!needed) return null

  async function agree() {
    setBusy(true)
    setError('')
    try {
      await acceptTerms()
      setNeeded(false)
      toast.success('Thank you.')
    } catch (agreeError) {
      setError(getApiErrorMessage(agreeError, 'Could not save that right now. Please try again.'))
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div className="reaccept-backdrop" role="dialog" aria-modal="true" aria-labelledby="reaccept-title">
      <div className="reaccept">
        <span className="reaccept-mark"><ScrollText size={24} /></span>

        <h2 id="reaccept-title">We have published our policies</h2>
        <p>
          Quickplan now has a Terms of Use and a Privacy Policy. They were not written when
          you signed up, so we are asking once rather than assuming.
        </p>
        <p className="reaccept-links">
          <a href="/terms" target="_blank" rel="noreferrer">Read the Terms of Use</a>
          <a href="/privacy" target="_blank" rel="noreferrer">Read the Privacy Policy</a>
        </p>

        {error && <p className="form-error" role="alert"><CircleAlert size={16} /> {error}</p>}

        <button className="reaccept-agree" onClick={agree} disabled={busy}>
          {busy ? <><LoaderCircle size={17} className="spin" /> Saving...</> : 'I have read and agree'}
        </button>
      </div>
    </div>,
    document.body,
  )
}
