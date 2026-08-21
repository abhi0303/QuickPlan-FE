import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Thin wrapper over the browser's built-in Web Speech API.
 * No third-party service: recognition is handled by the browser/OS.
 * Chrome, Edge and Safari support it; Firefox does not.
 *
 * Turn-taking is the point of this hook. The raw API ends a session at the
 * first pause, so thinking mid-sentence ("call Rahul... uh... tomorrow") would
 * cut the user off. Instead we run continuously, accumulate every final chunk,
 * and only end the turn after a real stretch of silence.
 */

/**
 * Joins the text of a finished session onto what earlier sessions captured,
 * dropping any repeated overlap.
 *
 * Android re-processes buffered audio when a session restarts, so saying
 * "set an alarm" once could arrive twice and read "set an alarm set an alarm".
 */
export function mergeTranscripts(carry: string, next: string): string {
  const a = carry.trim()
  const b = next.trim()
  if (!a) return b
  if (!b) return a

  const aWords = a.split(/\s+/)
  const bWords = b.split(/\s+/)
  const lower = (words: string[]) => words.join(' ').toLowerCase().replace(/[.,!?]/g, '')

  const max = Math.min(aWords.length, bWords.length)
  for (let n = max; n > 0; n -= 1) {
    if (lower(aWords.slice(-n)) === lower(bWords.slice(0, n))) {
      const rest = bWords.slice(n).join(' ')
      return rest ? `${a} ${rest}` : a
    }
  }
  return `${a} ${b}`
}

function getRecognitionConstructor() {
  if (typeof window === 'undefined') return undefined
  return window.SpeechRecognition ?? window.webkitSpeechRecognition
}

const ERROR_MESSAGES: Record<string, string> = {
  'not-allowed': 'Microphone access was blocked. Allow it in your browser settings to speak.',
  'service-not-allowed': 'Microphone access was blocked. Allow it in your browser settings to speak.',
  'audio-capture': 'No microphone found.',
  network: 'Speech recognition needs a network connection.',
}

type Options = {
  lang?: string
  onResult?: (transcript: string) => void
  onEnd?: () => void
  /** Quiet time after speech before the turn is considered over. */
  silenceMs?: number
  /** How long to wait for the user to start talking at all. */
  initialWaitMs?: number
  /** Hard ceiling on a single turn. */
  maxTurnMs?: number
}

export function useSpeechRecognition(options: Options = {}) {
  const {
    lang = 'en-IN',
    onResult,
    onEnd,
    silenceMs = 2200,
    initialWaitMs = 8000,
    maxTurnMs = 30000,
  } = options

  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [error, setError] = useState('')

  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const onResultRef = useRef(onResult)
  const onEndRef = useRef(onEnd)

  /** Finals from sessions that have already ended. */
  const carryRef = useRef('')
  /** Finals within the CURRENT session, rebuilt from index 0 each event. */
  const sessionRef = useRef('')
  const heardSpeechRef = useRef(false)
  const activeRef = useRef(false)
  const settledRef = useRef(false)
  const silenceTimerRef = useRef<number | null>(null)
  const turnTimerRef = useRef<number | null>(null)
  const restartsRef = useRef(0)

  useEffect(() => {
    onResultRef.current = onResult
    onEndRef.current = onEnd
  }, [onResult, onEnd])

  const supported = Boolean(getRecognitionConstructor())

  const clearTimers = useCallback(() => {
    if (silenceTimerRef.current !== null) window.clearTimeout(silenceTimerRef.current)
    if (turnTimerRef.current !== null) window.clearTimeout(turnTimerRef.current)
    silenceTimerRef.current = null
    turnTimerRef.current = null
  }, [])

  /** Ends the turn exactly once, delivering either a result or an end signal. */
  const settle = useCallback(() => {
    if (settledRef.current) return
    settledRef.current = true
    activeRef.current = false
    clearTimers()

    const text = mergeTranscripts(carryRef.current, sessionRef.current).trim()
    try {
      recognitionRef.current?.stop()
    } catch {
      // already stopped
    }

    setListening(false)
    setInterim('')

    if (text) onResultRef.current?.(text)
    else onEndRef.current?.()
  }, [clearTimers])

  const armSilence = useCallback(() => {
    if (silenceTimerRef.current !== null) window.clearTimeout(silenceTimerRef.current)
    const wait = heardSpeechRef.current ? silenceMs : initialWaitMs
    silenceTimerRef.current = window.setTimeout(settle, wait)
  }, [initialWaitMs, settle, silenceMs])

  useEffect(() => {
    const Recognition = getRecognitionConstructor()
    if (!Recognition) return

    const recognition = new Recognition()
    recognition.lang = lang
    recognition.continuous = true
    recognition.interimResults = true
    recognition.maxAlternatives = 1

    recognition.onresult = (event) => {
      // Rebuild the session transcript from index 0 every time rather than
      // appending from event.resultIndex. Android re-emits earlier results,
      // and appending them duplicated the phrase.
      let finals = ''
      let pending = ''
      for (let i = 0; i < event.results.length; i += 1) {
        const result = event.results[i]
        const text = result[0].transcript
        if (result.isFinal) finals = `${finals} ${text}`.trim()
        else pending += text
      }

      sessionRef.current = finals
      if (finals || pending.trim()) heardSpeechRef.current = true

      const full = mergeTranscripts(carryRef.current, `${finals} ${pending}`.trim())
      setInterim(full)
      armSilence()
    }

    recognition.onerror = (event) => {
      // 'no-speech' and 'aborted' are normal during a pause — let the silence
      // timer decide when the turn is actually over instead of bailing out.
      if (event.error === 'no-speech' || event.error === 'aborted') return
      setError(ERROR_MESSAGES[event.error] ?? 'Could not use the microphone right now.')
      settle()
    }

    recognition.onend = () => {
      // Chrome ends the session on its own after a few seconds of quiet even
      // with continuous=true. Restart so a pause never ends the user's turn.
      if (activeRef.current && !settledRef.current && restartsRef.current < 20) {
        restartsRef.current += 1
        // bank this session before the next one starts with a fresh results list
        carryRef.current = mergeTranscripts(carryRef.current, sessionRef.current)
        sessionRef.current = ''
        try {
          recognition.start()
          return
        } catch {
          // fall through to closing the turn
        }
      }
      setListening(false)
      setInterim('')
    }

    recognitionRef.current = recognition
    return () => {
      recognition.onresult = null
      recognition.onerror = null
      recognition.onend = null
      activeRef.current = false
      recognition.abort()
      recognitionRef.current = null
    }
  }, [lang, settle, armSilence])

  useEffect(() => clearTimers, [clearTimers])

  const start = useCallback(() => {
    const recognition = recognitionRef.current
    if (!recognition) return

    carryRef.current = ''
    sessionRef.current = ''
    heardSpeechRef.current = false
    settledRef.current = false
    activeRef.current = true
    restartsRef.current = 0
    setError('')
    setInterim('')

    try {
      recognition.start()
    } catch {
      // start() throws if already running — harmless
    }
    setListening(true)
    armSilence()
    turnTimerRef.current = window.setTimeout(settle, maxTurnMs)
  }, [armSilence, maxTurnMs, settle])

  /** User pressed stop — deliver whatever was captured immediately. */
  const stop = useCallback(() => {
    if (!activeRef.current) {
      setListening(false)
      return
    }
    settle()
  }, [settle])

  /** Abandon the turn without delivering anything. */
  const abort = useCallback(() => {
    settledRef.current = true
    activeRef.current = false
    clearTimers()
    carryRef.current = ''
    sessionRef.current = ''
    try {
      recognitionRef.current?.abort()
    } catch {
      // already stopped
    }
    setListening(false)
    setInterim('')
  }, [clearTimers])

  return {
    supported,
    listening,
    interim,
    error,
    start,
    stop,
    abort,
    toggle: () => (listening ? stop() : start()),
  }
}
