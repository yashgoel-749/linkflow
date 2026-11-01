import type { ShortLink } from '../types/link';

export const number = new Intl.NumberFormat('en-US');
export const shortUrl = (link: Pick<ShortLink, 'shortUrl'>) => link.shortUrl;

export function relativeDate(timestamp: number, now = Date.now()) {
  const elapsed = Math.max(0, now - timestamp);
  const days = Math.floor(elapsed / 86_400_000);
  if (days) return `${days} ${days === 1 ? 'day' : 'days'} ago`;
  const hours = Math.floor(elapsed / 3_600_000);
  if (hours) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const minutes = Math.floor(elapsed / 60_000);
  return minutes ? `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago` : 'Just now';
}

export function downloadFile({
  name,
  content,
  type,
}: {
  name: string;
  content: string;
  type: string;
}) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function toCsv(rows: readonly (readonly (string | number)[])[]) {
  const escape = (value: string | number) => {
    const text = String(value);
    const safe = /^\s*[=+\-@]|^[\t\r\n]/.test(text) ? `'${text}` : text;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  return rows.map((row) => row.map(escape).join(',')).join('\r\n');
}

export function exportLinks(links: ShortLink[]) {
  const rows = [
    ['Title', 'Short URL', 'Destination', 'Tags', 'Status', 'Clicks'],
    ...links.map((link) => [
      link.title,
      shortUrl(link),
      link.destination,
      link.tags.join('; '),
      link.status,
      link.clicks,
    ]),
  ];
  downloadFile({
    name: 'linkflow-links.csv',
    content: toCsv(rows),
    type: 'text/csv;charset=utf-8',
  });
}
