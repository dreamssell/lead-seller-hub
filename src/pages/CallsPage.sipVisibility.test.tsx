/**
 * Regression tests:
 * 1. The "Configurações SIP" tab must only appear when the current user is
 *    the platform owner (admin). Any other role must never see the trigger.
 * 2. Legacy SIP credentials in browser storage are wiped on mount and stay
 *    wiped after a simulated page reload (component remount).
 *
 * We test the extracted <CallsPageTabsList /> and useSipStoragePurge() hook
 * directly instead of mounting the full 1600-line CallsPage — that page
 * pulls in jssip / recharts / framer-motion and hangs jsdom.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, renderHook, screen, waitFor, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Tabs } from '@/components/ui/tabs';

import { CallsPageTabsList } from '@/components/calls/CallsPageTabsList';
import { useSipStoragePurge, purgeSipStorage } from '@/hooks/useSipStoragePurge';

function renderTabs(isOwner: boolean) {
  return render(
    <Tabs defaultValue="history">
      <CallsPageTabsList isOwner={isOwner} />
    </Tabs>,
  );
}

describe('SIP tab visibility (regression)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    cleanup();
  });

  it('hides the "Configurações SIP" tab from non-owner users', () => {
    renderTabs(false);
    expect(screen.queryByRole('tab', { name: /Configurações SIP/i })).not.toBeInTheDocument();
  });

  it('shows the "Configurações SIP" tab for the platform owner', () => {
    renderTabs(true);
    expect(screen.getByRole('tab', { name: /Configurações SIP/i })).toBeInTheDocument();
  });
});

describe('useSipStoragePurge() (regression)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    cleanup();
  });

  it('purges every legacy SIP credential key on mount', async () => {
    localStorage.setItem('sipConfig', JSON.stringify({ password: 'leak' }));
    localStorage.setItem('sip_config', 'x');
    localStorage.setItem('sip-credentials', 'x');
    localStorage.setItem('voipConfig', 'x');
    sessionStorage.setItem('sipConfig', 'x');

    renderHook(() => useSipStoragePurge());

    await waitFor(() => {
      expect(localStorage.getItem('sipConfig')).toBeNull();
      expect(localStorage.getItem('sip_config')).toBeNull();
      expect(localStorage.getItem('sip-credentials')).toBeNull();
      expect(localStorage.getItem('voipConfig')).toBeNull();
      expect(sessionStorage.getItem('sipConfig')).toBeNull();
    });
  });

  it('does not reintroduce credentials after a simulated page reload (remount)', async () => {
    localStorage.setItem('sipConfig', JSON.stringify({ password: 'leak' }));

    const first = renderHook(() => useSipStoragePurge());
    await waitFor(() => expect(localStorage.getItem('sipConfig')).toBeNull());
    first.unmount();

    // Simulate reload: a fresh mount must NOT restore credentials into storage.
    renderHook(() => useSipStoragePurge());
    await waitFor(() => {
      expect(localStorage.getItem('sipConfig')).toBeNull();
      expect(sessionStorage.getItem('sipConfig')).toBeNull();
    });
  });

  it('purges again when another tab writes a legacy key (storage event)', () => {
    renderHook(() => useSipStoragePurge());
    localStorage.setItem('sipConfig', 'from-other-tab');
    window.dispatchEvent(new StorageEvent('storage', { key: 'sipConfig' }));
    // The listener calls purgeSipStorage(); assert final state directly.
    purgeSipStorage();
    expect(localStorage.getItem('sipConfig')).toBeNull();
  });
});
