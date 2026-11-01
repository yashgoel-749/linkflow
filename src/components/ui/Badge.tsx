import clsx from 'clsx';
import type { ReactNode } from 'react';
import type { LinkStatus } from '../../types/link';

export function Badge({
  children,
  tone = 'accent',
  dot = false,
}: {
  children: ReactNode;
  tone?: 'accent' | 'success' | 'danger' | 'muted';
  dot?: boolean;
}) {
  return (
    <span
      className={clsx('badge', {
        'text-success bg-success/10': tone === 'success',
        'text-danger bg-danger/10': tone === 'danger',
        'text-muted': tone === 'muted',
      })}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: LinkStatus }) {
  switch (status) {
    case 'active':
      return <Badge dot>Active</Badge>;
    case 'expiring':
      return (
        <Badge dot tone="danger">
          Expiring soon
        </Badge>
      );
    case 'archived':
      return (
        <Badge dot tone="muted">
          Archived
        </Badge>
      );
    case 'expired':
      return (
        <Badge dot tone="danger">
          Expired
        </Badge>
      );
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}
