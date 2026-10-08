import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './index.css';
import { queryClient } from './queries/queryClient';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('The application root element is missing.');

const root: Root = createRoot(rootElement);

root.render(
  <main className="startup-screen" role="status" aria-live="polite">
    <span className="game-brand">PIRATE <strong>BATTLE</strong></span>
    <p>Preparing your voyage…</p>
  </main>,
);

async function startApp() {
  if (import.meta.env.VITE_ENABLE_MOCKS !== 'false') {
    try {
      const { worker } = await import('./mocks/browser');
      const started = worker.start({ quiet: true, onUnhandledFrame: 'bypass' });
      started.catch((error: unknown) => console.warn('MSW could not start.', error));
      await Promise.race([started, new Promise<void>((resolve) => window.setTimeout(resolve, 1500))]);
    } catch (error) {
      console.warn('Mock APIs could not start; the local game remains available.', error);
    }
  }

  root.render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </StrictMode>,
  );
}

void startApp();