import { Icon } from './components/ui';
import { useThemeEffect } from './hooks';
import { TABS, useApp, type Tab } from './state';
import { Settings } from './screens/Settings';

const LABELS: Record<Tab, string> = {
  today: 'Today',
  log: 'Log',
  progress: 'Progress',
  training: 'Training',
  foods: 'Foods',
  settings: 'Settings',
};

function Placeholder({ title }: { title: string }) {
  return (
    <div className="page">
      <h1>{title}</h1>
      <p className="muted">Coming in a later milestone.</p>
    </div>
  );
}

export function App() {
  useThemeEffect();
  const { route, go } = useApp();
  let screen;
  switch (route.tab) {
    case 'settings':
      screen = <Settings />;
      break;
    default:
      screen = <Placeholder title={LABELS[route.tab]} />;
  }
  return (
    <div className="app">
      <main>{screen}</main>
      <nav className="tabbar" aria-label="Main">
        {TABS.map((t) => (
          <button key={t} type="button" aria-current={route.tab === t ? 'page' : undefined} onClick={() => go(t)}>
            <Icon name={t} />
            <span>{LABELS[t]}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
