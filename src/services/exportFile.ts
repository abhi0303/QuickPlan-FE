/**
 * CSV building and downloading.
 *
 * Everything is produced in the browser from data already on screen — nothing
 * is uploaded anywhere to be turned into a file.
 */

/**
 * One CSV cell.
 *
 * A value is quoted whenever it contains a comma, a quote or a newline, and
 * inner quotes are doubled — the rule every spreadsheet agrees on. A leading
 * `=`, `+`, `-` or `@` is prefixed with an apostrophe: without it a title like
 * "=2+2" is treated as a formula when the file is opened.
 */
function cell(value: unknown): string {
  if (value === null || value === undefined) return ''
  const text = String(value)
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  // a BOM so Excel reads UTF-8 rather than mangling the rupee sign
  return `\ufeff${rows.map((row) => row.map(cell).join(',')).join('\r\n')}\r\n`
}

/** Hands the file to the browser; nothing leaves the device. */
export function downloadFile(name: string, contents: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([contents], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  // give the download a tick to start before the blob goes away
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Safe, readable file names: "Goa trip" → "goa-trip". */
export function slug(text: string): string {
  return text.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'export'
}
