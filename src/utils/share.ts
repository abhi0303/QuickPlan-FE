/**
 * A percentage share, rounded without lying about it.
 *
 * ₹130 of ₹44,129 is 0.29%, and rounding that to "0%" tells somebody a row with
 * money in it is nothing. The two ends of the scale get the same treatment: a
 * category that is not quite everything must not read as all of it.
 */
export function sharePercent(share: number): string {
  if (!Number.isFinite(share) || share <= 0) return '0%'
  if (share < 1) return '<1%'
  if (share > 99 && share < 100) return '>99%'
  return `${Math.round(share)}%`
}
