import { render, screen } from '@testing-library/react';
import React from 'react';
import { Outlet } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authState = vi.hoisted(() => ({ status: 'authenticated' as 'authenticated' | 'unauthenticated' }));

vi.mock('@/renderer/hooks/context/AuthContext', () => ({
  storePostLoginRedirect: vi.fn((route?: string) => {
    window.sessionStorage.setItem('aionui-post-login-redirect', route ?? window.location.hash.replace(/^#/, ''));
  }),
  useAuth: () => ({ status: authState.status }),
}));

vi.mock('@/renderer/components/layout/AppLoader', () => ({
  default: () => <div data-testid='app-loader' />,
}));

vi.mock('@/renderer/pages/guid', () => ({
  default: () => <div data-testid='guid-page'>Guid</div>,
}));

import PanelRoute from '@/renderer/components/layout/Router';

const LayoutShell: React.FC = () => <Outlet />;

describe('PanelRoute team entry guard', () => {
  beforeEach(() => {
    authState.status = 'authenticated';
    window.location.hash = '#/guid';
    window.sessionStorage.clear();
  });

  it('does not redirect team routes when team mode is enabled', async () => {
    window.location.hash = '#/team/team-1';

    render(<PanelRoute layout={<LayoutShell />} />);

    expect(window.location.hash).toBe('#/team/team-1');
  });

  it('still renders the guid route normally', async () => {
    render(<PanelRoute layout={<LayoutShell />} />);

    expect(await screen.findByTestId('guid-page')).toBeInTheDocument();
  });

  it('preserves deep team routes before redirecting unauthenticated users to login', async () => {
    authState.status = 'unauthenticated';
    window.location.hash = '#/team/bf159dd1-e44e-4939-b9d2-328052f65761';

    render(<PanelRoute layout={<LayoutShell />} />);

    expect(window.sessionStorage.getItem('aionui-post-login-redirect')).toBe(
      '/team/bf159dd1-e44e-4939-b9d2-328052f65761'
    );
    expect(window.location.hash).toBe('#/login');
  });
});
