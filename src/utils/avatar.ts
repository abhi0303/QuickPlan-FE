/**
 * A stable colour per person, derived from their name.
 *
 * Every other surface in the app is teal; giving each person their own hue
 * makes a list of people read as people rather than records, and the same
 * person keeps the same colour on every page and every visit.
 */
export function hue(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) % 360
  return hash
}

/** Inline background for an avatar, since the colour cannot be a class. */
export function avatarStyle(name: string) {
  const h = hue(name)
  return {
    background: `linear-gradient(135deg, hsl(${h} 62% 58%), hsl(${(h + 42) % 360} 66% 48%))`,
  }
}

/** Up to two letters — "Anita Singh" reads better than a lone "A" in a row of them. */
export function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('')
}
