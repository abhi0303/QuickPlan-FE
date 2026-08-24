/**
 * How a task or reminder came to exist.
 *
 * The client parses speech on-device, so a spoken task is created through the
 * ordinary endpoint and the origin has to travel with the payload — the server
 * cannot infer it. Missions that count voice-created items read this field.
 *
 * It is self-attested by design: a crafted request could claim VOICE for
 * something typed. That is unavoidable without server-side speech processing,
 * and the stakes are a mission's 100 XP.
 */
export const CREATED_VIA = ['MANUAL', 'VOICE', 'IMPORT', 'SYSTEM'] as const

export type CreatedVia = (typeof CREATED_VIA)[number]
