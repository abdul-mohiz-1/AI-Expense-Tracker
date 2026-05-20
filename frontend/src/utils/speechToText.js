/**
 * speechToText.js — Browser-native Speech Recognition Helper
 * ===========================================================
 * Uses webkitSpeechRecognition / SpeechRecognition (zero external API cost).
 *
 * Exports:
 *   startListening(options?)  → Promise<string>   — resolves with transcript
 *   stopListening()           → void              — force-stops active session
 *   isSpeechSupported()       → boolean           — feature detection
 */

// ── Feature detection ─────────────────────────────────────────────────────────
const SpeechRecognitionAPI =
  window.SpeechRecognition || window.webkitSpeechRecognition || null;

/**
 * Returns true if the browser supports the Web Speech API.
 */
export function isSpeechSupported() {
  return SpeechRecognitionAPI !== null;
}

// ── Module-level instance (only one active session at a time) ─────────────────
let activeRecognition = null;

/**
 * Force-stop any currently active recognition session.
 * Safe to call even if nothing is running.
 */
export function stopListening() {
  if (activeRecognition) {
    try {
      activeRecognition.stop();
    } catch (_) {
      // Already stopped — ignore
    }
    activeRecognition = null;
  }
}

/**
 * Start listening via the device microphone and return a Promise that
 * resolves with the final transcript string.
 *
 * @param {object}  [options]
 * @param {string}  [options.lang='en-US']         BCP-47 language tag
 * @param {boolean} [options.continuous=false]      Keep listening until stop()
 * @param {boolean} [options.interimResults=false]  Emit partial results
 * @param {number}  [options.maxAlternatives=1]     Alternatives per result
 * @param {function}[options.onInterim]             Called with interim text
 *
 * @returns {Promise<string>} Final transcript
 *
 * @throws {Error} 'UNSUPPORTED'        — browser lacks Web Speech API
 * @throws {Error} 'NO_SPEECH'          — silence timeout
 * @throws {Error} 'NOT_ALLOWED'        — mic permission denied
 * @throws {Error} 'NETWORK'            — network error during recognition
 * @throws {Error} 'EMPTY_TRANSCRIPT'   — recognition ended with no words
 */
export function startListening({
  lang = 'en-US',
  continuous = false,
  interimResults = false,
  maxAlternatives = 1,
  onInterim = null,
} = {}) {
  return new Promise((resolve, reject) => {
    if (!isSpeechSupported()) {
      return reject(new Error('UNSUPPORTED'));
    }

    // Stop any previously running session
    stopListening();

    const recognition = new SpeechRecognitionAPI();
    activeRecognition  = recognition;

    recognition.lang            = lang;
    recognition.continuous      = continuous;
    recognition.interimResults  = interimResults;
    recognition.maxAlternatives = maxAlternatives;

    let finalTranscript = '';

    // ── Event: speech result ──────────────────────────────────────────────
    recognition.onresult = (event) => {
      let interim = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript + ' ';
        } else {
          interim += result[0].transcript;
        }
      }

      // Fire interim callback if provided (e.g. to show live captions)
      if (onInterim && interim) {
        onInterim(interim);
      }
    };

    // ── Event: recognition ended ──────────────────────────────────────────
    recognition.onend = () => {
      activeRecognition = null;
      const trimmed = finalTranscript.trim();
      if (trimmed) {
        resolve(trimmed);
      } else {
        reject(new Error('EMPTY_TRANSCRIPT'));
      }
    };

    // ── Event: error ──────────────────────────────────────────────────────
    recognition.onerror = (event) => {
      activeRecognition = null;
      const errorMap = {
        'no-speech':        'NO_SPEECH',
        'not-allowed':      'NOT_ALLOWED',
        'audio-capture':    'NOT_ALLOWED',
        'network':          'NETWORK',
        'service-not-allowed': 'NOT_ALLOWED',
      };
      const code = errorMap[event.error] || event.error.toUpperCase();
      reject(new Error(code));
    };

    // ── Start ─────────────────────────────────────────────────────────────
    try {
      recognition.start();
    } catch (err) {
      activeRecognition = null;
      reject(err);
    }
  });
}

/**
 * Friendly human-readable message for each error code.
 * Use in UI toast/snackbar components.
 */
export const speechErrorMessages = {
  UNSUPPORTED:      'Voice input is not supported in this browser. Try Chrome or Edge.',
  NO_SPEECH:        'No speech detected. Please try again.',
  NOT_ALLOWED:      'Microphone access was denied. Please allow mic permissions.',
  NETWORK:          'A network error occurred during voice recognition.',
  EMPTY_TRANSCRIPT: 'Could not catch that. Please speak clearly and try again.',
};