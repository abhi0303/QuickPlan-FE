/**
 * Password rules, shared by the sign-up form and the change-password dialog.
 *
 * They agree on what a good password is, so a password accepted at sign-up is
 * still accepted when it is changed later.
 */

export const PASSWORD_MIN_LENGTH = 8

export const STRENGTH_LABELS = ['', 'Weak', 'Fair', 'Good', 'Strong']

export function passwordChecks(password: string) {
  return {
    length: password.length >= PASSWORD_MIN_LENGTH,
    letter: /[a-zA-Z]/.test(password),
    number: /\d/.test(password),
    symbol: /[^a-zA-Z0-9]/.test(password),
  }
}

export function passwordScore(password: string) {
  if (!password) return 0
  const checks = passwordChecks(password)
  const met = Object.values(checks).filter(Boolean).length
  // a long password that ticks everything reads as strong; short ones cap at fair
  if (!checks.length) return Math.min(met, 2)
  return Math.max(1, met)
}
