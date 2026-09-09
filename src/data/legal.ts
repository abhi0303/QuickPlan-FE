/**
 * The one constant the whole consent rule turns on.
 *
 * The policies ship with the app, so the frontend already knows what the
 * current version is — there is no endpoint to ask. The backend rejects any
 * version it has not published, which is what stops the two drifting apart.
 *
 * Bump this and the policy text together, never one without the other.
 */
export const CURRENT_TERMS_VERSION = '2026-09-10'

/** Shown on the policy pages themselves. */
export const TERMS_EFFECTIVE = '10 September 2026'

/**
 * The DPDP Act requires a published contact for privacy questions and
 * grievances. This has to be an address somebody actually reads.
 */
export const GRIEVANCE_EMAIL = 'quickplann@gmail.com'

/** True when this person has not agreed to the policies as they stand today. */
export function needsReacceptance(termsVersion: string | null | undefined): boolean {
  return termsVersion !== CURRENT_TERMS_VERSION
}
