import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Sparkles } from 'lucide-react'
import { TERMS_EFFECTIVE } from '../data/legal'
import './LegalPage.scss'

/**
 * The frame both policies share.
 *
 * Reached signed out — that is most of the point of publishing them — and also
 * from Settings, so the way back has to be the browser's own rather than a
 * link to somewhere the reader may never have been.
 */
export function LegalPage({ title, children }: { title: string, children: ReactNode }) {
  return (
    <main className="legal-page">
      <div className="legal-bar">
        <Link className="legal-back" to="/auth">
          <ArrowLeft size={16} /> Back
        </Link>
        <span className="legal-brand">
          <span className="brand-mark sm"><Sparkles size={14} strokeWidth={2.4} /></span>
          Quickplan
        </span>
      </div>

      <article className="legal-body">
        <h1>{title}</h1>
        <p className="legal-date">In effect from {TERMS_EFFECTIVE}</p>
        {children}
      </article>
    </main>
  )
}
