import { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import '@fontsource-variable/dm-sans/wght.css';
import '@fontsource/libre-caslon-display/latin-400.css';
import './styles.css';
const LandingPage = lazy(() => import('./pages/LandingPage'));
const ProjectsPage = lazy(() => import('./pages/ProjectsPage'));
const EditorPage = lazy(() => import('./pages/EditorPage'));
createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <Suspense
      fallback={
        <div className="empty-state" role="status">
          Opening Room Planner…
        </div>
      }
    >
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/plan/:projectId" element={<EditorPage />} />
        <Route path="/sign-in" element={<Navigate to="/projects" replace />} />
        <Route
          path="*"
          element={
            <div className="empty-state">
              <h1>This room hasn’t been planned.</h1>
              <a href="/projects">Go to your rooms</a>
            </div>
          }
        />
      </Routes>
    </Suspense>
  </BrowserRouter>,
);
