import type { Mode, Phase } from "./engine";
import { ArcadeMusic } from "./music";

export class ArcadeAudio {
  enabled = true;
  musicEnabled = true;
  private context: AudioContext | null = null;
  private music = new ArcadeMusic();

  unlock() {
    if (!this.enabled && !this.musicEnabled) return;
    try {
      this.context ??= new AudioContext({ latencyHint: "interactive" });
      if (this.context.state === "suspended")
        void this.context.resume().catch(() => {});
      if (this.musicEnabled) this.music.start(this.context);
    } catch {
      /* Sound is optional when Web Audio is unavailable. */
    }
  }

  setSfxEnabled(value: boolean) {
    this.enabled = value;
    if (!this.enabled && !this.musicEnabled) this.music.stop();
  }

  setMusicEnabled(value: boolean) {
    this.musicEnabled = value;
    this.music.setEnabled(value);
    if (value && this.context) this.music.start(this.context);
  }

  setMode(mode: Mode) {
    this.music.setMode(mode);
  }

  setPhase(phase: Phase) {
    this.music.setPhase(phase);
  }

  setSuspended(hidden: boolean) {
    if (hidden) {
      this.music.stop();
      if (this.context && this.context.state === "running") {
        void this.context.suspend().catch(() => {});
      }
      return;
    }
    if (!this.enabled && !this.musicEnabled) return;
    if (this.context) {
      if (this.context.state === "suspended") {
        void this.context.resume().catch(() => {});
      }
      if (this.musicEnabled) this.music.start(this.context);
    }
  }

  private note(
    frequency: number,
    duration: number,
    delay = 0,
    type: OscillatorType = "square",
    volume = 0.027,
    end?: number,
  ) {
    const ctx = this.context;
    if (!ctx || !this.enabled || ctx.state !== "running") return;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    const time = ctx.currentTime + delay;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, time);
    if (end)
      oscillator.frequency.exponentialRampToValueAtTime(end, time + duration);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(volume, time + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(time);
    oscillator.stop(time + duration + 0.016);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
  }

  play(
    event:
      | "start"
      | "eat"
      | "gold"
      | "wall"
      | "graceEnd"
      | "over"
      | "pause"
      | "resume"
      | "select"
      | "won",
  ) {
    switch (event) {
      case "start":
      case "resume":
        [330, 440, 660].forEach((n, i) =>
          this.note(n, 0.1, i * 0.05, "square", 0.021),
        );
        break;
      case "eat":
        this.note(740, 0.065, 0, "square", 0.023);
        this.note(1110, 0.1, 0.048, "sine", 0.06);
        break;
      case "gold":
      case "won":
        [523, 659, 784, 1046].forEach((n, i) =>
          this.note(n, 0.15, i * 0.055, "triangle", 0.07),
        );
        break;
      case "wall":
        this.note(240, 0.09, 0, "square", 0.035, 100);
        this.note(130, 0.16, 0.055, "triangle", 0.06, 65);
        break;
      case "graceEnd":
        break;
      case "over":
        this.note(230, 0.18, 0, "sawtooth", 0.04, 80);
        this.note(100, 0.24, 0.13, "triangle", 0.07, 40);
        break;
      case "pause":
        this.note(440, 0.09, 0, "triangle", 0.06);
        this.note(294, 0.12, 0.06, "triangle", 0.06);
        break;
      case "select":
        this.note(610, 0.065, 0, "square", 0.02);
        break;
    }
  }

  dispose() {
    this.music.dispose();
    if (this.context) void this.context.close().catch(() => {});
    this.context = null;
  }
}
