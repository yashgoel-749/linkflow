export function csvCell(value: string | number | null) {
  let text = value === null ? '' : String(value);
  // Prevent formulas even after spreadsheet trimming of leading control/space characters.
  let prefix = 0;
  while (prefix < text.length && (text.charCodeAt(prefix) <= 31 || /\s/.test(text[prefix] ?? '')))
    prefix++;
  if (/^[=+\-@]/.test(text.slice(prefix)) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export function csv(rows: (string | number | null)[][]) {
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
