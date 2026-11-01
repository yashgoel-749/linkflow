import type { ReactNode } from 'react';

export function PageHeader({
  title,
  description,
  badge,
  actions,
  eyebrow,
}: {
  title: string;
  description: string;
  badge?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <header className="flex flex-col justify-between gap-5 xl:flex-row xl:items-center">
      <div className="min-w-0">
        {eyebrow && <div className="mb-3">{eyebrow}</div>}
        <div className="flex flex-wrap items-center gap-3">
          <h1>{title}</h1>
          {badge}
        </div>
        <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-muted sm:text-sm">
          {description}
        </p>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
