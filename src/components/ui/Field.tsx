import clsx from 'clsx';
import { useId } from 'react';
import type { ComponentProps, ReactNode } from 'react';

type FieldProps = ComponentProps<'input'> & {
  label?: string;
  icon?: ReactNode;
  suffix?: ReactNode;
  wrapperClassName?: string;
};
export function Field({ label, icon, suffix, wrapperClassName, id, ...props }: FieldProps) {
  const autoId = useId();
  const inputId = id || autoId;
  return (
    <div className={clsx('min-w-0', wrapperClassName)}>
      {label && (
        <label htmlFor={inputId} className="mb-2 block text-[13px] font-medium">
          {label}
        </label>
      )}
      <div className="field">
        {icon}
        <input id={inputId} {...props} />
        {suffix}
      </div>
    </div>
  );
}
