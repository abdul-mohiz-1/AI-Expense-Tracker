/**
 * pages/Login.jsx — Google-only Authentication
 * =============================================
 * AI Expense Tracker
 *
 * Single "Continue with Google" flow.
 * Account type selection appears before the button for new users
 * (existing users keep their stored account_type — backend ignores
 * the payload field for known emails).
 */

import { useState, useEffect }   from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useGoogleLogin }         from '@react-oauth/google';
import {
  Loader2, AlertCircle, ReceiptText,
  Home, Briefcase, ShieldCheck, Zap, BarChart3,
} from 'lucide-react';

import { googleOAuthLogin } from '../services/api';
import { useAuth }          from '../App';

// ── Official Google "G" logo ──────────────────────────────────────────────────
function GoogleLogo({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908C16.657 14.013 17.64 11.705 17.64 9.2z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.96L3.964 7.292C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}

const FEATURES = [
  { icon: Zap,        text: 'Voice command entry in seconds'     },
  { icon: ReceiptText,text: 'AI-powered receipt scanning'        },
  { icon: BarChart3,  text: 'Automatic categorisation & charts'  },
  { icon: ShieldCheck,text: 'Logged to your own Google Sheet'    },
];

export default function Login() {
  const navigate   = useNavigate();
  const location   = useLocation();
  const { login }  = useAuth();

  const redirectTo = location.state?.from?.pathname || '/dashboard';

  const [accountType,    setAccountType]    = useState('household');
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState('');

  // ── Google OAuth trigger ──────────────────────────────────────────────────
  const triggerGoogle = useGoogleLogin({
    onSuccess: async (codeResponse) => {
      setLoading(true);
      setError('');
      try {
        const data = await googleOAuthLogin({
          code:         codeResponse.code,
          account_type: accountType,
        });
        login(data);
        navigate(redirectTo, { replace: true });
      } catch (err) {
        setError(err.message || 'Google sign-in failed. Please try again.');
      } finally {
        setLoading(false);
      }
    },
    onError: () => setError('Google sign-in was cancelled or failed.'),
    flow:        'auth-code',
    access_type: 'offline',
    prompt:      'consent',
    scope: [
      'openid', 'email', 'profile',
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.file',
    ].join(' '),
  });

  return (
    <div className="min-h-screen bg-[#F9FAFB] flex flex-col lg:flex-row font-sans">

      {/* ── Left panel ───────────────────────────────────────────────────── */}
      <div className="relative lg:w-[44%] bg-emerald-700 flex flex-col justify-between
        p-10 lg:p-14 overflow-hidden min-h-[200px] lg:min-h-screen border-r border-emerald-800">

        {/* Subtle dot pattern */}
        <div className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: 'radial-gradient(circle, #fff 1.5px, transparent 1.5px)',
            backgroundSize:  '26px 26px',
          }}
        />
        {/* Ambient glows */}
        <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full bg-emerald-500/25 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-72 h-72 rounded-full bg-teal-600/15 blur-3xl" />

        {/* Logo */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white/15 border border-white/20
            flex items-center justify-center">
            <ReceiptText size={18} className="text-white" />
          </div>
          <div>
            <p className="text-white font-bold text-sm tracking-tight leading-none">
              AI Expense Tracker
            </p>
            <p className="text-emerald-300 text-[10px] font-medium mt-0.5">
              Smart financial logging
            </p>
          </div>
        </div>

        {/* Copy */}
        <div className="relative z-10 my-auto">
          <h2 className="text-3xl lg:text-4xl font-black text-white leading-[1.1]
            tracking-tight mb-5">
            Track every rupee.<br />
            <span className="text-emerald-200">Effortlessly.</span>
          </h2>
          <p className="text-emerald-100/80 text-sm leading-relaxed mb-10 max-w-xs">
            Speak a command or snap a receipt. AI extracts the details and
            logs everything straight to your Google Sheet — instantly.
          </p>
          <ul className="space-y-3">
            {FEATURES.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-white/10 border border-white/15
                  flex items-center justify-center flex-shrink-0">
                  <Icon size={13} className="text-emerald-200" />
                </div>
                <span className="text-sm text-emerald-100/90">{text}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative z-10 text-emerald-300/50 text-xs hidden lg:block">
          Your data lives in your own Google Drive. Always.
        </p>
      </div>

      {/* ── Right panel ──────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col justify-center items-center px-6 py-12 lg:p-16">
        <div className="w-full max-w-[380px]">

          {/* Heading */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-stone-900 tracking-tight">
              Sign in to get started
            </h1>
            <p className="text-sm text-stone-500 mt-1.5">
              One click with your Google account. No password needed.
            </p>
          </div>

          {/* Account type selector */}
          <div className="mb-6">
            <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-3">
              I'm tracking…
            </p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { value: 'household', label: 'Personal / Family', icon: Home,      desc: 'Groceries, bills, rent' },
                { value: 'business',  label: 'Business',          icon: Briefcase, desc: 'Marketing, salaries, P&L' },
              ].map(({ value, label, icon: Icon, desc }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setAccountType(value)}
                  className={`flex flex-col items-start gap-1.5 p-4 rounded-xl border-2 text-left
                    transition-all duration-150
                    ${accountType === value
                      ? 'border-emerald-500 bg-emerald-50 shadow-sm'
                      : 'border-stone-200 bg-white hover:border-stone-300'
                    }`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center
                    ${accountType === value
                      ? 'bg-emerald-500 text-white'
                      : 'bg-stone-100 text-stone-400'
                    }`}>
                    <Icon size={16} />
                  </div>
                  <p className={`text-sm font-semibold leading-tight
                    ${accountType === value ? 'text-emerald-800' : 'text-stone-700'}`}>
                    {label}
                  </p>
                  <p className="text-[11px] text-stone-400">{desc}</p>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-stone-400 mt-2">
              Already have an account? This selection is ignored — your existing settings are preserved.
            </p>
          </div>

          {/* Google button */}
          <button
            type="button"
            onClick={() => triggerGoogle()}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 py-3.5 px-6
              bg-white border-2 border-stone-200 hover:border-stone-300 hover:bg-stone-50
              rounded-xl text-sm font-semibold text-stone-800
              transition-all duration-150 shadow-sm hover:shadow
              disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading
              ? <><Loader2 size={17} className="animate-spin text-stone-400" /> Connecting…</>
              : <><GoogleLogo size={20} /> Continue with Google</>
            }
          </button>

          {/* Error */}
          {error && (
            <div className="mt-4 flex items-start gap-2 p-3 bg-red-50 border border-red-200
              rounded-xl text-red-600 text-sm">
              <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <p className="text-center text-xs text-stone-400 mt-6">
            Your data is stored in your own Google Sheet.<br />
            We never sell it or access it without your permission.
          </p>
        </div>
      </div>
    </div>
  );
}