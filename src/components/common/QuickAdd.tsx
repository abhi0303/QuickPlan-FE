import { Plus } from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'

type Props = {
  label?: string
  variant?: 'light' | 'solid' | 'ghost'
}

export function QuickAdd({ label = 'Quick add', variant = 'light' }: Props) {
  const setQuickAddOpen = useAppStore((state) => state.setQuickAddOpen)

  return (
    <button className={`quick-add ${variant === 'light' ? '' : variant}`} onClick={() => setQuickAddOpen(true)}>
      <Plus size={18} strokeWidth={2.4} />
      {label}
    </button>
  )
}
