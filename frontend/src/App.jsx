/**
 * App.jsx — Root Application
 * ==========================
 * AI Expense Tracker
 *
 * Session persistence:
 *   - On mount, if a JWT exists in localStorage, calls GET /api/auth/me
 *     to rehydrate the user object. Server restart does NOT log the user out
 *     because the JWT is validated by signature, not server-side session.
 *   - If /me returns 401 (token truly expired), clears storage and shows login.
 *
 * Auth is Google-only. No email/password routes exist.
 */

import {
  createContext, useContext, useState, useEffect,
  useCallback, lazy, Suspense,
} from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';

import { tokenStorage, userStorage, logoutUser, getMe } from './services/api';
import Login from './pages/Login';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Reports   = lazy(() => import('./pages/Reports'));

// ── Auth Context ──────────────────────────────────────────────────────────────
export const AuthContext = createContext(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [token,   setToken]   = useState(() => tokenStorage.get());
  // true while the /me rehydration check is in flight on mount
  const [hydrating, setHydrating] = useState(true);

  const isAuthenticated = Boolean(token && user);

  // ── Rehydrate session on mount / after server restart ─────────────────────
  useEffect(() => {
    const storedToken = tokenStorage.get();
    if (!storedToken) {
      setHydrating(false);
      return;
    }
    // Token exists — validate it and get fresh user data from the server.
    // This works even after a server restart because JWT is stateless.
    getMe()
      .then(({ user: freshUser }) => {
        setUser(freshUser);
        userStorage.set(freshUser);
      })
      .catch(() => {
        // Token is expired or invalid — clear and send to login
        tokenStorage.remove();
        userStorage.remove();
        setToken(null);
      })
      .finally(() => setHydrating(false));
  }, []);

  const login = useCallback(({ access_token, user: userData }) => {
    tokenStorage.set(access_token);
    userStorage.set(userData);
    setToken(access_token);
    setUser(userData);
  }, []);

  const logout = useCallback(() => {
    logoutUser();
    setToken(null);
    setUser(null);
  }, []);

  // Sync logout across browser tabs
  useEffect(() => {
    function onStorage(e) {
      if (e.key === 'aiet_token' && !e.newValue) {
        setToken(null);
        setUser(null);
      }
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, isAuthenticated, hydrating, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// ── Protected route ───────────────────────────────────────────────────────────
function ProtectedRoute({ children }) {
  const { isAuthenticated, hydrating } = useAuth();
  const location = useLocation();

  // While rehydrating, render nothing (avoids flash-redirect to login)
  if (hydrating) return null;

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return children;
}

// ── Public route (redirect to dashboard if already authenticated) ─────────────
function PublicRoute({ children }) {
  const { isAuthenticated, hydrating } = useAuth();
  if (hydrating) return null;
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;
  return children;
}

function PageLoader() {
  return (
    <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center">
      <div className="relative w-10 h-10">
        <div className="absolute inset-0 rounded-full border-2 border-emerald-200" />
        <div className="absolute inset-0 rounded-full border-t-2 border-emerald-600 animate-spin" />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/login"     element={<PublicRoute><Login /></PublicRoute>} />
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/reports"   element={<ProtectedRoute><Reports /></ProtectedRoute>} />
            <Route path="/"          element={<Navigate to="/dashboard" replace />} />
            <Route path="*"          element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}