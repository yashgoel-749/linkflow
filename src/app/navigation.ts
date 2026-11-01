import { BarChart3, Globe2, LayoutDashboard, Link2, QrCode, Settings2 } from 'lucide-react';
import { lazy } from 'react';

export const navigation = [
  {
    path: '/dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    page: lazy(() => import('../pages/DashboardPage')),
  },
  { path: '/links', label: 'Links', icon: Link2, page: lazy(() => import('../pages/LinksPage')) },
  {
    path: '/analytics',
    label: 'Analytics',
    icon: BarChart3,
    page: lazy(() => import('../pages/AnalyticsPage')),
  },
  {
    path: '/qr-codes',
    label: 'QR Codes',
    icon: QrCode,
    page: lazy(() => import('../pages/QrCodesPage')),
  },
  {
    path: '/domains',
    label: 'Custom Domains',
    icon: Globe2,
    page: lazy(() => import('../pages/DomainsPage')),
  },
  {
    path: '/settings',
    label: 'Settings',
    icon: Settings2,
    page: lazy(() => import('../pages/SettingsPage')),
  },
];
