// Entry for the static GitHub Pages build. The page is a single client
// component, so it mounts straight into the DOM — no server runtime involved.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../app/globals.css';
import Home from '../app/page';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Home />
  </StrictMode>,
);
