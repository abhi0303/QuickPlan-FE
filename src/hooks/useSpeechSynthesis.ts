import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Talk-back via the browser's built-in speech synthesis.
 * No third-party service — the OS/browser does the speaking.
 */

/**
 * Preferred voices, best first. These are the warm female voices shipped by
 * each platform; "Samantha" is the macOS/iOS voice Siri is built on.
 * Matched case-insensitively as a substring, since vendors decorate the names
 * ("Google UK English Female", "Microsoft Zira - English (United States)").
 */
const PREFERRED_VOICES = [
  'Samantha',
  'Ava',
  'Allison',
  'Susan',
  'Nicky',
  'Google UK English Female',
  'Google US English',
  'Microsoft Zira',
  'Microsoft Aria',
  'Microsoft Jenny',
  'Karen',
  'Moira',
  'Tessa',
  'Fiona',
  'Veena',
  'Tara',
  'Kathy',
]

/** Last resort: names that are conventionally female across platforms. */
const FEMALE_HINT = /\b(female|woman|samantha|ava|allison|susan|nicky|zira|aria|jenny|karen|moira|tessa|fiona|veena|tara|kathy|joana|amelie|sara|linda)\b/i

export function pickVoice(voices: SpeechSynthesisVoice[], lang: string) {
  if (!voices.length) return null

  const english = voices.filter((voice) => voice.lang.toLowerCase().startsWith('en'))
  const pool = english.length ? english : voices

  for (const wanted of PREFERRED_VOICES) {
    const match = pool.find((voice) => voice.name.toLowerCase().includes(wanted.toLowerCase()))
    if (match) return match
  }

  const hinted = pool.find((voice) => FEMALE_HINT.test(voice.name))
  if (hinted) return hinted

  // fall back to the closest locale match, then anything at all
  const base = lang.slice(0, 2).toLowerCase()
  return pool.find((voice) => voice.lang.toLowerCase().startsWith(base)) ?? pool[0]
}

export function useSpeechSynthesis(options: { lang?: string } = {}) {
  const { lang = 'en-IN' } = options
  const [speaking, setSpeaking] = useState(false)
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window

  // Voices live in a ref, not state: they are only read at speak() time, and
  // getVoices() is empty on first call in Chrome until `voiceschanged` fires.
  const voicesRef = useRef<SpeechSynthesisVoice[]>([])
  const supportedRef = useRef(supported)

  useEffect(() => {
    supportedRef.current = supported
    if (!supported) return

    const synth = window.speechSynthesis
    const refresh = () => { voicesRef.current = synth.getVoices() }
    refresh()
    synth.addEventListener('voiceschanged', refresh)

    return () => {
      synth.removeEventListener('voiceschanged', refresh)
      synth.cancel()
    }
  }, [supported])

  /**
   * `onDone` fires after the utterance finishes — the caller waits for it
   * before re-opening the mic, otherwise recognition hears our own voice.
   */
  const speak = useCallback((text: string, onDone?: () => void) => {
    if (!supported) {
      onDone?.()
      return
    }

    const synth = window.speechSynthesis
    synth.cancel()

    if (!voicesRef.current.length) voicesRef.current = synth.getVoices()
    const voice = pickVoice(voicesRef.current, lang)

    const utterance = new SpeechSynthesisUtterance(text)
    if (voice) {
      utterance.voice = voice
      utterance.lang = voice.lang
    } else {
      utterance.lang = lang
    }
    // a touch slower and brighter than default reads as friendly rather than clipped
    utterance.rate = 0.95
    utterance.pitch = 1.15
    utterance.volume = 1

    const finish = () => {
      setSpeaking(false)
      onDone?.()
    }
    utterance.onend = finish
    utterance.onerror = finish

    setSpeaking(true)
    synth.speak(utterance)
  }, [lang, supported])

  const cancel = useCallback(() => {
    if (supported) window.speechSynthesis.cancel()
    setSpeaking(false)
  }, [supported])

  return { supported, speaking, speak, cancel }
}
