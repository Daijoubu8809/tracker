import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { todayISO } from './lib/dates';
import type { ISODate } from './lib/types';

export type Tab = 'today' | 'log' | 'progress' | 'training' | 'foods' | 'settings';
export const TABS: readonly Tab[] = ['today', 'log', 'progress', 'training', 'foods', 'settings'];

interface Route {
  tab: Tab;
  sub: string | null;
}

interface ToastMsg {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
}

interface AppState {
  date: ISODate;
  setDate: (d: ISODate) => void;
  route: Route;
  go: (tab: Tab, sub?: string | null) => void;
  toast: (text: string, action?: ToastMsg['action']) => void;
}

const Ctx = createContext<AppState | null>(null);

function parseHash(): Route {
  const h = window.location.hash.replace(/^#\/?/, '');
  const [tab, sub] = h.split('/');
  return { tab: (TABS as readonly string[]).includes(tab) ? (tab as Tab) : 'today', sub: sub || null };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [date, setDate] = useState<ISODate>(todayISO());
  const [route, setRoute] = useState<Route>(parseHash);
  const [toastMsg, setToastMsg] = useState<ToastMsg | null>(null);

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // When the app is reopened on a new day, jump to today if the user was on "today".
  useEffect(() => {
    let last = todayISO();
    const onVis = () => {
      if (document.visibilityState !== 'visible') return;
      const now = todayISO();
      if (now !== last) {
        setDate((d) => (d === last ? now : d));
        last = now;
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const go = useCallback((tab: Tab, sub: string | null = null) => {
    const hash = `#${tab}${sub ? `/${sub}` : ''}`;
    if (window.location.hash !== hash) window.location.hash = hash;
    setRoute({ tab, sub });
    window.scrollTo(0, 0);
  }, []);

  const toast = useCallback((text: string, action?: ToastMsg['action']) => {
    setToastMsg({ id: Date.now(), text, action });
  }, []);

  useEffect(() => {
    if (!toastMsg) return;
    const t = window.setTimeout(() => setToastMsg(null), toastMsg.action ? 5000 : 2500);
    return () => window.clearTimeout(t);
  }, [toastMsg]);

  const value = useMemo(() => ({ date, setDate, route, go, toast }), [date, route, go, toast]);
  return (
    <Ctx.Provider value={value}>
      {children}
      {toastMsg ? (
        <div className="toast" role="status" aria-live="polite" key={toastMsg.id}>
          <span>{toastMsg.text}</span>
          {toastMsg.action ? (
            <button
              type="button"
              onClick={() => {
                toastMsg.action?.run();
                setToastMsg(null);
              }}
            >
              {toastMsg.action.label}
            </button>
          ) : null}
        </div>
      ) : null}
    </Ctx.Provider>
  );
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp outside AppProvider');
  return v;
}
