import { Button } from './Button';
export function RequestState({
  error,
  onRetry,
  label = 'Loading…',
}: {
  error?: string;
  onRetry?: () => void;
  label?: string;
}) {
  return (
    <div className="card space-y-4 p-6" role={error ? 'alert' : 'status'}>
      <p className={error ? 'text-danger' : 'text-muted'}>{error || label}</p>
      {error && onRetry && <Button onClick={onRetry}>Retry</Button>}
    </div>
  );
}
