import { Mic, Plus } from 'lucide-react'

type Props = {
  label?: string
  variant?: 'light' | 'solid' | 'ghost'
  icon?: 'plus' | 'mic'
}

export function QuickAdd({ label = 'Quick add', variant = 'light', icon = 'plus' }: Props) {
  const Icon = icon === 'mic' ? Mic : Plus
  return (
    <button className={`quick-add ${variant === 'light' ? '' : variant}`}>
      <Icon size={18} strokeWidth={2.4} />
      {label}
    </button>
  )
}
