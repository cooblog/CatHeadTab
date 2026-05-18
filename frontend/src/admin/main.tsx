import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AdminDashboardApp } from './AdminDashboard';
import '../index.css';
import './admin.css';

createRoot(document.getElementById('admin-root')!).render(
  <StrictMode>
    <AdminDashboardApp />
  </StrictMode>,
);
