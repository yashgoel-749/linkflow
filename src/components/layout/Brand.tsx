import { Link2 } from 'lucide-react';
import { Link } from 'react-router-dom';

export function Brand({ subtitle = false }: { subtitle?: boolean }) {
  return (
    <Link to="/dashboard" aria-label="LinkFlow home" className="flex items-center gap-3">
      <span className="flex size-9 items-center justify-center rounded-xl bg-accent/15 text-accent">
        <Link2 size={25} strokeWidth={2.5} className="-rotate-45" />
      </span>
      <span>
        <span className="font-display text-[22px] font-bold tracking-tight">LinkFlow</span>
        {subtitle && <span className="mt-0.5 block text-xs text-muted">telemetry.mesh.v2</span>}
      </span>
      {!subtitle && (
        <span className="ml-auto rounded-full bg-[#6520c1] px-2 py-1 text-[10px] font-semibold text-[#e4d4ff]">
          PRO
        </span>
      )}
    </Link>
  );
}
