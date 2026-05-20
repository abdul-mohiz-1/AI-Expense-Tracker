/**
 * main.jsx — React 18 entry point
 * AI Expense Tracker
 *
 * Wraps the app with GoogleOAuthProvider so any component can call
 * useGoogleLogin() without additional setup.
 *
 * VITE_GOOGLE_CLIENT_ID must be set in .env (same client ID used by the backend).
 */

import { StrictMode }        from 'react';
import { createRoot }         from 'react-dom/client';
import { GoogleOAuthProvider } from '@react-oauth/google';
import './index.css';
import App from './App.jsx';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

if (!GOOGLE_CLIENT_ID) {
  console.warn(
    '[AI Expense Tracker] VITE_GOOGLE_CLIENT_ID is not set. ' +
    'Google OAuth will not work. Add it to your .env file.'
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <App />
    </GoogleOAuthProvider>
  </StrictMode>,
);