import { lazy, Suspense } from 'react';
import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { useAuth } from '../context/auth-context';
import { RequestState } from '../components/ui/RequestState';
import { errorMessage } from '../lib/api';
import { AppShell } from '../components/layout/AppShell';
import { navigation } from './navigation';

const Login = lazy(() => import('../pages/LoginPage'));
const NotFound = lazy(() => import('../pages/NotFoundPage'));

function ProtectedRoutes() {
  const { session, inventory, retrySession, refresh, notify } = useAuth();
  if (session.kind === 'anonymous') return <Navigate to="/login" replace />;
  if (session.kind === 'loading') return <RequestState label="Checking your session…" />;
  if (session.kind === 'error')
    return (
      <RequestState
        error={session.message}
        onRetry={() => {
          retrySession().catch((error: unknown) => notify(errorMessage(error)));
        }}
      />
    );
  if (inventory.kind !== 'ready')
    return (
      <RequestState
        label="Loading your links and domains…"
        error={inventory.kind === 'error' ? inventory.message : undefined}
        onRetry={() => {
          refresh().catch((error: unknown) => notify(errorMessage(error)));
        }}
      />
    );
  return <Outlet />;
}

export function App() {
  return (
    <Suspense
      fallback={
        <div
          className="flex min-h-dvh items-center justify-center bg-background text-sm text-muted"
          role="status"
        >
          Loading LinkFlow…
        </div>
      }
    >
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<ProtectedRoutes />}>
          <Route element={<AppShell />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            {navigation.map((item) => (
              <Route key={item.path} path={item.path} element={<item.page />} />
            ))}
            <Route path="*" element={<NotFound />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  );
}
