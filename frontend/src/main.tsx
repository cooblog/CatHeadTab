import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, MemoryRouter } from 'react-router-dom'
import App from './App.tsx'
import './index.css'

// Extension env cannot use BrowserRouter reliably for URLs like chrome-extension://
// So we check if we are in extension by looking at url protocol
const isExtension = window.location.protocol.includes('chrome-extension');

const Router = isExtension ? MemoryRouter : BrowserRouter;

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Router>
      <App />
    </Router>
  </React.StrictMode>,
)
