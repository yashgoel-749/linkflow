import { QRCodeSVG } from 'qrcode.react';
import { Download } from 'lucide-react';
import { useState } from 'react';
import type { ShortLink } from '../../types/link';
import { shortUrl } from '../../lib/utils';
import { downloadQr, errorMessage } from '../../lib/api';
import { Button } from '../ui/Button';

export function QrPreview({
  link,
  color = '#181521',
  size = 180,
  showDownload = true,
}: {
  link: ShortLink;
  color?: string;
  size?: number;
  showDownload?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function download(format: 'svg' | 'png') {
    setPending(true);
    setError('');
    try {
      await downloadQr(link.id, link.slug, format);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="rounded-2xl bg-white p-3">
        <QRCodeSVG
          value={shortUrl(link)}
          size={size}
          fgColor={color}
          bgColor="#ffffff"
          level="M"
          marginSize={2}
          role="img"
          aria-label={`QR code for ${shortUrl(link)}`}
          title={`QR code for ${shortUrl(link)}`}
        />
      </div>
      {showDownload && (
        <>
          <p className="break-all text-center text-xs text-accent-soft">{shortUrl(link)}</p>
          <div className="flex gap-2">
            <Button
              disabled={pending}
              onClick={async () => {
                await download('svg');
              }}
            >
              <Download size={15} /> Download SVG
            </Button>
            <Button
              disabled={pending}
              onClick={async () => {
                await download('png');
              }}
            >
              PNG
            </Button>
          </div>
          <p className="max-w-xs text-center text-[11px] text-subtle">
            Downloads use the server’s canonical URL. Preview color is browser-only.
          </p>
          {error && (
            <p role="alert" className="text-xs text-danger">
              {error}
            </p>
          )}
        </>
      )}
    </div>
  );
}
