import { Navigate, useRoutes, type Location } from 'react-router-dom';
import { DashboardPage } from '@/pages/DashboardPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { ApiKeysPage } from '@/pages/ApiKeysPage';
import { AiProvidersPage } from '@/pages/AiProvidersPage';
import { AuthFilesPage } from '@/pages/AuthFilesPage';
import { OAuthPage } from '@/pages/OAuthPage';
import { QuotaPage } from '@/pages/QuotaPage';
import { ConfigPage } from '@/pages/ConfigPage';
import { LogsPage } from '@/pages/LogsPage';
import { SystemPage } from '@/pages/SystemPage';
import { MonitorPage } from '@/pages/MonitorPage';

const mainRoutes = [
  { path: '/', element: <MonitorPage /> },
  { path: '/dashboard', element: <DashboardPage /> },
  { path: '/settings', element: <SettingsPage /> },
  { path: '/api-keys', element: <ApiKeysPage /> },
  { path: '/ai-providers', element: <AiProvidersPage /> },
  { path: '/auth-files', element: <AuthFilesPage /> },
  { path: '/oauth', element: <OAuthPage /> },
  { path: '/quota', element: <QuotaPage /> },
  { path: '/config', element: <ConfigPage /> },
  { path: '/logs', element: <LogsPage /> },
  { path: '/system', element: <SystemPage /> },
  { path: '/monitor', element: <MonitorPage /> },
  { path: '*', element: <Navigate to="/" replace /> },
];

export function MainRoutes({ location }: { location?: Location }) {
  return useRoutes(mainRoutes, location);
}
