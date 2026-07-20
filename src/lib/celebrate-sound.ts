/**
 * A short celebration chime, synthesized with the Web Audio API.
 *
 * Deliberately generated rather than shipped as an audio file: it costs zero
 * bytes of download, has no decode latency (so it lands exactly on the
 * animation frame), and can't 404. It's a soft major arpeggio — C6 E6 G6 C7 —
 * with a fast attack and a gentle exponential tail, about 0.6s end to end.
 *
 * Silently no-ops when Web Audio is unavailable or the browser hasn't granted
 * an audio gesture yet; a missing sound must never break the visual.
 */

const NOTES = [1046.5, 1318.5, 1568.0, 2093.0]; // C6, E6, G6, C7
const NOTE_GAP = 0.075;
const NOTE_LENGTH = 0.34;
const PEAK_GAIN = 0.16; // conservative — this plays over a live stream

type WindowWithAudio = Window & {
  webkitAudioContext?: typeof AudioContext;
};

let context: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (context) return context;
  const Ctor =
    window.AudioContext ?? (window as WindowWithAudio).webkitAudioContext;
  if (!Ctor) return null;
  try {
    context = new Ctor();
    return context;
  } catch {
    return null;
  }
}

/** Plays the celebration chime. Never throws. */
export function playCelebration(): void {
  const ctx = audioContext();
  if (!ctx) return;

  try {
    // Autoplay policies suspend the context until a user gesture; the buyer
    // just tapped through checkout, so this resume normally succeeds.
    if (ctx.state === "suspended") void ctx.resume();

    const start = ctx.currentTime + 0.02;

    NOTES.forEach((frequency, i) => {
      const at = start + i * NOTE_GAP;

      const osc = ctx.createOscillator();
      // Triangle reads as warm/celebratory; a sine is too plain, a saw harsh.
      osc.type = "triangle";
      osc.frequency.setValueAtTime(frequency, at);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(PEAK_GAIN, at + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + NOTE_LENGTH);

      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + NOTE_LENGTH + 0.02);
    });
  } catch {
    // Audio is a garnish — swallow anything the browser objects to.
  }
}
