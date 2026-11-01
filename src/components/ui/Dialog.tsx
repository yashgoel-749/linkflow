import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import clsx from 'clsx';

export function Dialog({
  open,
  onClose,
  title,
  children,
  drawer = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  drawer?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className={clsx(
        'fixed border border-border bg-surface p-0 text-foreground shadow-2xl backdrop:bg-black/65 backdrop:backdrop-blur-sm',
        drawer
          ? 'inset-y-0 left-0 m-0 h-dvh max-h-dvh w-[280px] max-w-[85vw] rounded-r-2xl'
          : 'inset-0 m-auto max-h-[90dvh] w-[600px] max-w-[calc(100vw-32px)] rounded-2xl'
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-6 py-5">
        <h2>{title}</h2>
        <button type="button" aria-label="Close dialog" onClick={onClose} className="icon-button">
          <X size={18} />
        </button>
      </div>
      <div className={drawer ? 'h-[calc(100%_-_80px)] overflow-y-auto' : 'p-6'}>{children}</div>
    </dialog>
  );
}
