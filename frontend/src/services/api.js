/**
 * services/api.js — Centralised Axios API Client
 * ================================================
 * - Base URL auto-proxied via Vite dev server (/api → localhost:5000)
 * - Request interceptor auto-attaches JWT
 * - Response interceptor handles 401 (clears storage → login redirect)
 *
 * Exports:
 * loginUser(credentials)          → Promise<{ access_token, user }>
 * registerUser(payload)           → Promise<{ access_token, user }>
 * googleOAuthLogin(payload)       → Promise<{ access_token, user, sheet_created }>
 * submitExpense(payload)          → Promise<{ success, extracted_data, ... }>
 * linkSpreadsheet(id)             → Promise<{ spreadsheet_id }>
 * getHistory()                    → Promise<{ sheet_url, ... }>
 * logoutUser()                    → void  (clears local storage)
 */

import axios from 'axios';

// ── Storage keys ──────────────────────────────────────────────────────────────
const TOKEN_KEY = 'aiet_token';   // ai expense tracker token
const USER_KEY  = 'aiet_user';

export const tokenStorage = {
  get:    ()      => localStorage.getItem(TOKEN_KEY),
  set:    (token) => localStorage.setItem(TOKEN_KEY, token),
  remove: ()      => localStorage.removeItem(TOKEN_KEY),
};

export const userStorage = {
  get: () => {
    try { return JSON.parse(localStorage.getItem(USER_KEY)); }
    catch { return null; }
  },
  set:    (user) => localStorage.setItem(USER_KEY, JSON.stringify(user)),
  remove: ()     => localStorage.removeItem(USER_KEY),
};

// ── Axios instance ────────────────────────────────────────────────────────────
// Empty baseURL → uses Vite proxy (see vite.config.js) — no CORS in dev
const api = axios.create({
  baseURL: 'https://ai-expense-backend-u63c.onrender.com',
  timeout: 120000, // Isay 2 minute (120,000) kar diya hai
  headers: { 'Content-Type': 'application/json' },
});

// ── Request interceptor: attach Bearer token ──────────────────────────────────
api.interceptors.request.use(
  (config) => {
    const token = tokenStorage.get();
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error),
);

// ── Response interceptor: handle 401 ─────────────────────────────────────────
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      tokenStorage.remove();
      userStorage.remove();
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    const message =
      error.response?.data?.error  ||
      error.response?.data?.message ||
      error.message                 ||
      'An unexpected error occurred';
    return Promise.reject(new Error(message));
  },
);

// ── Auth endpoints ────────────────────────────────────────────────────────────

/**
 * Email/password login. Stores token + user automatically.
 */
export async function loginUser(credentials) {
  const { data } = await api.post('/api/auth/login', credentials);
  tokenStorage.set(data.access_token);
  userStorage.set(data.user);
  return data;
}

/**
 * Email/password signup. Stores token + user automatically.
 */
export async function registerUser(payload) {
  const { data } = await api.post('/api/auth/signup', payload);
  tokenStorage.set(data.access_token);
  userStorage.set(data.user);
  return data;
}

/**
 * Google OAuth 2.0 sign-in / sign-up.
 *
 * Called after the @react-oauth/google hook returns an auth code.
 * Sends { code, account_type } to the backend which:
 * - exchanges the code for tokens
 * - creates a Google Sheet in the user's Drive
 * - stores the refresh_token
 * - returns our app JWT
 *
 * @param {{ code: string, account_type: string }} payload
 */
export async function googleOAuthLogin(payload) {
  const { data } = await api.post('/api/auth/google', payload);
  tokenStorage.set(data.access_token);
  userStorage.set(data.user);
  return data;
}

/**
 * Clear session (stateless JWT — just clear local storage).
 */
export function logoutUser() {
  tokenStorage.remove();
  userStorage.remove();
}

// ── Expense endpoint ──────────────────────────────────────────────────────────

/**
 * Submit an expense for AI extraction and Google Sheets logging.
 *
 * @param {{ text_command: string, image_base64?: string|null, account_type: string }} payload
 */
export async function submitExpense({ text_command, image_base64 = null, account_type }) {
  const { data } = await api.post('/api/expenses/process-expense', {
    text_command,
    image_base64,
    account_type,
  });
  return data;
}

// ── Utility endpoints ─────────────────────────────────────────────────────────

export async function linkSpreadsheet(spreadsheetId) {
  const { data } = await api.patch('/api/auth/me/spreadsheet', {
    spreadsheet_id: spreadsheetId,
  });
  return data;
}

export async function getHistory() {
  const { data } = await api.get('/api/expenses/history');
  return data;
}

export async function getDashboardStats() {
  const { data } = await api.get('/api/expenses/stats');
  return data;
}


export async function getDashboardHistory() {
  const { data } = await api.get('/api/expenses/history');
  return data;
}

export async function saveBillingSetup(payload) {
  const { data } = await api.patch('/api/auth/me/settings', payload);
  return data;
}

export async function getMe() {
  const { data } = await api.get('/api/auth/me');
  return data;
}

export default api;