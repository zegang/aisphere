// Router configuration

import { createHashRouter } from 'react-router-dom';
import { lazy } from 'react';
import AiSphere from './AiSphere';

const HomePage = lazy(() => import('./pages/HomePage'));
const AppsPage = lazy(() => import('./pages/AppsPage'));
const SettingsPage = lazy(() => import('./pages/SettingPage'));
const ExplorePage = lazy(() => import('./pages/ExplorePage'));
const AppWorkspace = lazy(() => import('./pages/AppWorkspace'));

export const router = createHashRouter([
  {
    path: '/',
    element: <AiSphere />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'apps', element: <AppsPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'explore', element: <ExplorePage /> },
      { path: 'appworkspace', element: <AppWorkspace /> },
    ],
  },
]);
