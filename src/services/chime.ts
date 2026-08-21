/**
 * Reminder ringtones.
 *
 * Every tone is synthesised with the Web Audio API rather than shipped as an
 * audio file: nothing to download, no third-party, and the volume stays ours to
 * control. Browsers block audio until the page has seen a user gesture, so the
 * context is created and resumed on the first interaction and reused after.
 */

let context: AudioContext | null = null
let primed = false

/** Voices currently sounding, so an alert can be silenced instantly. */
let live: { osc: OscillatorNode; gain: GainNode }[] = []

type WindowWithWebkitAudio = Window & { webkitAudioContext?: typeof AudioContext }

function getContext(): AudioContext | null {
  if (context) return context
  const Ctor = window.AudioContext ?? (window as WindowWithWebkitAudio).webkitAudioContext
  if (!Ctor) return null
  context = new Ctor()
  return context
}

/** Call once from any user gesture so later alerts are allowed to sound. */
export function primeAudio() {
  if (primed) return
  primed = true
  const ctx = getContext()
  void ctx?.resume().catch(() => undefined)
}

/* -------------------------------------------------------------- library -- */

type Note = { freq: number; at: number; dur: number; gain?: number }

export type Ringtone = {
  id: string
  label: string
  hint: string
  wave: OscillatorType
  /** Silence after the phrase before it repeats — this is what sets the mood. */
  gap: number
  notes: Note[]
}

// note frequencies used below
const E5 = 659.25, F5s = 739.99, G5 = 783.99, A5 = 880, B5 = 987.77
const C6 = 1046.5, Cs6 = 1108.73, D6 = 1174.66, E6 = 1318.51, F6s = 1479.98, G6 = 1567.98, A6 = 1760

export const RINGTONES: Ringtone[] = [
  {
    id: 'chime',
    label: 'Chime',
    hint: 'Bright and rising',
    wave: 'triangle',
    gap: 1.1,
    notes: [
      { freq: E5, at: 0, dur: 0.22 }, { freq: B5, at: 0.13, dur: 0.22 },
      { freq: E6, at: 0.26, dur: 0.34 }, { freq: B5, at: 0.46, dur: 0.2 },
      { freq: F5s, at: 0.68, dur: 0.22 }, { freq: Cs6, at: 0.81, dur: 0.22 },
      { freq: F6s, at: 0.94, dur: 0.52 }, { freq: F5s, at: 0.94, dur: 0.52, gain: 0.07 },
    ],
  },
  {
    id: 'marimba',
    label: 'Marimba',
    hint: 'Warm and wooden',
    wave: 'triangle',
    gap: 0.9,
    notes: [
      { freq: C6, at: 0, dur: 0.16 }, { freq: G5, at: 0.12, dur: 0.16 },
      { freq: C6, at: 0.24, dur: 0.16 }, { freq: E6, at: 0.36, dur: 0.22 },
      { freq: C6, at: 0.56, dur: 0.16 }, { freq: G5, at: 0.68, dur: 0.16 },
      { freq: E6, at: 0.8, dur: 0.34 }, { freq: C6, at: 0.8, dur: 0.34, gain: 0.06 },
    ],
  },
  {
    id: 'bells',
    label: 'Bells',
    hint: 'Slow and spacious',
    wave: 'sine',
    gap: 1.4,
    notes: [
      { freq: A5, at: 0, dur: 1.1, gain: 0.2 },
      { freq: E6, at: 0.02, dur: 0.9, gain: 0.09 },
      { freq: A6, at: 0.55, dur: 1.2, gain: 0.14 },
      { freq: E6, at: 0.6, dur: 1, gain: 0.06 },
    ],
  },
  {
    id: 'pulse',
    label: 'Pulse',
    hint: 'Short and insistent',
    wave: 'square',
    gap: 0.7,
    notes: [
      { freq: A5, at: 0, dur: 0.1, gain: 0.07 }, { freq: A5, at: 0.16, dur: 0.1, gain: 0.07 },
      { freq: A5, at: 0.32, dur: 0.1, gain: 0.07 },
      { freq: C6, at: 0.56, dur: 0.1, gain: 0.07 }, { freq: C6, at: 0.72, dur: 0.1, gain: 0.07 },
      { freq: C6, at: 0.88, dur: 0.18, gain: 0.07 },
    ],
  },
  {
    id: 'ripple',
    label: 'Ripple',
    hint: 'Gentle and falling',
    wave: 'sine',
    gap: 1.2,
    notes: [
      { freq: A6, at: 0, dur: 0.3 }, { freq: G6, at: 0.09, dur: 0.3 },
      { freq: E6, at: 0.18, dur: 0.3 }, { freq: D6, at: 0.27, dur: 0.34 },
      { freq: C6, at: 0.36, dur: 0.4 }, { freq: A5, at: 0.45, dur: 0.6 },
    ],
  },
  {
    id: 'classic',
    label: 'Classic',
    hint: 'Old telephone trill',
    wave: 'triangle',
    gap: 1.3,
    notes: [
      { freq: A5, at: 0, dur: 0.08, gain: 0.13 }, { freq: C6, at: 0.08, dur: 0.08, gain: 0.13 },
      { freq: A5, at: 0.16, dur: 0.08, gain: 0.13 }, { freq: C6, at: 0.24, dur: 0.08, gain: 0.13 },
      { freq: A5, at: 0.32, dur: 0.08, gain: 0.13 }, { freq: C6, at: 0.4, dur: 0.08, gain: 0.13 },
      { freq: A5, at: 0.62, dur: 0.08, gain: 0.13 }, { freq: C6, at: 0.7, dur: 0.08, gain: 0.13 },
      { freq: A5, at: 0.78, dur: 0.08, gain: 0.13 }, { freq: C6, at: 0.86, dur: 0.08, gain: 0.13 },
      { freq: A5, at: 0.94, dur: 0.08, gain: 0.13 }, { freq: C6, at: 1.02, dur: 0.14, gain: 0.13 },
    ],
  },
]

export const DEFAULT_RINGTONE = 'chime'

export function getRingtone(id: string): Ringtone {
  return RINGTONES.find((tone) => tone.id === id) ?? RINGTONES[0]
}

function phraseLength(tone: Ringtone) {
  return Math.max(...tone.notes.map((note) => note.at + note.dur))
}

/* ---------------------------------------------------------------- play --- */

function voice(ctx: AudioContext, tone: Ringtone, note: Note, startAt: number) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()

  osc.type = tone.wave
  osc.frequency.value = note.freq

  const peak = note.gain ?? 0.16
  const start = startAt + note.at

  // struck rather than blown: near-instant attack, exponential tail
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + note.dur)

  osc.connect(gain).connect(ctx.destination)
  osc.start(start)
  osc.stop(start + note.dur + 0.05)

  const entry = { osc, gain }
  live.push(entry)
  osc.onended = () => { live = live.filter((item) => item !== entry) }
}

/** Play one pass of the chosen ringtone. */
export function playRingtone(id: string = DEFAULT_RINGTONE) {
  const ctx = getContext()
  if (!ctx) return
  void ctx.resume().catch(() => undefined)

  const tone = getRingtone(id)
  const startAt = ctx.currentTime + 0.02
  for (const note of tone.notes) voice(ctx, tone, note, startAt)
}

/* ------------------------------------------------------------------ alert -- */

let repeatTimer: number | null = null
let stopListener: (() => void) | null = null

/** Give up on an unattended alert rather than ringing forever. */
const MAX_ALERT_MS = 60_000

/** Cut sounding notes short instead of letting their tails ring on. */
function silence() {
  const ctx = context
  if (!ctx) return
  for (const { osc, gain } of live) {
    try {
      gain.gain.cancelScheduledValues(ctx.currentTime)
      gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.015)
      osc.stop(ctx.currentTime + 0.08)
    } catch {
      // already stopped
    }
  }
  live = []
}

/** Stop a repeating alert and detach its listeners. */
export function stopAlert() {
  if (repeatTimer !== null) {
    window.clearInterval(repeatTimer)
    repeatTimer = null
  }
  if (stopListener) {
    document.removeEventListener('pointerdown', stopListener)
    document.removeEventListener('keydown', stopListener)
    window.removeEventListener('blur', stopListener)
    stopListener = null
  }
  silence()
}

/**
 * Ring until acknowledged.
 *
 * Repeats until the user clicks or types anywhere — no particular button has to
 * be found. Capped at a minute so an unattended tab goes quiet on its own.
 */
export function startAlert(id: string = DEFAULT_RINGTONE) {
  stopAlert()
  playRingtone(id)

  const tone = getRingtone(id)
  const everyMs = Math.round((phraseLength(tone) + tone.gap) * 1000)
  const startedAt = Date.now()

  repeatTimer = window.setInterval(() => {
    if (Date.now() - startedAt >= MAX_ALERT_MS) {
      stopAlert()
      return
    }
    playRingtone(id)
  }, everyMs)

  stopListener = () => stopAlert()
  document.addEventListener('pointerdown', stopListener)
  document.addEventListener('keydown', stopListener)
  window.addEventListener('blur', stopListener)
}
