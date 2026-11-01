import { useState } from 'react';
import { Check, Mail, Moon, Save, Sun, UserRound } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../context/auth-context';
import { useTheme } from '../context/theme-context';
import { errorMessage } from '../lib/api';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardHeading } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Field } from '../components/ui/Field';

const sections = ['General', 'Appearance', 'Notifications', 'Link Defaults', 'Billing'];
export default function SettingsPage() {
  const { profile, saveProfile } = useAuth();
  const { theme, setTheme } = useTheme();
  const [section, setSection] = useState('General');
  const [name, setName] = useState(profile.name);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  return (
    <div className="page-stack animate-enter">
      <PageHeader
        title="Workspace Settings"
        description="Manage your account profile and browser appearance."
      />
      <div className="grid items-start gap-5 xl:grid-cols-[200px_1fr]">
        <nav aria-label="Settings sections" className="card flex flex-wrap gap-1 p-2 xl:flex-col">
          {sections.map((item) => (
            <button
              key={item}
              aria-pressed={section === item}
              onClick={() => setSection(item)}
              className={clsx(
                'rounded-xl px-4 py-3 text-left text-xs font-medium',
                section === item ? 'bg-accent/15 text-accent-soft' : 'text-muted hover:bg-elevated'
              )}
            >
              {item}
            </button>
          ))}
        </nav>
        <div className="space-y-5">
          {section === 'General' && (
            <Card className="p-6">
              <CardHeading
                title="Personal Profile"
                description="Saved to your account on the server."
              />
              <form
                className="space-y-5"
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (pending) return;
                  setPending(true);
                  setError('');
                  try {
                    await saveProfile({ name: name.trim() });
                  } catch (error) {
                    setError(errorMessage(error));
                  } finally {
                    setPending(false);
                  }
                }}
              >
                <div className="mb-6 flex items-center gap-4">
                  <span className="flex size-16 items-center justify-center rounded-full border border-accent/30 bg-accent/15 text-xl text-accent-soft">
                    {profile.name
                      .split(' ')
                      .map((part) => part[0])
                      .join('')
                      .slice(0, 2)}
                  </span>
                  <div>
                    <p className="font-medium">{profile.name}</p>
                    <p className="section-description">Account owner</p>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Full name"
                    icon={<UserRound size={16} />}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    required
                    pattern=".*\S.*"
                    maxLength={80}
                  />
                  <Field
                    label="Email address"
                    icon={<Mail size={16} />}
                    type="email"
                    value={profile.email}
                    readOnly
                  />
                </div>
                <p className="text-xs text-muted">
                  Email changes require password confirmation and are not implemented in this
                  interface. Password reset and OAuth are not implemented.
                </p>
                {error && (
                  <p role="alert" className="text-sm text-danger">
                    {error}
                  </p>
                )}
                <Button disabled={pending} type="submit" variant="primary">
                  <Save size={15} /> {pending ? 'Saving…' : 'Save profile'}
                </Button>
              </form>
            </Card>
          )}
          {section === 'Appearance' && (
            <Card className="p-6">
              <CardHeading title="Appearance" description="Saved in this browser." />
              <div className="grid gap-4 sm:grid-cols-2">
                {(['dark', 'light'] satisfies ('dark' | 'light')[]).map((value) => (
                  <button
                    key={value}
                    onClick={() => setTheme(value)}
                    aria-pressed={theme === value}
                    className={clsx(
                      'overflow-hidden rounded-xl border-2 text-left',
                      theme === value ? 'border-accent' : 'border-border'
                    )}
                  >
                    <div
                      className={`flex h-36 gap-3 p-4 ${value === 'dark' ? 'bg-[#0e1119]' : 'bg-[#f4f5fa]'}`}
                    >
                      <div className="w-10 rounded-lg bg-accent/30" />
                      <div className="flex-1 space-y-3">
                        <div className="h-4 w-2/3 rounded bg-accent/30" />
                        <div className="h-20 rounded bg-accent/10" />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 bg-surface p-4 text-sm">
                      {value === 'dark' ? <Moon size={17} /> : <Sun size={17} />}
                      <span className="capitalize">{value} theme</span>
                      {theme === value && <Check className="ml-auto text-accent" size={17} />}
                    </div>
                  </button>
                ))}
              </div>
            </Card>
          )}
          {!['General', 'Appearance'].includes(section) && (
            <Card className="p-6">
              <CardHeading title={section} description={`${section} is not implemented.`} />
              <p className="mb-5 text-sm text-muted">
                No settings will be saved or services activated.
              </p>
              <Button disabled>Not implemented</Button>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
