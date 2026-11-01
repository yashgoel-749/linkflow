import { NavLink } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import clsx from 'clsx';
import { navigation } from '../../app/navigation';
import { useAuth } from '../../context/auth-context';
import { errorMessage } from '../../lib/api';
import { useState } from 'react';
import { Brand } from './Brand';
import { Button } from '../ui/Button';

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { profile, notify, logout } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  return (
    <div className="flex h-full flex-col bg-sidebar px-3 py-5">
      <div className="px-3 pb-8">
        <Brand />
      </div>
      <nav aria-label="Main navigation" className="space-y-1.5">
        {navigation.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            onClick={onNavigate}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 rounded-xl px-4 py-3 text-[13px] font-medium transition-colors',
                isActive
                  ? 'bg-accent text-[#161427] shadow-[0_0_22px_#8780ff15]'
                  : 'text-muted hover:bg-elevated/50 hover:text-foreground'
              )
            }
          >
            <item.icon size={19} />
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto space-y-3 pt-10">
        <div className="card p-4">
          <p className="eyebrow mb-2">Billing</p>
          <p className="mb-3 text-xs text-muted">Billing and quotas are not implemented.</p>
          <Button disabled className="min-h-8 w-full text-xs">
            Upgrade unavailable
          </Button>
        </div>
        <div className="card flex items-center gap-2.5 p-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-accent/20 bg-accent/15 text-xs font-semibold text-accent-soft">
            {profile.name
              .split(' ')
              .map((part) => part[0])
              .join('')
              .slice(0, 2)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold">{profile.name}</p>
            <p className="mt-1 truncate text-[11px] text-muted">{profile.email}</p>
          </div>
          <button
            disabled={pending}
            onClick={async () => {
              setPending(true);
              setError('');
              try {
                await logout();
                onNavigate?.();
              } catch (error) {
                setError(errorMessage(error));
                notify(errorMessage(error));
              } finally {
                setPending(false);
              }
            }}
            className="icon-button size-7!"
            aria-label="Log out"
          >
            <LogOut size={17} />
          </button>
        </div>
        {error && (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        )}
        <p className="text-center text-[10px] text-subtle">LinkFlow · Your workspace</p>
      </div>
    </div>
  );
}
