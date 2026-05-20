/**
 * pages/Reports.jsx — Reports & Analytics Page
 * =============================================
 * Full P&L breakdown with chart toggle, monthly drilldown, and sheet link.
 * NOW FULLY DYNAMIC & CONNECTED TO BACKEND! 🚀
 */

import { useState, useEffect } from 'react';
import { useNavigate }         from 'react-router-dom';
import {
  ArrowLeft, TrendingUp, TrendingDown,
  ExternalLink, BarChart2, Calendar, Loader2
} from 'lucide-react';
import { useAuth }             from '../App';
import ExpenseChart            from '../components/ExpenseChart';
import { getDashboardHistory } from '../services/api';

export default function Reports() {
  const navigate    = useNavigate();
  const { user }    = useAuth();
  const accountType = user?.account_type || 'household';
  
  const [data, setData]       = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch real data from backend
  useEffect(() => {
    async function fetchReportsData() {
      try {
        setLoading(true);
        const res = await getDashboardHistory();
        
        // Map backend history data for the chart and table
        const mappedData = (res.history || res.cycles || []).map((c) => ({
          month: c.cycle || c.label || c.month,
          income: c.income || 0,
          expense: c.expense || 0
        }));
        
        setData(mappedData);
      } catch (error) {
        console.error("Failed to fetch reports data:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchReportsData();
  }, []);

  // Calculations based on REAL data
  const totalIncome  = data.reduce((s, r) => s + r.income,  0);
  const totalExpense = data.reduce((s, r) => s + r.expense, 0);
  const net          = totalIncome - totalExpense;

  // Dynamic Date Range Text
  const dateRangeText = data.length > 0 
    ? `${data[0].month} – ${data[data.length - 1].month} ${new Date().getFullYear()}`
    : 'Local Database History';

  // Get correct Google Sheet ID
  const sheetId = user?.google_sheet_id || user?.spreadsheet_id;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-4">
          <button
            onClick={() => navigate('/dashboard')}
            className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center
              justify-center text-slate-400 hover:text-slate-200 transition-colors"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="text-base font-black text-white">Reports & Analytics</h1>
            <p className="text-xs text-slate-500 capitalize">{accountType} account · All Time View</p>
          </div>
          {sheetId && (
            <a
              href={`https://docs.google.com/spreadsheets/d/${sheetId}`}
              target="_blank"
              rel="noreferrer"
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border
                border-emerald-500/30 rounded-xl text-xs text-emerald-400 font-semibold
                hover:bg-emerald-500/20 transition-colors"
            >
              <ExternalLink size={12} />
              Open Google Sheet
            </a>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        
        {/* Loading State Overlay */}
        {loading && (
          <div className="flex items-center justify-center p-6 bg-slate-900 border border-slate-800 rounded-2xl">
            <Loader2 className="animate-spin text-emerald-500 mr-2" size={20} />
            <span className="text-sm font-semibold text-slate-400">Loading your real reports...</span>
          </div>
        )}

        {!loading && (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Total Income',  value: totalIncome,  icon: TrendingUp,   color: 'emerald' },
                { label: 'Total Expense', value: totalExpense, icon: TrendingDown,  color: 'red'     },
                { label: 'Net',           value: net,          icon: BarChart2,     color: 'blue'    },
              ].map(({ label, value, icon: Icon, color }) => (
                <div key={label} className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                  <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-2">{label}</p>
                  <p className={`text-xl font-black
                    ${color === 'emerald' ? 'text-emerald-400' : color === 'red' ? 'text-red-400' : 'text-blue-400'}`}>
                    PKR {value.toLocaleString()}
                  </p>
                </div>
              ))}
            </div>

            {/* Chart */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <p className="text-sm font-black text-white">Income vs Expenditure</p>
                  <p className="text-xs text-slate-500 mt-0.5">{dateRangeText}</p>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Calendar size={12} />
                  Monthly Aggregation
                </div>
              </div>
              
              {data.length > 0 ? (
                <ExpenseChart data={data} />
              ) : (
                <div className="h-64 flex items-center justify-center text-slate-500 text-sm">
                  No data available yet. Add entries to see your chart!
                </div>
              )}
            </div>

            {/* Monthly breakdown table */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-800">
                <p className="text-sm font-black text-white">Monthly Breakdown</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-800">
                      {['Month', 'Income', 'Expense', 'Net', 'Margin'].map((h) => (
                        <th key={h} className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.length === 0 && (
                      <tr>
                        <td colSpan="5" className="px-6 py-8 text-center text-slate-500">
                          No transactions found in your database.
                        </td>
                      </tr>
                    )}
                    {data.map((row, i) => {
                      const rowNet    = row.income - row.expense;
                      const margin    = row.income > 0 ? ((rowNet / row.income) * 100).toFixed(1) : 0;
                      const isProfit  = rowNet >= 0;
                      return (
                        <tr key={row.month} className={`border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors
                          ${i % 2 === 0 ? '' : 'bg-slate-800/10'}`}>
                          <td className="px-6 py-4 font-semibold text-slate-200">{row.month}</td>
                          <td className="px-6 py-4 text-emerald-400 font-semibold">{row.income.toLocaleString()}</td>
                          <td className="px-6 py-4 text-red-400 font-semibold">{row.expense.toLocaleString()}</td>
                          <td className={`px-6 py-4 font-black ${isProfit ? 'text-emerald-300' : 'text-red-300'}`}>
                            {isProfit ? '+' : ''}{rowNet.toLocaleString()}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-2.5 py-1 rounded-full text-xs font-bold
                              ${isProfit ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
                              {margin}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}