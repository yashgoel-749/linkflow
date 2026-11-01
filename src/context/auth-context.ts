import { createContext, useContext } from 'react';
import type { CreateResult, Domain, LinkDraft, ShortLink } from '../types/link';
import type { User } from '../lib/api';

export type Session =
  | { kind: 'loading' }
  | { kind: 'anonymous' }
  | { kind: 'authenticated'; user: User }
  | { kind: 'error'; message: string };
export type Inventory =
  { kind: 'loading' } | { kind: 'ready' } | { kind: 'error'; message: string };
export type LinkUpdate = Partial<
  Pick<
    ShortLink,
    'title' | 'destination' | 'slug' | 'tags' | 'category' | 'expiresAt' | 'protected'
  >
> & { password?: string; archived?: boolean };
export interface AuthState {
  session: Session;
  inventory: Inventory;
  links: ShortLink[];
  domains: Domain[];
  profile: User;
  authenticate: (
    mode: 'login' | 'signup',
    input: { name: string; email: string; password: string; remember: boolean }
  ) => Promise<void>;
  logout: () => Promise<void>;
  retrySession: () => Promise<void>;
  refresh: (options?: { background?: boolean }) => Promise<void>;
  createLink: (draft: LinkDraft) => Promise<CreateResult>;
  editLink: (id: string, update: LinkUpdate) => Promise<void>;
  archiveLinks: (ids: string[]) => Promise<void>;
  restoreLinks: (ids: string[]) => Promise<void>;
  deleteLinks: (ids: string[]) => Promise<void>;
  addDomain: (hostname: string) => Promise<Domain>;
  verifyDomain: (hostname: string) => Promise<void>;
  saveProfile: (profile: { name: string }) => Promise<void>;
  notify: (message: string) => void;
  copy: (text: string) => Promise<void>;
}
export const AuthContext = createContext<AuthState | null>(null);
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth requires AuthProvider');
  return context;
}
