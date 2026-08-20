import { QuickAdd } from '../components/common/QuickAdd'

type Props = { title: string; eyebrow: string; description: string }
export function PlaceholderPage({ title, eyebrow, description }: Props) {
  return <section className="empty-page"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="muted">{description}</p><QuickAdd /></div></section>
}
