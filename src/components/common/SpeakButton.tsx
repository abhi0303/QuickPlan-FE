import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import toast from 'react-hot-toast'
import { Mic, Sparkles, Volume2, X } from 'lucide-react'
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition'
import { useSpeechSynthesis } from '../../hooks/useSpeechSynthesis'
import { isQuickAddCancel, isSelfOnlyAnswer, parseQuickAdd } from '../../services/smartInput'
import { useAppStore } from '../../store/useAppStore'
import './SpeakButton.scss'

type Props = {
  label?: string
  /** Round floating action button instead of an inline pill. */
  floating?: boolean
}

/**
 * idle      — nothing happening
 * listening — capturing the first sentence
 * asking    — talking back, mic closed so we don't hear ourselves
 * answering — capturing the reply to the follow-up question
 */
type Phase = 'idle' | 'listening' | 'asking' | 'answering'

/** A beat before she speaks, so the reply doesn't snap in on top of you. */
const THINKING_MS = 450
/** A beat after she finishes, so the mic doesn't catch her own tail. */
const HANDOVER_MS = 400
/** Hard ceiling on the ask step, so a blocked utterance can never strand it. */
const ASK_STALL_MS = 9000

const FOLLOW_UPS = [
  (subject: string) => `Sure! What time works for ${subject}?`,
  (subject: string) => `Happy to add ${subject}. When should I set it for?`,
  (subject: string) => `Got it! What time should I put ${subject} down for?`,
  (subject: string) => `Lovely. When would you like ${subject}?`,
]

function followUpQuestion(title: string, turn: number) {
  const subject = title.length > 40 ? 'that' : title.toLowerCase()
  return FOLLOW_UPS[turn % FOLLOW_UPS.length](subject)
}

function splitQuestion(amount?: number) {
  const sum = amount ? `the ${amount}` : 'this'
  return `Got it! Who shall I split ${sum} with? Say their names, or say just me.`
}

function Dots() {
  return <span className="listening-dots"><i /><i /><i /></span>
}

export function SpeakButton({ label = 'Speak it', floating = false }: Props) {
  const openQuickAddWithText = useAppStore((state) => state.openQuickAddWithText)
  const setQuickAddOpen = useAppStore((state) => state.setQuickAddOpen)

  const [phase, setPhaseState] = useState<Phase>('idle')
  const [question, setQuestion] = useState('')
  /** Which follow-up is outstanding — they merge differently.
      Ref for the recognition callbacks, state for rendering. */
  const askKindRef = useRef<'time' | 'split'>('time')
  const [askKind, setAskKindState] = useState<'time' | 'split'>('time')

  function setAskKind(next: 'time' | 'split') {
    askKindRef.current = next
    setAskKindState(next)
  }

  const phaseRef = useRef<Phase>('idle')
  const firstTranscriptRef = useRef('')
  const gotResultRef = useRef(false)
  const turnRef = useRef(0)
  const timerRef = useRef<number | null>(null)
  const stallGuardRef = useRef<number | null>(null)

  function clearPendingBeat() {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    if (stallGuardRef.current !== null) window.clearTimeout(stallGuardRef.current)
    timerRef.current = null
    stallGuardRef.current = null
  }

  function setPhase(next: Phase) {
    phaseRef.current = next
    setPhaseState(next)
  }

  const synthesis = useSpeechSynthesis()

  function finish(text: string) {
    clearPendingBeat()
    setPhase('idle')
    setQuestion('')
    openQuickAddWithText(text)
  }

  const speech = useSpeechRecognition({
    silenceMs: 2400,
    initialWaitMs: 9000,
    onResult: (transcript) => {
      gotResultRef.current = true

      if (isQuickAddCancel(transcript)) {
        abort()
        return
      }

      if (phaseRef.current === 'answering') {
        if (askKindRef.current === 'split') {
          // "just me" / "no one" means keep it to yourself
          const names = isSelfOnlyAnswer(transcript) ? '' : transcript
          finish(names ? `${firstTranscriptRef.current} with ${names}` : firstTranscriptRef.current)
          return
        }
        const combined = `${firstTranscriptRef.current} ${transcript}`.trim()
        const merged = parseQuickAdd(combined)
        finish(merged?.matched.time ? combined : firstTranscriptRef.current)
        return
      }

      const parsed = parseQuickAdd(transcript)
      if (!parsed || !synthesis.supported) {
        finish(transcript)
        return
      }

      // An expense with nobody named is either a shared bill or your own
      // spend, and only you can say which.
      const needsSplit = parsed.intent === 'expense' && !parsed.personName
      const needsTime = parsed.intent !== 'expense' && !parsed.matched.time

      if (!needsSplit && !needsTime) {
        finish(transcript)
        return
      }

      setAskKind(needsSplit ? 'split' : 'time')
      firstTranscriptRef.current = transcript
      const prompt = needsSplit
        ? splitQuestion(parsed.amount)
        : followUpQuestion(parsed.title, turnRef.current)
      turnRef.current += 1
      setQuestion(prompt)
      setPhase('asking')

      timerRef.current = window.setTimeout(() => {
        if (phaseRef.current !== 'asking') return
        synthesis.speak(prompt, () => {
          if (phaseRef.current !== 'asking') return
          timerRef.current = window.setTimeout(() => {
            if (phaseRef.current !== 'asking') return
            gotResultRef.current = false
            setPhase('answering')
            speech.start()
          }, HANDOVER_MS)
        })

        // Belt and braces: if the platform never reports the utterance
        // finishing, open the form with what we already have rather than
        // leaving the user staring at the question.
        stallGuardRef.current = window.setTimeout(() => {
          if (phaseRef.current === 'asking') finish(firstTranscriptRef.current)
        }, ASK_STALL_MS)
      }, THINKING_MS)
    },

    onEnd: () => {
      if (gotResultRef.current) return
      if (phaseRef.current === 'answering') finish(firstTranscriptRef.current)
      else if (phaseRef.current === 'listening') setPhase('idle')
    },
  })

  function cancel() {
    clearPendingBeat()
    synthesis.cancel()
    speech.abort()
    setPhase('idle')
    setQuestion('')
  }

  function abort() {
    firstTranscriptRef.current = ''
    cancel()
    toast('Okay, cancelled', { icon: '\u{1F44C}' })
  }

  function skip() {
    clearPendingBeat()
    synthesis.cancel()
    speech.abort()
    finish(firstTranscriptRef.current)
  }

  function handleClick() {
    if (!speech.supported) {
      setQuickAddOpen(true)
      return
    }
    if (phase !== 'idle') {
      cancel()
      return
    }
    // Must happen inside the click handler: iOS grants speech synthesis
    // permission only from a user gesture, and the talk-back later fires
    // from a timer.
    synthesis.unlock()

    firstTranscriptRef.current = ''
    gotResultRef.current = false
    setPhase('listening')
    speech.start()
  }

  useEffect(() => clearPendingBeat, [])

  useEffect(() => {
    if (phase === 'idle') return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') cancel()
    }
    document.addEventListener('keydown', onKeyDown)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = ''
    }
  })

  const active = phase !== 'idle'

  const trigger = floating ? (
    <button
      className={`speak-fab ${active ? 'is-active' : ''}`}
      onClick={handleClick}
      aria-label={active ? 'Stop listening' : label}
      title={label}
    >
      <Mic size={24} strokeWidth={2.2} />
    </button>
  ) : (
    <button
      className={`quick-add ghost ${active ? 'is-listening' : ''}`}
      onClick={handleClick}
      aria-label={active ? 'Stop' : label}
    >
      <Mic size={18} strokeWidth={2.4} />
      {active ? 'Listening...' : label}
    </button>
  )

  /**
   * Rendered through a portal to document.body. An ancestor with its own
   * z-index (.hero-actions) forms a stacking context that would otherwise trap
   * this overlay beneath the sidebar no matter how high its z-index is.
   */
  const overlay = active && createPortal(
    <div className="voice-overlay" role="dialog" aria-modal="true" aria-label="Voice input">
      <button className="voice-scrim" onClick={cancel} aria-label="Cancel voice input" />

      <div className="voice-panel">
        <span className={`voice-orb ${phase === 'asking' ? 'is-speaking' : ''}`}>
          {phase === 'asking' ? <Volume2 size={30} /> : <Mic size={30} />}
          <i /><i /><i />
        </span>

        <p className="voice-status">
          {phase === 'asking' ? 'QuickPlan is asking' : phase === 'answering' ? 'Your answer' : 'Listening'}
        </p>

        <p className="voice-text">
          {phase === 'asking' && question}
          {phase === 'answering' && (speech.interim || <>Take your time — say a time like "at 5 pm"<Dots /></>)}
          {phase === 'listening' && (speech.interim || <>I'm listening, no rush<Dots /></>)}
        </p>

        {phase === 'listening' && !speech.interim && (
          <p className="voice-hint"><Sparkles size={13} /> Try "client call at 3:30pm today"</p>
        )}

        <div className="voice-actions">
          {(phase === 'listening' || phase === 'answering') && (
            <button className="voice-done" onClick={speech.stop}>Done</button>
          )}
          {phase === 'answering' && (
            <button className="voice-ghost" onClick={skip}>
              {askKind === 'split' ? 'Just me' : 'Skip time'}
            </button>
          )}
          <button className="voice-ghost" onClick={cancel}>
            <X size={15} /> Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )

  return (
    <>
      {trigger}
      {overlay}
      {speech.error && !active && (
        <div className="listening-bar error" role="alert">
          <p>{speech.error}</p>
        </div>
      )}
    </>
  )
}
