/**
 * pages/Dashboard.jsx — Fully Dynamic Real-Time Dashboard
 * ========================================================
 * AI Expense Tracker
 *
 * All stat cards and chart data come from the backend SQLite queries.
 * No fake/sample data anywhere.
 */

import { useState, useCallback, useEffect } from 'react';
import { useNavigate }                       from 'react-router-dom';
import {
  TrendingUp, TrendingDown, LogOut, Zap, ScanLine,
  BarChart2, ExternalLink, Link2, ChevronRight,
  Wallet, ArrowUpRight, ArrowDownRight, Layers,
  User, CheckCircle2, ReceiptText, AlertTriangle,
  Settings, Loader2, Calendar, DollarSign, RefreshCw,
} from 'lucide-react';

import { useAuth }             from '../App';
import {
  linkSpreadsheet,
  getDashboardStats,
  getDashboardHistory,
  saveBillingSetup,
}                              from '../services/api';
import QuickMode               from '../components/QuickMode';
import ReceiptMode             from '../components/ReceiptMode';
import ExpenseChart            from '../components/ExpenseChart';

// ── Role copy — labels and hints only, zero fake numbers ─────────────────────
const ROLE_COPY = {
  business: {
    greeting:    'Business Dashboard',
    subtitle:    'Track revenue, ad spend & operations in real time.',
    quickHint:   '"Paid 12,000 for Facebook ads this month"',
    receiptHint: '"Sourced 50 dropshipping units — inventory cost"',
    statLabels:  { income: 'Revenue', expense: 'Expenditure', net: 'Net Profit' },
    chartTitle:  'P&L — Last 6 Cycles',
    tips:        ['Sold 5 units for 7500 cash', 'Paid Facebook ads 15000', 'Received client payment 85000'],
    salaryLabel: 'Monthly Revenue Target',
  },
  household: {
    greeting:    'Household Tracker',
    subtitle:    "Stay on top of your family's income and expenses.",
    quickHint:   '"Bought groceries from Imtiaz — 2,800 rupees"',
    receiptHint: '"This is the electricity bill for this month"',
    statLabels:  { income: 'Income', expense: 'Spending', net: 'Savings' },
    chartTitle:  'Spending — Last 6 Cycles',
    tips:        ['Paid electricity 1800 rupees', 'Got salary 65000 today', 'Bought medicines 450'],
    salaryLabel: 'Monthly Salary',
  },
};

const fmt = (n) => {
  const abs = Math.abs(Number(n) || 0);
  if (abs >= 1_000_000) return `${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000)     return `${(abs / 1_000).toFixed(1)}k`;
  return abs.toLocaleString();
};

// ─────────────────────────────────────────────────────────────────────────────
//  Billing Setup Modal
// ─────────────────────────────────────────────────────────────────────────────
function BillingSetupModal({ accountType, onSaved }) {
  const role = ROLE_COPY[accountType] || ROLE_COPY.household;

  const [startDay,     setStartDay]     = useState('1');
  // Automatically default business accounts to variable income type
  const [incomeType,   setIncomeType]   = useState(accountType === 'business' ? 'variable' : 'fixed');
  const [salaryAmount, setSalaryAmount] = useState('');
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const day = parseInt(startDay, 10);
    if (isNaN(day) || day < 1 || day > 31) {
      setError('Enter a day between 1 and 31.'); return;
    }
    if (incomeType === 'fixed') {
      const sal = parseFloat(salaryAmount);
      if (isNaN(sal) || sal <= 0) { setError('Enter a valid salary amount.'); return; }
    }
    setLoading(true);
    try {
      await saveBillingSetup({
        billing_start_day:   day,
        billing_start_date:  day, // Both keys sent just to be 100% safe with backend
        income_type:         incomeType,
        fixed_salary_amount: incomeType === 'fixed' ? parseFloat(salaryAmount) : 0,
      });
      onSaved();
    } catch (err) {
      setError(err.message || 'Failed to save. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center
      bg-stone-900/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-dialog w-full max-w-md
        border border-stone-200 overflow-hidden">

        <div className="bg-emerald-600 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
              <Calendar size={18} className="text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Set Up Your Billing Cycle</h2>
              <p className="text-emerald-100 text-xs mt-0.5">Personalises your stats and charts</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Cycle Start Day (Visible to BOTH Business and Household) */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-stone-700">
              Cycle Start Day
            </label>
            <p className="text-xs text-stone-400">
              The day each month your billing cycle begins (e.g. your salary date).
            </p>
            <div className="flex items-center gap-3">
              <input type="number" min="1" max="31" value={startDay}
                onChange={(e) => setStartDay(e.target.value)}
                className="w-20 border border-stone-200 rounded-xl px-3 py-2.5 text-sm
                  font-bold text-stone-900 text-center outline-none
                  focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20" />
              <span className="text-sm text-stone-500">of each month</span>
            </div>
            <div className="flex gap-2 flex-wrap">
              {[1, 5, 10, 15, 25].map((d) => (
                <button key={d} type="button" onClick={() => setStartDay(String(d))}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all
                    ${startDay === String(d)
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-white text-stone-600 border-stone-200 hover:border-stone-300'
                    }`}>
                  {d}{['st','nd','rd'][d-1] || 'th'}
                </button>
              ))}
            </div>
          </div>

          {/* Income Type (HIDDEN for Business Accounts) */}
          {accountType !== 'business' && (
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-stone-700">Income Type</label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { value: 'fixed',    title: 'Fixed Salary',    desc: 'Auto-added on cycle start date', icon: DollarSign },
                  { value: 'variable', title: 'Variable / Daily',  desc: 'You log each income entry',       icon: TrendingUp },
                ].map(({ value, title, desc, icon: Icon }) => (
                  <button key={value} type="button" onClick={() => setIncomeType(value)}
                    className={`flex flex-col items-start gap-1.5 p-3.5 rounded-xl border-2 text-left
                      transition-all duration-150
                      ${incomeType === value
                        ? 'border-emerald-500 bg-emerald-50'
                        : 'border-stone-200 bg-white hover:border-stone-300'
                      }`}>
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center
                      ${incomeType === value ? 'bg-emerald-500 text-white' : 'bg-stone-100 text-stone-400'}`}>
                      <Icon size={14} />
                    </div>
                    <p className={`text-sm font-semibold
                      ${incomeType === value ? 'text-emerald-800' : 'text-stone-700'}`}>{title}</p>
                    <p className="text-[11px] text-stone-400 leading-relaxed">{desc}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Fixed Target Input (HIDDEN for Business Accounts) */}
          {accountType !== 'business' && incomeType === 'fixed' && (
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-stone-700">
                {role.salaryLabel} <span className="text-stone-400 font-normal">(PKR)</span>
              </label>
              <input type="number" min="1" value={salaryAmount}
                onChange={(e) => setSalaryAmount(e.target.value)}
                placeholder="e.g. 85000"
                className="w-full border border-stone-200 rounded-xl px-4 py-2.5 text-sm
                  text-stone-900 placeholder:text-stone-300 outline-none
                  focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20" />
              <p className="text-[11px] text-stone-400">
                Auto-logged as an Income entry on day {startDay || '?'} of each cycle.
              </p>
            </div>
          )}

          {error && (
            <p className="flex items-center gap-2 text-sm text-red-600 bg-red-50
              border border-red-200 rounded-xl px-4 py-3">
              <AlertTriangle size={14} className="flex-shrink-0" />{error}
            </p>
          )}

          <button type="submit" disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3
              bg-emerald-600 hover:bg-emerald-700 disabled:bg-stone-300
              text-white font-semibold rounded-xl text-sm
              transition-colors shadow-sm disabled:cursor-not-allowed">
            {loading
              ? <><Loader2 size={15} className="animate-spin" /> Saving…</>
              : 'Save & Launch Dashboard'
            }
          </button>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Stat Card
// ─────────────────────────────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, trend, accent, loading, overspent, badge }) {
  const base = {
    green:  'text-emerald-600 bg-emerald-50  border-emerald-200',
    red:    'text-red-500     bg-red-50      border-red-200',
    blue:   'text-blue-500    bg-blue-50     border-blue-200',
    danger: 'text-red-600     bg-red-100     border-red-300',
  };
  const iconClass = base[overspent ? 'danger' : accent];

  return (
    <div className={`bg-white border rounded-2xl p-5 flex flex-col gap-3
      shadow-xs transition-all duration-200 hover:shadow-sm relative
      ${overspent ? 'border-red-300 bg-red-50/20' : 'border-stone-200 hover:border-stone-300'}`}>
      <div className="flex items-start justify-between">
        <div className={`w-9 h-9 rounded-xl border flex items-center justify-center ${iconClass}`}>
          {overspent ? <AlertTriangle size={16} /> : <Icon size={16} />}
        </div>
        {badge && (
          <span className="text-[10px] font-bold px-2 py-0.5 bg-red-100 text-red-700
            border border-red-200 rounded-full">{badge}</span>
        )}
        {!badge && trend && !loading && (
          <div className={`flex items-center gap-0.5 text-xs font-semibold
            ${trend === 'up' ? 'text-emerald-600' : 'text-red-500'}`}>
            {trend === 'up' ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
          </div>
        )}
      </div>
      <div>
        {loading
          ? <div className="h-7 w-28 bg-stone-100 rounded-lg animate-pulse" />
          : <p className={`text-2xl font-bold tracking-tight
              ${overspent ? 'text-red-700' : 'text-stone-900'}`}>
              PKR {value}
            </p>
        }
        <p className="text-xs text-stone-400 font-medium mt-0.5 uppercase tracking-wider">{label}</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Spreadsheet Linker
// ─────────────────────────────────────────────────────────────────────────────
function SpreadsheetLinker({ current }) {
  const [open,    setOpen]    = useState(false);
  const [sheetId, setSheetId] = useState('');
  const [loading, setLoading] = useState(false);
  const [saved,   setSaved]   = useState(false);

  async function handleSave() {
    if (!sheetId.trim()) return;
    setLoading(true);
    try {
      await linkSpreadsheet(sheetId.trim());
      setSaved(true);
      setTimeout(() => { setSaved(false); setOpen(false); setSheetId(''); }, 1500);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  if (!open) return (
    <button onClick={() => setOpen(true)}
      className="flex items-center gap-1.5 px-3 py-1.5
        bg-white hover:bg-stone-50 border border-stone-200 hover:border-stone-300
        rounded-lg text-xs text-stone-500 hover:text-stone-700
        transition-all duration-150 font-medium shadow-xs">
      <Link2 size={12} />
      {current ? 'Sheet linked' : 'Link Sheet'}
      {current && <CheckCircle2 size={12} className="text-emerald-500" />}
    </button>
  );

  return (
    <div className="flex items-center gap-2">
      <input autoFocus value={sheetId} onChange={(e) => setSheetId(e.target.value)}
        placeholder="Paste Google Sheet ID…"
        className="text-xs bg-white border border-stone-200 focus:border-emerald-400
          rounded-lg px-3 py-1.5 text-stone-700 placeholder:text-stone-300 outline-none
          focus:ring-2 focus:ring-emerald-400/20 transition-all w-52"
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)} />
      <button onClick={handleSave} disabled={loading || !sheetId.trim()}
        className="text-xs px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white
          font-semibold rounded-lg disabled:opacity-50 transition-colors">
        {saved ? '✓' : loading ? '…' : 'Save'}
      </button>
      <button onClick={() => setOpen(false)}
        className="text-stone-400 hover:text-stone-600 transition-colors">
        <ChevronRight size={14} className="rotate-180" />
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Recent entry
// ─────────────────────────────────────────────────────────────────────────────
function RecentEntry({ entry }) {
  const isIncome = entry?.extracted_data?.type?.toLowerCase() === 'income';
  return (
    <div className="flex items-center gap-3 p-3 bg-stone-50 rounded-xl
      border border-stone-100 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0
        ${isIncome ? 'bg-emerald-100 text-emerald-600' : 'bg-red-50 text-red-500'}`}>
        {isIncome ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-stone-700 truncate">
          {entry?.extracted_data?.category || 'Uncategorised'}
        </p>
        <p className="text-xs text-stone-400 truncate">
          {entry?.extracted_data?.notes || '—'} · {entry?.sheet_tab || 'saved'}
        </p>
      </div>
      <p className={`text-sm font-bold flex-shrink-0
        ${isIncome ? 'text-emerald-600' : 'text-red-500'}`}>
        {isIncome ? '+' : '−'}PKR {Number(entry?.extracted_data?.amount || 0).toLocaleString()}
      </p>
    </div>
  );
}

function ModeTab({ active, onClick, icon: Icon, label, badge }) {
  return (
    <button onClick={onClick}
      className={`relative flex-1 flex items-center justify-center gap-2 py-2.5 px-4
        rounded-xl text-sm font-semibold transition-all duration-150
        ${active
          ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-200'
          : 'text-stone-500 hover:text-stone-700 hover:bg-stone-100'
        }`}>
      <Icon size={15} />
      {label}
      {badge && (
        <span className="absolute -top-1.5 -right-1.5 text-[10px] font-bold px-1.5 py-0.5
          rounded-full bg-amber-400 text-amber-900">{badge}</span>
      )}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Main Dashboard
// ─────────────────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate         = useNavigate();
  const accountType      = user?.account_type || 'household';
  const role             = ROLE_COPY[accountType] || ROLE_COPY.household;

  const [mode,           setMode]        = useState('quick');
  const [recentItems, setRecentItems] = useState([]);

  // ── Stats (current cycle) ──────────────────────────────────────────────
  const [stats,           setStats]        = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError,   setStatsError]   = useState('');

  // ── History (last 6 cycles for chart) ─────────────────────────────────
  const [chartData,    setChartData]    = useState([]);
  const [chartLoading, setChartLoading] = useState(true);

  // ── Setup modal ────────────────────────────────────────────────────────
  const [showSetup, setShowSetup] = useState(false);

  // TODO: Add state here later for Business-specific filters (e.g. Marketing, Shipping, Taxes)

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    setStatsError('');
    try {
      const data = await getDashboardStats();
      setStats(data);
      // Removed the old 'data.billing_configured' check from here completely
    } catch (err) {
      setStatsError(err.message || 'Failed to load stats.');
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    setChartLoading(true);
    try {
      const data = await getDashboardHistory();
      // Added safety check for multiple formats
      setChartData(
        (data.history || data.cycles || []).map((c) => ({
          month: c.cycle || c.label || c.month,
          income: c.income || 0,
          expense: c.expense || 0
        }))
      );
    } catch {
      // chart failing silently is acceptable
    } finally {
      setChartLoading(false);
    }
  }, []);

  useEffect(() => {
    // robust check so it never loops if data is genuinely missing
    if (user) {
      const hasSetup = user.billing_start_day || user.billing_start_date || user.income_type;
      if (!hasSetup) {
        setShowSetup(true);
      }
    }
    fetchStats();
    fetchHistory();
  }, [user, fetchStats, fetchHistory]);

  const handleSuccess = useCallback((response) => {
    setRecentItems((prev) => [response, ...prev].slice(0, 5));
    // Refresh stats immediately so totals update without a page reload
    fetchStats();
    fetchHistory();
  }, [fetchStats, fetchHistory]);

  const handleSetupSaved = useCallback(() => {
    setShowSetup(false);
    // Force hard reload so AuthContext refetches the fresh user object
    window.location.reload();
  }, []);

  const handleLogout = () => { logout(); navigate('/login', { replace: true }); };

  // Derived calculations
  const income   = stats?.income    ?? 0;
  const expense  = stats?.expense   ?? 0;
  const net      = stats?.net       ?? 0;
  const overspent = expense > income;

  return (
    <div className="min-h-screen bg-[#F9FAFB] text-stone-900 flex flex-col font-sans">

      {/* Billing setup modal — blocks until configured */}
      {showSetup && (
        <BillingSetupModal accountType={accountType} onSaved={handleSetupSaved} />
      )}

      {/* ── Navigation ────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md
        border-b border-stone-200 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3
          flex items-center justify-between gap-4">

          {/* Logo */}
          <div className="flex items-center gap-2.5 flex-shrink-0">
            <div className="w-8 h-8 rounded-xl bg-emerald-600 flex items-center justify-center shadow-sm">
              <ReceiptText size={16} className="text-white" />
            </div>
            <div className="hidden sm:block">
              <p className="text-sm font-bold text-stone-900 leading-none tracking-tight">
                AI Expense Tracker
              </p>
              <p className="text-[10px] text-stone-400 mt-0.5 capitalize">{accountType} account</p>
            </div>
          </div>

          {/* Sheet linker */}
          <div className="flex-1 flex items-center justify-center">
            <SpreadsheetLinker current={user?.spreadsheet_id || user?.google_sheet_id} />
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5
              bg-stone-50 border border-stone-200 rounded-lg">
              <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center">
                <User size={12} className="text-emerald-600" />
              </div>
              <p className="text-xs font-semibold text-stone-700">
                {user?.username || 'User'}
              </p>
            </div>

            {/* Re-open billing settings */}
            <button onClick={() => setShowSetup(true)}
              className="w-9 h-9 rounded-xl bg-white border border-stone-200 flex items-center
                justify-center text-stone-400 hover:text-stone-700 hover:border-stone-300
                transition-all shadow-xs"
              title="Billing Settings">
              <Settings size={15} />
            </button>

            <button onClick={() => navigate('/reports')}
              className="w-9 h-9 rounded-xl bg-white border border-stone-200 flex items-center
                justify-center text-stone-400 hover:text-stone-700 hover:border-stone-300
                transition-all shadow-xs"
              title="Reports">
              <BarChart2 size={16} />
            </button>

            <button onClick={handleLogout}
              className="w-9 h-9 rounded-xl bg-white border border-stone-200 flex items-center
                justify-center text-stone-400 hover:text-red-500 hover:border-red-200
                transition-all shadow-xs"
              title="Logout">
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </header>

      {/* ── Main ──────────────────────────────────────────────────────────── */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-8 space-y-6">

        {/* Heading */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-stone-900">{role.greeting}</h1>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <p className="text-sm text-stone-400">{role.subtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {statsError && (
              <p className="text-xs text-red-500 flex items-center gap-1">
                <AlertTriangle size={12} />{statsError}
              </p>
            )}
            <button onClick={() => { fetchStats(); fetchHistory(); }} disabled={statsLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-stone-500
                hover:text-stone-700 bg-white border border-stone-200 rounded-lg
                hover:border-stone-300 transition-all shadow-xs disabled:opacity-50">
              <RefreshCw size={12} className={statsLoading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        {/* ── Stat cards ────────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-4">
          <StatCard
            label={role.statLabels.income}
            value={fmt(income)}
            icon={TrendingUp}
            accent="green"
            trend="up"
            loading={statsLoading}
          />
          <StatCard
            label={role.statLabels.expense}
            value={fmt(expense)}
            icon={TrendingDown}
            accent="red"
            trend="down"
            loading={statsLoading}
          />
          <StatCard
            label={role.statLabels.net}
            value={fmt(Math.abs(net))}
            icon={Wallet}
            accent={overspent ? 'danger' : 'blue'}
            trend={overspent ? 'down' : 'up'}
            overspent={overspent}
            badge={overspent ? 'Overspent' : undefined}
            loading={statsLoading}
          />
        </div>

        {/* Overspend warning */}
        {!statsLoading && overspent && (
          <div className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200
            rounded-xl text-sm text-red-700">
            <AlertTriangle size={16} className="flex-shrink-0 text-red-500" />
            <span>
              <strong>Overspent this cycle.</strong> Expenses (PKR {fmt(expense)}) exceed
              income (PKR {fmt(income)}) by PKR {fmt(Math.abs(net))}.
            </span>
          </div>
        )}

        {/* ── Main grid ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

          {/* Left: entry panel */}
          <div className="lg:col-span-3 space-y-4">
            <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-xs">
              <div className="flex gap-2 p-3.5 bg-stone-50 border-b border-stone-200">
                <ModeTab active={mode === 'quick'} onClick={() => setMode('quick')}
                  icon={Zap} label="Quick Entry" badge="Fast" />
                <ModeTab active={mode === 'receipt'} onClick={() => setMode('receipt')}
                  icon={ScanLine} label="Receipt Scan" />
              </div>
              <div className="px-5 pt-4 pb-1">
                <p className="text-xs text-stone-400 italic">
                  Try: {mode === 'quick' ? role.quickHint : role.receiptHint}
                </p>
              </div>
              <div className="p-5">
                {mode === 'quick'
                  ? <QuickMode accountType={accountType} onSuccess={handleSuccess} />
                  : <ReceiptMode accountType={accountType} onSuccess={handleSuccess} />
                }
              </div>
            </div>

            {/* Session live feed */}
            {recentItems.length > 0 && (
              <div className="bg-white border border-stone-200 rounded-2xl p-4 space-y-3 shadow-xs">
                <div className="flex items-center gap-2">
                  <Layers size={14} className="text-stone-400" />
                  <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
                    Session Entries
                  </p>
                  <span className="ml-auto text-xs text-stone-400">
                    {recentItems.length} recorded
                  </span>
                </div>
                <div className="space-y-2">
                  {recentItems.map((item, i) => <RecentEntry key={i} entry={item} />)}
                </div>
              </div>
            )}
          </div>

          {/* Right: chart + tips */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-xs">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <p className="text-xs font-bold text-stone-500 uppercase tracking-wider">
                    {role.chartTitle}
                  </p>
                  <p className="text-xs text-stone-400 mt-0.5">
                    {chartData.length > 0
                      ? `${chartData[0].month} → ${chartData[chartData.length - 1].month}`
                      : 'Loading…'}
                  </p>
                </div>
                <button onClick={() => navigate('/reports')}
                  className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700
                    font-semibold transition-colors">
                  Full Report <ExternalLink size={11} />
                </button>
              </div>

              {chartLoading ? (
                <div className="h-44 flex items-center justify-center">
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 size={20} className="animate-spin text-stone-300" />
                    <p className="text-xs text-stone-400">Loading chart…</p>
                  </div>
                </div>
              ) : chartData.length === 0 ? (
                <div className="h-44 flex items-center justify-center">
                  <p className="text-xs text-stone-400 text-center leading-relaxed">
                    No data yet.<br />Add your first entry to see the chart.
                  </p>
                </div>
              ) : (
                <ExpenseChart data={chartData} compact />
              )}
            </div>

            {/* Current cycle summary */}
            {user && !statsLoading && (
              <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-xs">
                <p className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-3">
                  This Cycle
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Cycle Start', value: `${user.billing_start_day || user.billing_start_date || 1}th of month` },
                    { label: 'Income type', value: user.income_type === 'fixed' ? 'Fixed' : 'Variable' },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-stone-50 rounded-xl p-3 border border-stone-100">
                      <p className="text-xs text-stone-400 font-medium">{label}</p>
                      <p className="text-sm font-bold text-stone-800 mt-0.5 capitalize">{value}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Voice tips */}
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5">
              <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-3">
                Voice Commands
              </p>
              <ul className="space-y-2.5">
                {role.tips.map((tip) => (
                  <li key={tip} className="flex items-start gap-2 text-xs text-emerald-800">
                    <span className="text-emerald-400 mt-0.5 flex-shrink-0 font-bold">›</span>
                    <span className="italic">"{tip}"</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-stone-200 py-4 mt-2">
        <p className="text-center text-xs text-stone-400">
          AI Expense Tracker · Your data lives in your own Google Sheet
        </p>
      </footer>
    </div>
  );
}