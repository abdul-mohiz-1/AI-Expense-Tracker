/**
 * textToSpeech.js — Browser-native Speech Synthesis Helper
 * =========================================================
 * Uses window.speechSynthesis (zero external API cost).
 *
 * Exports:
 *   speak(text, options?)   → Promise<void>  — speaks text, resolves on end
 *   cancelSpeech()          → void           — immediately stops speaking
 *   isTTSSupported()        → boolean        — feature detection
 *   getVoices()             → SpeechSynthesisVoice[]
 */

// ── Feature detection ─────────────────────────────────────────────────────────
export function isTTSSupported() {
  return 'speechSynthesis' in window;
}

/**
 * Immediately cancel any ongoing speech.
 */
export function cancelSpeech() {
  if (isTTSSupported()) {
    window.speechSynthesis.cancel();
  }
}

/**
 * Return available synthesis voices.
 * Note: voices load asynchronously in some browsers — call this after
 * the 'voiceschanged' event or add a short delay.
 */
export function getVoices() {
  if (!isTTSSupported()) return [];
  return window.speechSynthesis.getVoices();
}

/**
 * Speak *text* aloud using the browser's speech synthesis engine.
 *
 * @param {string} text                      The string to speak.
 * @param {object} [options]
 * @param {string} [options.lang='en-US']    BCP-47 language tag.
 * @param {number} [options.rate=1.0]        Speed (0.1 – 10). 1 = normal.
 * @param {number} [options.pitch=1.0]       Pitch (0 – 2). 1 = normal.
 * @param {number} [options.volume=1.0]      Volume (0 – 1).
 * @param {string} [options.voiceName]       Match against SpeechSynthesisVoice.name.
 *
 * @returns {Promise<void>} Resolves when speech finishes; rejects on error.
 */
export function speak(text, {
  lang       = 'en-US',
  rate       = 1.05,
  pitch      = 1.0,
  volume     = 1.0,
  voiceName  = null,
} = {}) {
  return new Promise((resolve, reject) => {
    if (!isTTSSupported()) {
      // Silently resolve — TTS is a nice-to-have, not mission-critical
      console.warn('[TTS] speechSynthesis not supported in this browser.');
      return resolve();
    }

    // Cancel anything already playing before starting
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang   = lang;
    utterance.rate   = rate;
    utterance.pitch  = pitch;
    utterance.volume = volume;

    // ── Voice selection (optional) ────────────────────────────────────────
    if (voiceName) {
      const voices = window.speechSynthesis.getVoices();
      const match  = voices.find((v) =>
        v.name.toLowerCase().includes(voiceName.toLowerCase())
      );
      if (match) utterance.voice = match;
    }

    // ── Events ────────────────────────────────────────────────────────────
    utterance.onend   = () => resolve();
    utterance.onerror = (event) => {
      // 'interrupted' fires when cancel() is called — treat as non-error
      if (event.error === 'interrupted' || event.error === 'canceled') {
        return resolve();
      }
      reject(new Error(`SpeechSynthesis error: ${event.error}`));
    };

    window.speechSynthesis.speak(utterance);

    // ── Chrome bug workaround ─────────────────────────────────────────────
    // Chrome sometimes pauses long utterances. Resuming periodically fixes it.
    const resumeInterval = setInterval(() => {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
      if (!window.speechSynthesis.speaking) {
        clearInterval(resumeInterval);
      }
    }, 5000);

    utterance.onend = () => {
      clearInterval(resumeInterval);
      resolve();
    };
  });
}

/**
 * Pre-built feedback messages — import these for consistent voice copy.
 */
export const ttsMessages = {
  expenseSaved:  (category, amount) =>
    `${category} expense of ${amount} saved successfully.`,
  incomeSaved:   (category, amount) =>
    `${category} income of ${amount} recorded.`,
  error:         () => 'Something went wrong. Please try again.',
  listening:     () => 'Listening. Please speak your command.',
  processing:    () => 'Processing your request.',
};