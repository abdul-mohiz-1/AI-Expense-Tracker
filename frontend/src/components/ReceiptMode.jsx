/**
 * components/ReceiptMode.jsx — Receipt Image + Voice Mode
 * =========================================================
 * Mode A: User uploads a receipt image AND optionally speaks a command.
 * Converts image to base64 and sends both to backend → Gemini cascade.
 *
 * Features:
 *  - Drag-and-drop + click-to-browse image uploader
 *  - Camera capture on mobile (accept="image/*" capture="environment")
 *  - Image preview with replace button
 *  - "Hold to Speak" mic button with live interim captions
 *  - Fallback text input if no voice support
 *  - Submit → AIProcessingLoader → success result card
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Upload, Camera, Mic, MicOff, Send, Image as ImageIcon,
  X, CheckCircle2, AlertCircle, RotateCcw,
  TrendingUp, TrendingDown, ScanLine, FileImage,
} from 'lucide-react';

import { submitExpense }       from '../services/api';
import {
  startListening, stopListening,
  speechErrorMessages, isSpeechSupported,
}                              from '../utils/speechToText';
import { speak, ttsMessages }  from '../utils/textToSpeech';
import { AIProcessingLoader }  from './Loader';

// ── Helpers ───────────────────────────────────────────────────────────────────
const MAX_SIZE_MB  = 5;
const ACCEPT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result.split(',')[1]); // strip data-URI prefix
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

function validateFile(file) {
  if (!ACCEPT_TYPES.includes(file.type))
    return `Unsupported format. Use JPG, PNG, WebP, or GIF.`;
  if (file.size > MAX_SIZE_MB * 1024 * 1024)
    return `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max ${MAX_SIZE_MB} MB.`;
  return null;
}

// ── Drop Zone ─────────────────────────────────────────────────────────────────
function DropZone({ onFile, error }) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef(null);

  const handleFiles = (files) => {
    if (files?.length) onFile(files[0]);
  };

  const handleDrag = (e) => {
    e.preventDefault();
    setIsDragging(e.type === 'dragenter' || e.type === 'dragover');
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  return (
    <div
      onDragEnter={handleDrag}
      onDragOver={handleDrag}
      onDragLeave={handleDrag}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`
        relative flex flex-col items-center justify-center gap-3
        border-2 border-dashed rounded-2xl p-8 cursor-pointer
        transition-all duration-200 group min-h-[180px]
        ${isDragging
          ? 'border-emerald-400 bg-emerald-500/10 scale-[1.01]'
          : error
            ? 'border-red-500/50 bg-red-500/5 hover:border-red-500/70'
            : 'border-slate-700 bg-slate-800/30 hover:border-emerald-500/50 hover:bg-slate-800/50'
        }
      `}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {/* Icon */}
      <div className={`
        w-14 h-14 rounded-2xl flex items-center justify-center
        transition-all duration-200
        ${isDragging
          ? 'bg-emerald-500/20 text-emerald-400'
          : 'bg-slate-800 text-slate-500 group-hover:bg-emerald-500/10 group-hover:text-emerald-400'
        }
      `}>
        {isDragging ? <Upload size={24} /> : <FileImage size={24} />}
      </div>

      <div className="text-center">
        <p className={`text-sm font-semibold transition-colors
          ${isDragging ? 'text-emerald-300' : 'text-slate-300 group-hover:text-white'}`}>
          {isDragging ? 'Drop receipt here' : 'Upload Receipt'}
        </p>
        <p className="text-xs text-slate-500 mt-1">
          Drag & drop · Click to browse · Camera on mobile
        </p>
        <p className="text-xs text-slate-600 mt-1">JPG, PNG, WebP up to {MAX_SIZE_MB} MB</p>
      </div>

      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-full text-xs text-slate-400 hover:border-slate-600 transition-colors">
          <Upload size={11} /> Browse
        </span>
        <span className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-full text-xs text-slate-400 hover:border-slate-600 transition-colors">
          <Camera size={11} /> Camera
        </span>
      </div>

      {error && (
        <p className="flex items-center gap-1.5 text-xs text-red-400 mt-1">
          <AlertCircle size={12} />
          {error}
        </p>
      )}
    </div>
  );
}

// ── Image Preview ─────────────────────────────────────────────────────────────
function ImagePreview({ dataUrl, fileName, onRemove }) {
  return (
    <div className="relative rounded-2xl overflow-hidden border border-slate-700 bg-slate-900">
      <img
        src={dataUrl}
        alt="Receipt preview"
        className="w-full max-h-56 object-contain bg-slate-950"
      />
      {/* Overlay info bar */}
      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-slate-950/90 to-transparent p-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ScanLine size={14} className="text-emerald-400" />
          <span className="text-xs text-slate-300 font-medium truncate max-w-[180px]">
            {fileName}
          </span>
        </div>
        <button
          onClick={onRemove}
          className="w-7 h-7 rounded-full bg-slate-800/80 border border-slate-700 flex items-center justify-center text-slate-400 hover:text-white hover:border-red-500/50 transition-colors"
        >
          <X size={13} />
        </button>
      </div>
      {/* AI scanning animation overlay */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-400/60 to-transparent"
          style={{ animation: 'scanLine 2s ease-in-out infinite', top: '20%' }}
        />
      </div>
    </div>
  );
}

// ── Result Card ───────────────────────────────────────────────────────────────
function ResultCard({ data, onReset }) {
  const isIncome = data.extracted_data?.type?.toLowerCase() === 'income';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
        <CheckCircle2 className="text-emerald-400 flex-shrink-0" size={20} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-emerald-300">Receipt processed & saved</p>
          <p className="text-xs text-slate-400 truncate">
            Tab: {data.sheet_tab} · via {data.provider_used}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
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
        Scan Another Receipt
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ReceiptMode({ accountType = 'household', onSuccess }) {
  const [imageFile,    setImageFile]    = useState(null);
  const [imageDataUrl, setImageDataUrl] = useState('');
  const [imageB64,     setImageB64]     = useState('');
  const [imageError,   setImageError]   = useState('');
  const [command,      setCommand]      = useState('');
  const [isListening,  setIsListening]  = useState(false);
  const [interimText,  setInterimText]  = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeStep,   setActiveStep]   = useState(0);
  const [result,       setResult]       = useState(null);
  const [error,        setError]        = useState('');

  const speechSupported = isSpeechSupported();

  // Cleanup object URLs
  useEffect(() => {
    return () => {
      if (imageDataUrl?.startsWith('blob:')) URL.revokeObjectURL(imageDataUrl);
    };
  }, [imageDataUrl]);

  // ── File handler ─────────────────────────────────────────────────────────
  const handleFile = useCallback(async (file) => {
    setImageError('');
    const err = validateFile(file);
    if (err) { setImageError(err); return; }

    setImageFile(file);
    setImageDataUrl(URL.createObjectURL(file));
    try {
      const b64 = await fileToBase64(file);
      setImageB64(b64);
    } catch {
      setImageError('Could not read the file. Please try again.');
    }
  }, []);

  const handleRemoveImage = () => {
    setImageFile(null);
    setImageDataUrl('');
    setImageB64('');
    setImageError('');
  };

  // ── Voice input ──────────────────────────────────────────────────────────
  const handleMicDown = useCallback(async () => {
    if (isListening || isProcessing) return;
    setError('');
    setIsListening(true);
    setInterimText('');

    try {
      const transcript = await startListening({
        lang:           'en-US',
        interimResults: true,
        onInterim:      (t) => setInterimText(t),
      });
      setCommand((prev) => (prev ? `${prev} ${transcript}` : transcript).trim());
      setInterimText('');
    } catch (err) {
      setError(speechErrorMessages[err.message] || 'Voice input failed.');
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
    if (!imageB64)      { setError('Please upload a receipt image first.'); return; }
    if (!command.trim()) { setError('Please add a voice or text command describing the expense.'); return; }
    setError('');
    setIsProcessing(true);
    setActiveStep(0);

    const steps = [
      'Analysing receipt image…',
      'Routing to Gemini Vision…',
      'Extracting transaction data…',
      'Writing to Google Sheets…',
    ];

    try {
      [0, 700, 1600].forEach((delay, i) => {
        setTimeout(() => setActiveStep(i), delay);
      });

      const response = await submitExpense({
        text_command:  command.trim(),
        image_base64:  imageB64,
        account_type:  accountType,
      });

      setActiveStep(3);
      await new Promise((r) => setTimeout(r, 400));

      const { type, category, amount } = response.extracted_data || {};
      const msg = type?.toLowerCase() === 'income'
        ? ttsMessages.incomeSaved(category, amount)
        : ttsMessages.expenseSaved(category, amount);
      speak(msg).catch(() => {});

      setResult(response);
      onSuccess?.(response);
    } catch (err) {
      setError(err.message || 'Submission failed.');
      speak(ttsMessages.error()).catch(() => {});
    } finally {
      setIsProcessing(false);
    }
  }, [imageB64, command, accountType, onSuccess]);

  const handleReset = () => {
    setResult(null);
    handleRemoveImage();
    setCommand('');
    setError('');
    setActiveStep(0);
  };

  // ── Processing view ──────────────────────────────────────────────────────
  if (isProcessing) {
    const steps = [
      'Analysing receipt image…',
      'Routing to Gemini Vision…',
      'Extracting transaction data…',
      'Writing to Google Sheets…',
    ];
    return (
      <div className="space-y-4">
        {imageDataUrl && (
          <img src={imageDataUrl} alt="Receipt" className="w-full max-h-40 object-contain rounded-xl opacity-60" />
        )}
        <AIProcessingLoader steps={steps} activeStep={activeStep} />
      </div>
    );
  }

  // ── Result view ──────────────────────────────────────────────────────────
  if (result) return <ResultCard data={result} onReset={handleReset} />;

  // ── Input view ───────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Gemini badge */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-violet-500/10 border border-violet-500/30 rounded-full">
          <ImageIcon size={11} className="text-violet-400" />
          <span className="text-xs font-semibold text-violet-400 tracking-wide">Gemini Vision</span>
        </div>
        <span className="text-xs text-slate-600">AI-powered receipt scan</span>
      </div>

      {/* Image area */}
      {imageDataUrl ? (
        <ImagePreview
          dataUrl={imageDataUrl}
          fileName={imageFile?.name || 'receipt'}
          onRemove={handleRemoveImage}
        />
      ) : (
        <DropZone onFile={handleFile} error={imageError} />
      )}

      {/* Voice / Text command */}
      <div className="space-y-2">
        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Add Context <span className="text-slate-600 normal-case font-normal">(speak or type)</span>
        </label>
        <div className="relative">
          <input
            type="text"
            value={isListening ? `${command}${interimText ? ' ' + interimText : ''}` : command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder={
              accountType === 'business'
                ? 'e.g. "Add this to marketing expenses"'
                : 'e.g. "This is a grocery receipt from yesterday"'
            }
            className={`
              w-full bg-slate-800/60 border rounded-xl px-4 py-3 text-sm text-slate-100
              placeholder:text-slate-600 outline-none pr-28
              transition-all duration-200
              focus:bg-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20
              ${isListening ? 'border-red-400/70 ring-2 ring-red-500/20' : 'border-slate-700'}
            `}
          />
          {isListening && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 px-2 py-1 bg-red-500/20 border border-red-500/40 rounded-full">
              <div className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
              <span className="text-xs text-red-400 font-medium">Listening</span>
            </div>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-3">
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
            {isListening ? 'Release' : 'Hold to Speak'}
          </button>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!imageB64 || !command.trim() || isProcessing}
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
          Process Receipt
        </button>
      </div>

      {/* Scan line CSS */}
      <style>{`
        @keyframes scanLine {
          0%   { top: 10%; opacity: 0; }
          20%  { opacity: 1; }
          80%  { opacity: 1; }
          100% { top: 90%; opacity: 0; }
        }
      `}</style>
    </div>
  );
}