import clsx from 'clsx';
import type { ComponentProps } from 'react';

type TableProps = ComponentProps<'table'> & { label: string };

export function Table({ label, className, ...props }: TableProps) {
  return (
    <div
      className="table-wrap"
      role="region"
      aria-label={`${label}, scrollable table`}
      tabIndex={0}
    >
      <table aria-label={label} className={clsx('data-table', className)} {...props} />
    </div>
  );
}
