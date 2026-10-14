import { createRoot } from 'react-dom/client';
import '@fontsource/baloo-2/500.css';
import '@fontsource/baloo-2/700.css';
import '@fontsource/baloo-2/800.css';
import './ui/styles.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  // No StrictMode: its double-mount would create two WebGL engines on one canvas.
  <App />,
);
