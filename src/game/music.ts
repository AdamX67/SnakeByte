import type { Mode, Phase } from "./engine";

type Note = string | null;

export type MusicPattern = {
  tempo: number;
  lead: readonly Note[];
  bass: readonly Note[];
  arp: readonly Note[];
};

const SEMITONES: Record<string, number> = {
  C: 0,
  "C#": 1,
  D: 2,
  "D#": 3,
  E: 4,
  F: 5,
  "F#": 6,
  G: 7,
  "G#": 8,
  A: 9,
  "A#": 10,
  B: 11,
};

export function noteFrequency(note: string, transpose = 0) {
  const match = /^([A-G]#?)(-?\d)$/.exec(note);
  if (!match) return 0;
  const semitone = SEMITONES[match[1]];
  const octave = Number.parseInt(match[2], 10);
  const midi = (octave + 1) * 12 + semitone;
  return 440 * Math.pow(2, (midi - 69 + transpose) / 12);
}

export function phaseGain(phase: Phase) {
  switch (phase) {
    case "playing":
      return 0.18;
    case "ready":
      return 0.1;
    default:
      return 0.0001;
  }
}

export const MUSIC_PATTERNS: Record<Mode, MusicPattern> = {
  easy: {
    tempo: 108,
    lead: [
      "C5", null, "E5", null, "G5", null, "E5", null,
      "A4", null, "C5", null, "E5", null, "D5", null,
    ],
    bass: [
      "C3", null, null, null, "G2", null, null, null,
      "A2", null, null, null, "F2", null, null, null,
    ],
    arp: [
      null, "G4", null, "C5", null, "E5", null, "G5",
      null, "A4", null, "C5", null, "E5", null, "G4",
    ],
  },
  medium: {
    tempo: 132,
    lead: [
      "D5", null, "F5", null, "A5", null, "F5", null,
      "C5", null, "E5", null, "G5", null, "F5", null,
    ],
    bass: [
      "D3", null, null, null, "A2", null, null, null,
      "C3", null, null, null, "G2", null, null, null,
    ],
    arp: [
      null, "A4", null, "D5", null, "F5", null, "A5",
      null, "G4", null, "C5", null, "E5", null, "G5",
    ],
  },
  hard: {
    tempo: 156,
    lead: [
      "E5", null, "G5", null, "B5", null, "G5", null,
      "D5", null, "F#5", null, "A5", null, "G5", null,
    ],
    bass: [
      "E3", null, null, null, "B2", null, null, null,
      "C3", null, null, null, "G2", null, null, null,
    ],
    arp: [
      null, "B4", null, "E5", null, "G5", null, "B5",
      null, "A4", null, "D5", null, "F#5", null, "A5",
    ],
  },
};

/**
 * Tiny look-ahead chiptune sequencer. It schedules Web Audio nodes only while
 * the cabinet is active and uses no files, timers for playback buffers, or
 * network requests. All sound is generated locally from oscillators and noise.
 */
export class ArcadeMusic {
  private context: AudioContext | null = null;
  private gain: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private timer: number | null = null;
  private enabled = true;
  private mode: Mode = "easy";
  private phase: Phase = "ready";
  private step = 0;
  private nextTime = 0;

  start(context: AudioContext) {
    if (!this.enabled) return;
    this.context = context;
    if (!this.gain) {
      this.gain = context.createGain();
      this.gain.gain.value = 0;
      this.gain.connect(context.destination);
    }
    if (this.timer === null) {
      this.applyGain();
      this.nextTime = context.currentTime + 0.06;
      this.timer = window.setInterval(() => this.schedule(), 25);
    }
  }

  setEnabled(value: boolean) {
    this.enabled = value;
    if (!value) {
      this.stop();
      return;
    }
    if (this.context) this.start(this.context);
  }

  setMode(mode: Mode) {
    this.mode = mode;
  }

  setPhase(phase: Phase) {
    this.phase = phase;
    this.applyGain();
  }

  stop() {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    if (this.gain && this.context) {
      const now = this.context.currentTime;
      this.gain.gain.cancelScheduledValues(now);
      this.gain.gain.setTargetAtTime(0.0001, now, 0.025);
    }
  }

  dispose() {
    this.stop();
    this.gain?.disconnect();
    this.gain = null;
    this.context = null;
    this.noise = null;
  }

  private applyGain() {
    if (!this.gain || !this.context) return;
    const now = this.context.currentTime;
    const target = this.enabled ? phaseGain(this.phase) : 0.0001;
    this.gain.gain.cancelScheduledValues(now);
    this.gain.gain.setTargetAtTime(target, now, 0.06);
  }

  private schedule() {
    const context = this.context;
    const gain = this.gain;
    if (
      !context ||
      !gain ||
      !this.enabled ||
      context.state !== "running" ||
      this.phase === "paused" ||
      this.phase === "over" ||
      this.phase === "won"
    )
      return;
    // Avoid a burst of catch-up notes after a pause or suspended tab.
    if (this.nextTime < context.currentTime - 0.2)
      this.nextTime = context.currentTime + 0.03;
    const pattern = MUSIC_PATTERNS[this.mode];
    const stepDuration = 60 / pattern.tempo / 4;
    while (this.nextTime < context.currentTime + 0.14) {
      this.scheduleStep(context, gain, pattern, this.step, this.nextTime, stepDuration);
      this.nextTime += stepDuration;
      this.step = (this.step + 1) % 64;
    }
  }

  private scheduleStep(
    context: AudioContext,
    gain: GainNode,
    pattern: MusicPattern,
    step: number,
    at: number,
    duration: number,
  ) {
    const index = step % 16;
    const bar = Math.floor(step / 16) % 4;
    const transpose = [0, 0, 2, -2][bar];
    const lead = pattern.lead[index];
    const bass = pattern.bass[index];
    const arp = pattern.arp[index];

    if (lead) {
      this.tone(
        context,
        gain,
        at,
        duration * 0.82,
        noteFrequency(lead, transpose),
        "square",
        0.16,
      );
    }
    if (bass) {
      this.tone(
        context,
        gain,
        at,
        duration * 1.8,
        noteFrequency(bass, transpose),
        "triangle",
        0.13,
      );
    }
    if (this.phase !== "playing") return;
    if (arp) {
      this.tone(
        context,
        gain,
        at,
        duration * 0.45,
        noteFrequency(arp, transpose) * 2,
        "square",
        0.045,
      );
    }
    if (index === 0 || index === 8) {
      this.tone(context, gain, at, 0.12, 130, "sine", 0.12, 45);
    }
    if (index === 4 || index === 12) {
      this.noiseHit(context, gain, at, 0.09, 0.055, "bandpass", 1700);
    }
    if (index % 2 === 0) {
      this.noiseHit(context, gain, at, 0.035, 0.025, "highpass", 6200);
    }
  }

  private tone(
    context: AudioContext,
    output: GainNode,
    at: number,
    duration: number,
    frequency: number,
    type: OscillatorType,
    volume: number,
    endFrequency?: number,
  ) {
    if (!Number.isFinite(frequency) || frequency <= 0) return;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, at);
    if (endFrequency)
      oscillator.frequency.exponentialRampToValueAtTime(endFrequency, at + duration);
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(volume, at + 0.008);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    oscillator.connect(envelope);
    envelope.connect(output);
    oscillator.start(at);
    oscillator.stop(at + duration + 0.02);
    oscillator.onended = () => {
      oscillator.disconnect();
      envelope.disconnect();
    };
  }

  private noiseHit(
    context: AudioContext,
    output: GainNode,
    at: number,
    duration: number,
    volume: number,
    filterType: BiquadFilterType,
    frequency: number,
  ) {
    if (!this.noise) {
      const length = Math.ceil(context.sampleRate * 0.12);
      const buffer = context.createBuffer(1, length, context.sampleRate);
      const samples = buffer.getChannelData(0);
      for (let i = 0; i < length; i++)
        samples[i] = (Math.random() * 2 - 1) * (1 - i / length);
      this.noise = buffer;
    }
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();
    source.buffer = this.noise;
    filter.type = filterType;
    filter.frequency.value = frequency;
    envelope.gain.setValueAtTime(volume, at);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(output);
    source.start(at);
    source.stop(at + duration + 0.01);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      envelope.disconnect();
    };
  }
}
