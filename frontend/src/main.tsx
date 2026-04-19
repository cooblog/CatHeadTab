import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import App from './App.tsx'
import './index.css'

// Extension env cannot use BrowserRouter reliably for URLs like chrome-extension://
// We use HashRouter instead of MemoryRouter to support direct linking to subpages 
// (e.g. index.html#/privacy) which is required for store submissions.
const isExtension = window.location.protocol.includes('chrome-extension');

const Router = isExtension ? HashRouter : BrowserRouter;

// If we land on privacy.html in an extension, ensure we show the privacy route
if (isExtension && window.location.pathname.endsWith('/privacy.html')) {
  if (!window.location.hash || window.location.hash === '#/') {
    window.location.hash = '#/privacy';
  }
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Router>
      <App />
    </Router>
  </React.StrictMode>,
)
