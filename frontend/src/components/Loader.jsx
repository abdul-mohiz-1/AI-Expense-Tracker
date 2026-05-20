/**
 * components/Loader.jsx — Reusable Loading Components
 * =====================================================
 * Exports:
 *   <SpinnerOverlay />         Full-screen processing overlay with status text
 *   <PulseLoader />            Inline 3-dot pulse animation
 *   <SkeletonCard />           Placeholder card skeleton
 *   <AIProcessingLoader />     Animated AI pipeline status steps
 */

// ── Spinner Overlay ────────────────────────────────────────────────────────────
export function SpinnerOverlay({ message = 'Processing…', sub = '' }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-5 p-8 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl max-w-xs w-full mx-4">
        {/* Rings */}
        <div className="relative w-16 h-16">
          <div className="absolute inset-0 rounded-full border-2 border-emerald-500/10" />
          <div className="absolute inset-0 rounded-full border-t-2 border-emerald-400 animate-spin" />
          <div className="absolute inset-2 rounded-full border-2 border-teal-500/20" />
          <div
            className="absolute inset-2 rounded-full border-t-2 border-teal-300 animate-spin"
            style={{ animationDirection: 'reverse', animationDuration: '0.8s' }}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          </div>
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-slate-200">{message}</p>
          {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
        </div>
      </div>
    </div>
  );
}

// ── Pulse Loader ───────────────────────────────────────────────────────────────
export function PulseLoader({ size = 'md', color = 'emerald' }) {
  const dotSize = size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2';
  const colorClass = color === 'emerald' ? 'bg-emerald-400' : 'bg-slate-400';
  return (
    <span className="inline-flex items-center gap-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={`${dotSize} ${colorClass} rounded-full animate-bounce`}
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
}

// ── Skeleton Card ──────────────────────────────────────────────────────────────
export function SkeletonCard() {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 animate-pulse">
      <div className="flex items-center justify-between mb-4">
        <div className="w-8 h-8 rounded-lg bg-slate-800" />
        <div className="w-16 h-4 rounded bg-slate-800" />
      </div>
      <div className="w-24 h-7 rounded bg-slate-800 mb-2" />
      <div className="w-32 h-3 rounded bg-slate-800" />
    </div>
  );
}

// ── AI Processing Loader ───────────────────────────────────────────────────────
/**
 * Shows animated pipeline steps matching the backend's AI routing.
 * Steps animate in sequence with a stagger.
 *
 * @param {{ steps: string[], activeStep: number }} props
 */
export function AIProcessingLoader({ steps = [], activeStep = 0 }) {
  const defaultSteps = [
    'Parsing your command…',
    'Routing to AI engine…',
    'Extracting transaction data…',
    'Writing to Google Sheets…',
  ];
  const displaySteps = steps.length ? steps : defaultSteps;

  return (
    <div className="flex flex-col gap-2 w-full">
      {displaySteps.map((step, i) => {
        const isDone    = i < activeStep;
        const isActive  = i === activeStep;
        const isPending = i > activeStep;

        return (
          <div
            key={step}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-500
              ${isActive  ? 'bg-emerald-500/10 border-emerald-500/40 shadow-sm shadow-emerald-500/10' : ''}
              ${isDone    ? 'bg-slate-800/50 border-slate-700/50' : ''}
              ${isPending ? 'bg-slate-900/30 border-slate-800/30 opacity-40' : ''}
            `}
          >
            {/* Step indicator */}
            <div className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center
              ${isActive  ? 'bg-emerald-500/20' : ''}
              ${isDone    ? 'bg-emerald-500'    : ''}
              ${isPending ? 'bg-slate-800'      : ''}
            `}>
              {isDone && (
                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
              {isActive && (
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              )}
              {isPending && (
                <div className="w-1.5 h-1.5 rounded-full bg-slate-600" />
              )}
            </div>
            <span className={`text-xs font-medium
              ${isActive  ? 'text-emerald-300' : ''}
              ${isDone    ? 'text-slate-400'   : ''}
              ${isPending ? 'text-slate-600'   : ''}
            `}>
              {step}
            </span>
            {isActive && (
              <PulseLoader size="sm" color="emerald" />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Default export (most common use case) ─────────────────────────────────────
export default SpinnerOverlay;