import { SearchX } from 'lucide-react';

export function EmptyState({
  title = 'No links found',
  description = 'Try another search or clear your filters.',
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <span className="rounded-2xl bg-elevated p-4 text-accent-soft">
        <SearchX size={24} />
      </span>
      <h3>{title}</h3>
      <p className="max-w-sm text-[13px] text-muted">{description}</p>
    </div>
  );
}
