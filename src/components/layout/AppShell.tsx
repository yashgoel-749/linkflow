import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { Dialog } from '../ui/Dialog';
import { ShortenForm } from '../links/ShortenForm';

export function AppShell() {
  const { pathname } = useLocation();
  const [drawer, setDrawer] = useState(false);
  const [create, setCreate] = useState(false);
  return (
    <div
      className={
        pathname === '/dashboard'
          ? 'dashboard-shell'
          : pathname === '/analytics'
            ? 'analytics-shell'
            : undefined
      }
    >
      <a
        href="#main-content"
        className="sr-only fixed left-4 top-4 z-[80] rounded-lg bg-accent px-4 py-3 text-white focus:not-sr-only"
      >
        Skip to content
      </a>
      <aside className="sidebar fixed inset-y-0 left-0 z-40 hidden lg:block">
        <Sidebar />
      </aside>
      <div className="app-main min-h-dvh">
        <Topbar onMenu={() => setDrawer(true)} onCreate={() => setCreate(true)} />
        <main id="main-content" className="page-content">
          <Outlet />
        </main>
      </div>
      <Dialog open={drawer} onClose={() => setDrawer(false)} title="Navigation" drawer>
        <Sidebar onNavigate={() => setDrawer(false)} />
      </Dialog>
      <Dialog open={create} onClose={() => setCreate(false)} title="Create a new link">
        {create && <ShortenForm onCreated={() => setCreate(false)} />}
      </Dialog>
    </div>
  );
}
