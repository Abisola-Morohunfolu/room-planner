import { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { SyncProvider } from './sync/SyncContext';
import { AccountProvider } from './auth/AccountContext';
import '@fontsource-variable/dm-sans/wght.css';
import '@fontsource/libre-caslon-display/latin-400.css';
import './styles.css';
const LandingPage = lazy(() => import('./pages/LandingPage'));
const ProjectsPage = lazy(() => import('./pages/ProjectsPage'));
const EditorPage = lazy(() => import('./pages/EditorPage'));
const SignInPage = lazy(() => import('./pages/SignInPage'));
createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <AccountProvider>
      <SyncProvider>
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
            <Route path="/sign-in" element={<SignInPage />} />
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
      </SyncProvider>
    </AccountProvider>
  </BrowserRouter>,
);
