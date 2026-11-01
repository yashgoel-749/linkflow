import { useEffect, useRef, useState } from 'react';
import { Bell, CircleHelp, Code2, Menu, Moon, Plus, Search, Sun } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../../context/theme-context';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { apiBase } from '../../lib/api';

export function Topbar({ onMenu, onCreate }: { onMenu: () => void; onCreate: () => void }) {
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [panel, setPanel] = useState<'help' | 'notifications' | null>(null);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  return (
    <>
      <header className="sticky top-0 z-30 flex h-[72px] items-center gap-3 border-b border-border/20 bg-background/95 px-4 backdrop-blur-xl sm:px-7">
        <button onClick={onMenu} className="icon-button lg:hidden" aria-label="Open navigation">
          <Menu size={22} />
        </button>
        <form
          className="mr-auto min-w-0 flex-1 sm:max-w-[460px]"
          onSubmit={(event) => {
            event.preventDefault();
            navigate(`/links?q=${encodeURIComponent(query)}`);
          }}
        >
          <div className="field min-h-9! rounded-xl! py-0">
            <Search size={17} />
            <input
              ref={input}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Search all links"
              placeholder="Search short links, destinations, tags…"
              className="py-2! text-xs!"
            />
            <kbd className="hidden whitespace-nowrap rounded bg-elevated px-1.5 py-1 text-[10px] text-muted md:block">
              ⌘ K
            </kbd>
          </div>
        </form>
        <button
          onClick={() => window.open(`${apiBase}/docs`, '_blank', 'noopener,noreferrer')}
          className="btn btn-ghost hidden px-2! xl:inline-flex"
        >
          <Code2 size={16} />
          API Docs
        </button>
        <button
          onClick={() => setPanel('help')}
          className="icon-button hidden sm:inline-flex"
          aria-label="Help"
        >
          <CircleHelp size={18} />
        </button>
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="icon-button"
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <button
          onClick={() => setPanel('notifications')}
          className="icon-button relative hidden sm:inline-flex"
          aria-label="Notifications"
        >
          <Bell size={18} />
        </button>
        <Button variant="primary" onClick={onCreate} className="min-h-9! px-3! sm:px-4!">
          <Plus size={17} />
          <span className="hidden sm:inline">Create Link</span>
          <span className="sm:hidden">Create</span>
        </Button>
      </header>
      <Dialog
        open={panel !== null}
        onClose={() => setPanel(null)}
        title={panel === 'notifications' ? 'Workspace notifications' : 'Welcome to LinkFlow'}
      >
        {panel === 'notifications' ? (
          <div className="space-y-4">
            <p className="text-sm text-muted">Notifications are not implemented.</p>
          </div>
        ) : (
          <div className="space-y-4 text-sm leading-relaxed text-muted">
            <p>
              Manage short links, explore traffic analytics, and create scannable QR codes from one
              workspace.
            </p>
            <p>
              Links and profile changes are saved to your account. Analytics reflect recorded
              redirects. DNS verification proves domain ownership but does not provision hosting or
              certificates. Billing and notifications are not implemented.
            </p>
            <p>
              Use <kbd className="rounded bg-input px-2 py-1 text-foreground">Ctrl / ⌘ K</kbd> to
              search. The sun/moon button switches themes.
            </p>
          </div>
        )}
      </Dialog>
    </>
  );
}
