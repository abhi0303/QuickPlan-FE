import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Search, X } from 'lucide-react'
import './MultiSelect.scss'

/** Panel sizing, shared by the flip maths and the stylesheet's fallback. */
const LIST_MAX = 224
const MIN_LIST = 120
const OPTION_HEIGHT = 44
/** search box + footer + panel padding — everything around the list itself */
const PANEL_CHROME = 112
const GUTTER = 12

export type MultiSelectOption = {
  id: string
  label: string
  sublabel?: string
}

type Props = {
  options: MultiSelectOption[]
  selected: string[]
  onChange: (next: string[]) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  disabled?: boolean
  label?: string
}

/**
 * Searchable multi-select.
 *
 * Rendering every option inline is fine for three friends and unusable for
 * twenty, so the list lives in a dropdown with its own filter and the trigger
 * only ever shows a summary. Height stays constant however many options exist.
 */
export function MultiSelect({
  options, selected, onChange, disabled, label,
  placeholder = 'Select people', searchPlaceholder = 'Search...', emptyText = 'Nothing to choose from.',
}: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  /** Where the panel sits and how tall its list may be, decided when it opens. */
  const [drop, setDrop] = useState<{ up: boolean, listMax: number }>({ up: false, listMax: LIST_MAX })
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    searchRef.current?.focus()

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.stopPropagation(); setOpen(false) }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [open])

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return options
    return options.filter((option) =>
      option.label.toLowerCase().includes(term) || option.sublabel?.toLowerCase().includes(term))
  }, [options, query])

  const chosen = options.filter((option) => selected.includes(option.id))

  /**
   * Opening downwards from a field low in a tall modal pushes the list off the
   * screen and makes the user scroll to reach it, so the panel flips above the
   * trigger whenever that side has more room, and its list is capped to the
   * space actually available either way.
   */
  function openPanel() {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (rect) {
      const below = window.innerHeight - rect.bottom - GUTTER
      const above = rect.top - GUTTER
      // what the panel will actually take, not the worst case: three friends
      // fit under a low field where twenty would not
      const wants = Math.min(LIST_MAX, Math.max(options.length, 1) * OPTION_HEIGHT) + PANEL_CHROME
      const up = below < wants && above > below
      const room = (up ? above : below) - PANEL_CHROME
      setDrop({ up, listMax: Math.max(MIN_LIST, Math.min(LIST_MAX, room)) })
    }
    setOpen(true)
  }

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])
  }

  return (
    <div className="multi-select" ref={rootRef}>
      <button
        type="button"
        ref={triggerRef}
        className={`multi-trigger ${open ? 'is-open' : ''}`}
        onClick={() => (open ? setOpen(false) : openPanel())}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={label}
      >
        <span className="multi-summary">
          {chosen.length === 0
            ? <em>{placeholder}</em>
            : chosen.length <= 2
              ? chosen.map((option) => option.label).join(', ')
              : `${chosen[0].label}, ${chosen[1].label} +${chosen.length - 2} more`}
        </span>
        {chosen.length > 0 && <span className="multi-count">{chosen.length}</span>}
        <ChevronDown size={16} className={open ? 'flip' : ''} />
      </button>

      {open && (
        <div className={`multi-panel ${drop.up ? 'is-up' : ''}`} role="listbox" aria-multiselectable="true">
          <label className="multi-search">
            <Search size={15} />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
            />
            {query && <button type="button" onClick={() => setQuery('')} aria-label="Clear"><X size={13} /></button>}
          </label>

          <div className="multi-list" style={{ maxHeight: drop.listMax }}>
            {filtered.length === 0 && (
              <p className="multi-empty">{options.length === 0 ? emptyText : `No match for “${query}”.`}</p>
            )}

            {filtered.map((option) => {
              const on = selected.includes(option.id)
              return (
                <button
                  key={option.id}
                  type="button"
                  role="option"
                  aria-selected={on}
                  className={`multi-option ${on ? 'active' : ''}`}
                  onClick={() => toggle(option.id)}
                >
                  <span className="multi-check">{on && <Check size={13} strokeWidth={3} />}</span>
                  <span className="multi-copy">
                    <strong>{option.label}</strong>
                    {option.sublabel && <small>{option.sublabel}</small>}
                  </span>
                </button>
              )
            })}
          </div>

          {options.length > 0 && (
            <div className="multi-foot">
              <button type="button" onClick={() => onChange(options.map((o) => o.id))}>Select all</button>
              <button type="button" onClick={() => onChange([])}>Clear</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
