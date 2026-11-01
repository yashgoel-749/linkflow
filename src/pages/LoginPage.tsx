import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  AtSign,
  Eye,
  EyeOff,
  Github,
  Link2,
  LockKeyhole,
  QrCode,
  UserRound,
} from 'lucide-react';
import { useAuth } from '../context/auth-context';
import { errorMessage } from '../lib/api';
import { Brand } from '../components/layout/Brand';
import { Card, CardHeading } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Field } from '../components/ui/Field';
import { Tabs } from '../components/ui/Tabs';
import { RequestState } from '../components/ui/RequestState';
import './LoginPage.css';

type AccountMode = 'login' | 'signup';
export default function LoginPage() {
  const { session, authenticate, retrySession, notify } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<AccountMode>('login');
  const [visible, setVisible] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [remember, setRemember] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  if (session.kind === 'authenticated') return <Navigate to="/dashboard" replace />;
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
  return (
    <div className="auth-background auth-page flex min-h-dvh items-center justify-center px-4 py-10 sm:px-8 lg:px-12">
      <div className="auth-layout grid w-full grid-cols-1">
        <Card className="auth-form-card flex flex-col p-6 sm:p-10">
          <div className="auth-header flex flex-wrap items-center justify-between gap-5">
            <Brand subtitle />
            <Tabs
              label="Account mode"
              options={[
                { value: 'login', label: 'Log In' },
                { value: 'signup', label: 'Sign Up' },
              ]}
              value={mode}
              onChange={(next) => {
                setMode(next);
                setPassword('');
                setConfirmation('');
                setError('');
              }}
            />
          </div>
          <h1 className="auth-heading">
            {mode === 'login' ? 'Welcome back' : 'Create your account'}
          </h1>
          <p className="auth-description mt-2 leading-relaxed text-muted">
            {mode === 'login'
              ? 'Sign in to access your saved links and recorded traffic.'
              : 'Create a private LinkFlow workspace.'}
          </p>
          <div className="auth-social grid gap-3 sm:grid-cols-2">
            <Button disabled className="auth-social-button">
              Continue with Google
            </Button>
            <Button disabled className="auth-social-button">
              <Github size={18} /> Continue with GitHub
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted">OAuth sign-in is not implemented.</p>
          <div className="my-6 flex items-center gap-4">
            <span className="h-px flex-1 bg-border" />
            <span className="text-xs font-semibold text-muted">CONTINUE WITH EMAIL</span>
            <span className="h-px flex-1 bg-border" />
          </div>
          <form
            className="auth-form space-y-6"
            onSubmit={async (event) => {
              event.preventDefault();
              if (pending) return;
              if (mode === 'signup' && password !== confirmation) {
                setError('Your passwords do not match.');
                return;
              }
              setPending(true);
              setError('');
              try {
                await authenticate(mode, {
                  name: name.trim(),
                  email: email.trim(),
                  password,
                  remember,
                });
                setPassword('');
                setConfirmation('');
                navigate('/dashboard');
              } catch (error) {
                setError(errorMessage(error));
              } finally {
                setPending(false);
              }
            }}
          >
            {mode === 'signup' && (
              <Field
                name="name"
                label="Full name"
                icon={<UserRound size={18} />}
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                maxLength={80}
                autoComplete="name"
              />
            )}
            <Field
              id="auth-email"
              name="email"
              label="Work Email"
              type="email"
              autoComplete="email"
              icon={<AtSign size={19} />}
              placeholder="you@company.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            <div>
              <div className="mb-2 flex justify-between gap-3">
                <label htmlFor="auth-password">Password</label>
                {mode === 'login' && (
                  <button
                    disabled
                    type="button"
                    className="text-sm text-muted"
                    title="Password reset is not implemented"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <Field
                id="auth-password"
                name="password"
                type={visible ? 'text' : 'password'}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                icon={<LockKeyhole size={18} />}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={8}
                suffix={
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={visible ? 'Hide password' : 'Show password'}
                    aria-pressed={visible}
                    onClick={() => setVisible(!visible)}
                  >
                    {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                }
              />
            </div>
            {mode === 'signup' && (
              <Field
                id="signup-confirmation"
                name="confirmation"
                label="Confirm password"
                type={visible ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                required
              />
            )}
            <div className="auth-options flex flex-wrap items-center justify-between gap-3 text-muted">
              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(event) => setRemember(event.target.checked)}
                />{' '}
                Remember me
              </label>
            </div>
            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
            <Button
              disabled={pending}
              variant="primary"
              type="submit"
              className="auth-submit w-full"
            >
              {pending
                ? 'Connecting…'
                : mode === 'login'
                  ? 'Sign in to Dashboard'
                  : 'Create account'}
              <ArrowRight size={18} />
            </Button>
            <p className="auth-preview-note text-center text-[11px] leading-relaxed text-subtle">
              Your session uses an HttpOnly cookie. Password reset and OAuth are not implemented.
            </p>
          </form>
          <p className="auth-switch text-center text-muted">
            {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
            <button
              className="font-medium text-accent-soft"
              onClick={() => {
                setMode(mode === 'login' ? 'signup' : 'login');
                setError('');
              }}
            >
              {mode === 'login' ? 'Sign up' : 'Log in'}
            </button>
          </p>
        </Card>
        <aside className="auth-aside">
          <Card className="auth-traffic-card p-6 sm:p-7">
            <Link2 size={28} className="mb-6 text-accent-soft" />
            <CardHeading
              title="Your links, saved"
              description="Create and manage destination URLs, aliases, tags, and expiration dates."
            />
            <p className="text-sm leading-7 text-muted">
              Links stay in your account across browser sessions. Password-protected links challenge
              visitors before redirecting.
            </p>
          </Card>
          <Card className="auth-testimonial-card p-6 sm:p-7">
            <QrCode size={28} className="mb-6 text-accent-soft" />
            <CardHeading
              title="From link to QR"
              description="Download SVG or PNG codes for your canonical short URLs."
            />
            <p className="text-sm leading-7 text-muted">
              Analytics show actual recorded redirects. Visitor counts are privacy-preserving
              estimates; conversion tracking is not available.
            </p>
          </Card>
        </aside>
      </div>
    </div>
  );
}
