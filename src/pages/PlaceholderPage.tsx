import type { LucideIcon } from 'lucide-react'
import { QuickAdd } from '../components/common/QuickAdd'
import './PlaceholderPage.scss'

type Props = {
  title: string
  eyebrow: string
  description: string
  icon: LucideIcon
}

export function PlaceholderPage({ title, eyebrow, description, icon: Icon }: Props) {
  return (
    <section className="empty-page">
      <div className="empty-card">
        <span className="empty-icon"><Icon size={32} strokeWidth={1.8} /></span>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="muted">{description}</p>
        <QuickAdd label={`Add to ${title.toLowerCase()}`} variant="solid" />
      </div>
    </section>
  )
}
