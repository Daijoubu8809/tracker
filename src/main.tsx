import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { AppProvider } from './state';
import './styles.css';

registerSW({ immediate: true });

// Ask the browser not to evict our IndexedDB data under storage pressure.
void navigator.storage?.persist?.();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </StrictMode>,
);
