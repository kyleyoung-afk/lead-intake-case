import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom';
import FormPage from './FormPage.jsx';
import LogsPage from './LogsPage.jsx';
import './styles.css';

function Shell() {
  return (
    <div className="shell">
      <header className="topbar">
        <span className="brand">Lead Intake</span>
        <nav>
          <NavLink to="/" end>Form</NavLink>
          <NavLink to="/logs">Logs</NavLink>
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<FormPage />} />
          <Route path="/logs" element={<LogsPage />} />
          <Route path="*" element={<p className="muted">Page not found.</p>} />
        </Routes>
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Shell />
    </BrowserRouter>
  </StrictMode>,
);
