/** Escapes a CSV field per RFC 4180 (quotes, commas, newlines). */
export function csvField(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value)
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/** Builds a CSV string from a header row and data rows. */
export function toCsv(header: string[], rows: unknown[][]): string {
  const lines = [header.map(csvField).join(',')]
  for (const row of rows) {
    lines.push(row.map(csvField).join(','))
  }
  return lines.join('\r\n')
}
