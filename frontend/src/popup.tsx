import React from 'react';
import { createRoot } from 'react-dom/client';
import { Popup } from './components/Popup';
import './index.css';

createRoot(document.getElementById('popup-root')!).render(
  <React.StrictMode>
    <Popup />
  </React.StrictMode>,
);
