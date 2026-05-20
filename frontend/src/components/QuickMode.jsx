/**
 * components/QuickMode.jsx — Quick Text/Voice Entry Mode
 * =======================================================
 * Mode B: No image. User types or speaks a command.
 * Sends text_command only → backend routes to Groq Text (llama-3.1-8b-instant).
 *
 * Features:
 *  - Textarea with dynamic placeholder based on account_type role
 *  - "Hold to Speak" mic button (pointerdown/up for hold behaviour)
 *  - Live interim transcript display while listening
 *  - Submit → AIProcessingLoader steps → success card with TTS feedback
 */

import { useState, useRef, useCallback } from 'react';
import {
  Mic, MicOff, Send, Zap, CheckCircle2,
  AlertCircle, RotateCcw, TrendingUp, TrendingDown,
} from 'lucide-react';

import { submitExpense }        from '../services/api';
import { startListening, stopListening, speechErrorMessages, isSpeechSupported } from '../utils/speechToText';
import { speak, ttsMessages }   from '../utils/textToSpeech';
import { AIProcessingLoader }   from './Loader';

// ── Role-aware placeholder examples ──────────────────────────────────────────
const PLACEHOLDERS = {
  business: [
    'Sold 3 Arfa Closet kid suits for 4500 cash',
    'Paid 12000 for Facebook ads this month',
    'Received 85000 salary from client ABC',
    'Bought raw materials worth 7500 from supplier',
    'Office electricity bill paid 3200',
  ],
  household: [
    'Bought groceries from Imtiaz for 2800',
    'Paid rent 25000 for this month',
    'Electricity bill 1800 rupees',
    'Dinner at Kolachi restaurant 3500',
    'Kids school fee 12000 paid',
  ],
};

function getPlaceholder(accountType) {
  const list = PLACEHOLDERS[accountType] || PLACEHOLDERS.household;
  return `e.g. "${list[Math.floor(Math.random() * list.length)]}"`;
}

// ── Result card ────────────────────────────────────────────────────────────────
function ResultCard({ data, onReset }) {
  const isIncome = data.type?.toLowerCase() === 'income';

  return (
    <div className="space-y-4">
      {/* Success banner */}
      <div className="flex items-center gap-3 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
        <CheckCircle2 className="text-emerald-400 flex-shrink-0" size={20} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-emerald-300">Saved to Google Sheets</p>
          <p className="text-xs text-slate-400 truncate">Tab: {data.sheet_tab} · via {data.provider_used}</p>
        </div>
      </div>

      {/* Extracted data grid */}
      <div className="grid grid-cols-2 gap-3">
        {/* Amount */}
        <div className="col-span-2 flex items-center justify-between p-4 bg-slate-800/60 rounded-xl border border-slate-700">
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider font-medium">Amount</p>
            <p className="text-2xl font-black text-white mt-1">
              {data.extracted_data?.currency || 'PKR'}{' '}
              {Number(data.extracted_data?.amount || 0).toLocaleString()}
            </p>
          </div>
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold
            ${isIncome
              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
              : 'bg-red-500/15 text-red-400 border border-red-500/30'
            }`}>
            {isIncome ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
            {data.extracted_data?.type || 'Expense'}
          </div>
        </div>

        {[
          { label: 'Category', value: data.extracted_data?.category },
          { label: 'Date',     value: data.extracted_data?.date     },
        ].map(({ label, value }) => (
          <div key={label} className="p-3 bg-slate-800/40 rounded-xl border border-slate-700/60">
            <p className="text-xs text-slate-500 uppercase tracking-wider font-medium mb-1">{label}</p>
            <p className="text-sm font-semibold text-slate-200 truncate">{value || '—'}</p>
          </div>
        ))}

        {data.extracted_data?.notes && (
          <div className="col-span-2 p-3 bg-slate-800/40 rounded-xl border border-slate-700/60">
            <p className="text-xs text-slate-500 uppercase tracking-wider font-medium mb-1">Notes</p>
            <p className="text-sm text-slate-300">{data.extracted_data.notes}</p>
          </div>
        )}
      </div>

      <button
        onClick={onReset}
        className="w-full flex items-center justify-center gap-2 py-3 px-4
          bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600
          text-slate-300 hover:text-white font-semibold rounded-xl text-sm
          transition-all duration-200"
      >
        <RotateCcw size={14} />
        Add Another
      </button>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function QuickMode({ accountType = 'household', onSuccess }) {
  const [command,      setCommand]      = useState('');
  const [isListening,  setIsListening]  = useState(false);
  const [interimText,  setInterimText]  = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeStep,   setActiveStep]   = useState(0);
  const [result,       setResult]       = useState(null);
  const [error,        setError]        = useState('');
  const [placeholder]                   = useState(() => getPlaceholder(accountType));

  const textareaRef = useRef(null);
  const speechSupported = isSpeechSupported();

  // ── Voice input ─────────────────────────────────────────────────────────
  const handleMicDown = useCallback(async () => {
    if (isListening || isProcessing) return;
    setError('');
    setIsListening(true);
    setInterimText('');

    try {
      const transcript = await startListening({
        lang:            'en-US',
        interimResults:  true,
        onInterim:       (t) => setInterimText(t),
      });
      setCommand((prev) => (prev ? `${prev} ${transcript}` : transcript).trim());
      setInterimText('');
    } catch (err) {
      setError(speechErrorMessages[err.message] || 'Voice input failed. Please type instead.');
      setInterimText('');
    } finally {
      setIsListening(false);
    }
  }, [isListening, isProcessing]);

  const handleMicUp = useCallback(() => {
    if (isListening) stopListening();
  }, [isListening]);

  // ── Submit ───────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    const trimmed = command.trim();
    if (!trimmed) {
      setError('Please enter or speak a command first.');
      return;
    }
    setError('');
    setIsProcessing(true);
    setActiveStep(0);

    try {
      // Animate pipeline steps
      const stepTimings = [0, 600, 1400];
      stepTimings.forEach((delay, i) => {
        setTimeout(() => setActiveStep(i), delay);
      });

      const response = await submitExpense({
        text_command:  trimmed,
        image_base64:  null,           // Quick Mode — no image
        account_type:  accountType,
      });

      setActiveStep(3);
      await new Promise((r) => setTimeout(r, 400)); // let final step render

      // TTS success feedback
      const { type, category, amount } = response.extracted_data || {};
      const msg = type?.toLowerCase() === 'income'
        ? ttsMessages.incomeSaved(category, amount)
        : ttsMessages.expenseSaved(category, amount);
      speak(msg).catch(() => {});

      setResult(response);
      onSuccess?.(response);
    } catch (err) {
      setError(err.message || 'Submission failed. Please try again.');
      speak(ttsMessages.error()).catch(() => {});
    } finally {
      setIsProcessing(false);
    }
  }, [command, accountType, onSuccess]);

  const handleReset = () => {
    setResult(null);
    setCommand('');
    setError('');
    setActiveStep(0);
    setTimeout(() => textareaRef.current?.focus(), 100);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit();
  };

  // ── Processing view ──────────────────────────────────────────────────────
  if (isProcessing) {
    return (
      <div className="space-y-4">
        <div className="p-4 bg-slate-800/40 border border-slate-700/40 rounded-xl">
          <p className="text-xs text-slate-500 font-medium mb-1">Your command</p>
          <p className="text-sm text-slate-300 italic">"{command}"</p>
        </div>
        <AIProcessingLoader activeStep={activeStep} />
      </div>
    );
  }

  // ── Result view ──────────────────────────────────────────────────────────
  if (result) {
    return <ResultCard data={result} onReset={handleReset} />;
  }

  // ── Input view ───────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Header badge */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-teal-500/10 border border-teal-500/30 rounded-full">
          <Zap size={11} className="text-teal-400" />
          <span className="text-xs font-semibold text-teal-400 tracking-wide">Groq Fast Mode</span>
        </div>
        <span className="text-xs text-slate-600">No image needed</span>
      </div>

      {/* Textarea */}
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={isListening ? `${command}${interimText ? ' ' + interimText : ''}` : command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={4}
          className={`
            w-full bg-slate-800/60 border rounded-xl px-4 py-3.5
            text-sm text-slate-100 placeholder:text-slate-600
            outline-none resize-none leading-relaxed
            transition-all duration-200
            focus:bg-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20
            ${isListening ? 'border-red-400/70 bg-red-500/5 ring-2 ring-red-500/20' : 'border-slate-700'}
          `}
        />
        {isListening && (
          <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2 py-1 bg-red-500/20 border border-red-500/40 rounded-full">
            <div className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
            <span className="text-xs text-red-400 font-medium">Listening</span>
          </div>
        )}
        {interimText && (
          <p className="absolute bottom-3 left-4 right-4 text-xs text-emerald-400/70 italic truncate pointer-events-none">
            {interimText}…
          </p>
        )}
      </div>

      <p className="text-xs text-slate-600 -mt-1">
        Tip: Press <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-slate-500 font-mono text-[10px]">⌘ Enter</kbd> to submit
      </p>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-3">
        {/* Hold to Speak */}
        {speechSupported && (
          <button
            type="button"
            onPointerDown={handleMicDown}
            onPointerUp={handleMicUp}
            onPointerLeave={handleMicUp}
            disabled={isProcessing}
            className={`
              flex items-center gap-2 px-4 py-3 rounded-xl border font-semibold text-sm
              select-none touch-none transition-all duration-150
              ${isListening
                ? 'bg-red-500/20 border-red-500/60 text-red-400 scale-95 shadow-lg shadow-red-500/20'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-600 hover:text-white active:scale-95'
              }
            `}
          >
            {isListening ? <MicOff size={16} /> : <Mic size={16} />}
            {isListening ? 'Release to stop' : 'Hold to Speak'}
          </button>
        )}

        {/* Submit */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!command.trim() || isProcessing}
          className="
            flex-1 flex items-center justify-center gap-2 py-3 px-4
            bg-emerald-500 hover:bg-emerald-400
            disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed
            text-slate-950 font-bold rounded-xl text-sm
            transition-all duration-200 shadow-lg shadow-emerald-500/20
            disabled:shadow-none
          "
        >
          <Send size={15} />
          Submit
        </button>
      </div>
    </div>
  );
}