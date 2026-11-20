import type { GameSettings, MatchState, ShotOutcomeSummary } from '../game/types.ts';
import { AmbientCrowdController } from './AmbientCrowdController.ts';

export function computeAmbianceMix(roomAmbiance: number): {
  roomAmbiance: number;
  musicGain: number;
  atmosphereGain: number;
} {
  const clamped = Number.isFinite(roomAmbiance)
    ? Math.max(0, Math.min(1, roomAmbiance))
    : 0.5;
  // Smooth equal-power crossfade with exact 0 endpoints
  const musicGain = clamped >= 0.999 ? 0 : Math.cos(clamped * Math.PI * 0.5);
  const atmosphereGain = clamped <= 0.001 ? 0 : Math.sin(clamped * Math.PI * 0.5);
  return {
    roomAmbiance: clamped,
    musicGain,
    atmosphereGain,
  };
}

/**
 * 100% Procedural Web Audio API synthesizer for realistic billiard SFX & dynamic arena ambience.
 */
class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private ambientGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private atmosphereGain: GainNode | null = null;
  private ambientStarted = false;
  private ambientOscs: OscillatorNode[] = [];
  private venueAcousticsStarted = false;
  private crowdController = new AmbientCrowdController();

  private settings: GameSettings = {
    masterVolume: 0.85,
    sfxVolume: 0.9,
    ambientVolume: 0.45,
    roomAmbiance: 0.5,
    muted: false,
    graphicsQuality: 'auto',
    aimAssist: 'full',
    ghostBallGuide: true,
    cameraSensitivity: 1,
    surfaceStyle: 'tournament',
    language: 'en',
  };

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.ambientGain = this.ctx.createGain();
      this.musicGain = this.ctx.createGain();
      this.atmosphereGain = this.ctx.createGain();

      this.sfxGain.connect(this.masterGain);
      this.musicGain.connect(this.ambientGain);
      this.atmosphereGain.connect(this.ambientGain);
      this.ambientGain.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);
      this.applyVolumes();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public updateSettings(settings: GameSettings): void {
    this.settings = settings;
    this.applyVolumes();
  }

  public getMixLevels(): {
    ambientVolume: number;
    roomAmbiance: number;
    musicGain: number;
    atmosphereGain: number;
  } {
    const mix = computeAmbianceMix(this.settings.roomAmbiance);
    return {
      ambientVolume: this.settings.ambientVolume,
      ...mix,
    };
  }

  private applyVolumes(): void {
    if (!this.ctx || !this.masterGain || !this.sfxGain || !this.ambientGain) return;
    const now = this.ctx.currentTime;
    const master = this.settings.muted ? 0 : this.settings.masterVolume;
    const mix = computeAmbianceMix(this.settings.roomAmbiance);

    this.masterGain.gain.setTargetAtTime(master, now, 0.03);
    this.sfxGain.gain.setTargetAtTime(this.settings.sfxVolume, now, 0.03);
    this.ambientGain.gain.setTargetAtTime(this.settings.ambientVolume * 0.28, now, 0.08);
    if (this.musicGain) {
      this.musicGain.gain.setTargetAtTime(mix.musicGain, now, 0.06);
    }
    if (this.atmosphereGain) {
      this.atmosphereGain.gain.setTargetAtTime(mix.atmosphereGain, now, 0.06);
    }
  }

  private startVenueAcousticsBed(ctx: AudioContext, destination: GainNode): void {
    if (this.venueAcousticsStarted) return;
    this.venueAcousticsStarted = true;

    // Create subtle continuous venue room-acoustics air bed (filtered pink-like room tone)
    const length = Math.floor(ctx.sampleRate * 3.0);
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      let b0 = 0;
      let b1 = 0;
      let b2 = 0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.997 * b0 + white * 0.032;
        b1 = 0.985 * b1 + white * 0.048;
        b2 = 0.94 * b2 + white * 0.064;
        data[i] = (b0 + b1 + b2) * 0.14;
      }
      const fade = Math.min(1536, Math.floor(length / 8));
      for (let i = 0; i < fade; i++) {
        const t = i / fade;
        const tail = length - fade + i;
        const blended = data[i] * t + data[tail] * (1 - t);
        data[i] = blended;
        data[tail] = blended;
      }
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;

    const roomFilter = ctx.createBiquadFilter();
    roomFilter.type = 'bandpass';
    roomFilter.frequency.value = 520;
    roomFilter.Q.value = 0.65;

    const roomGain = ctx.createGain();
    roomGain.gain.value = 0.24;

    src.connect(roomFilter);
    roomFilter.connect(roomGain);
    roomGain.connect(destination);
    src.start();
  }

  public startAmbientIfEnabled(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.ambientGain || !this.musicGain || !this.atmosphereGain) return;
    if (!this.ambientStarted) {
      this.ambientStarted = true;

      // Warm, low-level billiard lounge music pad routed to musicGain
      const freqs = [110, 164.81, 220, 277.18];
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 340;
      filter.connect(this.musicGain);

      // Gentle slow harmonic filter breathing for lounge music warmth
      const filterLfo = ctx.createOscillator();
      const filterLfoGain = ctx.createGain();
      filterLfo.type = 'sine';
      filterLfo.frequency.value = 0.09;
      filterLfoGain.gain.value = 75;
      filterLfo.connect(filterLfoGain);
      filterLfoGain.connect(filter.frequency);
      filterLfo.start();
      this.ambientOscs.push(filterLfo);

      for (let i = 0; i < freqs.length; i++) {
        const osc = ctx.createOscillator();
        const oscGain = ctx.createGain();
        osc.type = i % 2 === 0 ? 'sine' : 'triangle';
        osc.frequency.value = freqs[i];
        oscGain.gain.value = 0.048 / freqs.length;
        osc.connect(oscGain);
        oscGain.connect(filter);
        osc.start();
        this.ambientOscs.push(osc);
      }
    }

    this.startVenueAcousticsBed(ctx, this.atmosphereGain);
    this.crowdController.init(ctx, this.atmosphereGain);
  }

  public updateCrowdContext(state: MatchState | null, activeInMatch: boolean): void {
    if (activeInMatch && this.ctx && this.atmosphereGain) {
      this.startVenueAcousticsBed(this.ctx, this.atmosphereGain);
      this.crowdController.init(this.ctx, this.atmosphereGain);
    }
    this.crowdController.updateContext(state, activeInMatch);
  }

  public reactToShotOutcome(
    prevMatch: MatchState,
    nextMatch: MatchState,
    summary: ShotOutcomeSummary,
  ): void {
    const ctx = this.ensureContext();
    if (ctx && this.atmosphereGain) {
      this.startVenueAcousticsBed(ctx, this.atmosphereGain);
      this.crowdController.init(ctx, this.atmosphereGain);
    }
    this.crowdController.reactToShotOutcome(prevMatch, nextMatch, summary);
  }

  private createPanner(ctx: AudioContext, panX: number): StereoPannerNode | GainNode {
    if (typeof ctx.createStereoPanner === 'function') {
      const panner = ctx.createStereoPanner();
      panner.pan.value = Math.max(-0.85, Math.min(0.85, panX / 1.3));
      panner.connect(this.sfxGain!);
      return panner;
    }
    return this.sfxGain!;
  }

  public playCueStrike(power: number): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;
    const gainVal = 0.18 + Math.min(1, power) * 0.65;

    // Leather tip thwack
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220 + power * 180, now);
    osc.frequency.exponentialRampToValueAtTime(65, now + 0.055);
    g.gain.setValueAtTime(gainVal, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.065);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.07);

    // Subtle chalk transient click
    const clickOsc = ctx.createOscillator();
    const clickGain = ctx.createGain();
    clickOsc.type = 'sine';
    clickOsc.frequency.setValueAtTime(1650 + power * 550, now);
    clickOsc.frequency.exponentialRampToValueAtTime(420, now + 0.018);
    clickGain.gain.setValueAtTime(gainVal * 0.35, now);
    clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.02);
    clickOsc.connect(clickGain);
    clickGain.connect(this.sfxGain);
    clickOsc.start(now);
    clickOsc.stop(now + 0.025);
  }

  public playBallCollision(speed: number, posX = 0): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;
    const norm = Math.max(0.05, Math.min(1.0, speed / 5.5));
    const dest = this.createPanner(ctx, posX);

    // Crisp phenolic resin double-resonance clack (~2.3kHz + ~4.4kHz)
    for (const [freq, amp, dur] of [
      [2350 + Math.random() * 140, norm * 0.52, 0.038],
      [4420 + Math.random() * 220, norm * 0.28, 0.022],
    ] as const) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.72, now + dur);
      g.gain.setValueAtTime(amp, now);
      g.gain.exponentialRampToValueAtTime(0.0008, now + dur);
      osc.connect(g);
      g.connect(dest);
      osc.start(now);
      osc.stop(now + dur + 0.005);
    }
  }

  public playCushionHit(speed: number, posX = 0): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;
    const norm = Math.max(0.05, Math.min(1.0, speed / 5.0));
    const dest = this.createPanner(ctx, posX);

    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(145 + norm * 45, now);
    osc.frequency.exponentialRampToValueAtTime(48, now + 0.075);
    g.gain.setValueAtTime(norm * 0.42, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    osc.connect(g);
    g.connect(dest);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  public playPocketDrop(posX = 0): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;
    const dest = this.createPanner(ctx, posX);

    // Hollow leather cup drop
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(210, now);
    osc.frequency.exponentialRampToValueAtTime(75, now + 0.14);
    g.gain.setValueAtTime(0.45, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.connect(g);
    g.connect(dest);
    osc.start(now);
    osc.stop(now + 0.17);

    // Secondary leather rattle
    const rattle = ctx.createOscillator();
    const rGain = ctx.createGain();
    rattle.type = 'sine';
    rattle.frequency.setValueAtTime(340, now + 0.06);
    rattle.frequency.exponentialRampToValueAtTime(110, now + 0.17);
    rGain.gain.setValueAtTime(0.22, now + 0.06);
    rGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    rattle.connect(rGain);
    rGain.connect(dest);
    rattle.start(now + 0.06);
    rattle.stop(now + 0.19);
  }

  public playMenuClick(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(680, now);
    osc.frequency.exponentialRampToValueAtTime(320, now + 0.035);
    g.gain.setValueAtTime(0.14, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.045);
  }

  public playFoul(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;
    for (const [offset, freq] of [
      [0, 260],
      [0.11, 195],
    ] as const) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sawtooth';
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 600;
      osc.frequency.setValueAtTime(freq, now + offset);
      g.gain.setValueAtTime(0.14, now + offset);
      g.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.16);
      osc.connect(filter);
      filter.connect(g);
      g.connect(this.sfxGain);
      osc.start(now + offset);
      osc.stop(now + offset + 0.17);
    }
  }

  public playVictory(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      const t = now + idx * 0.095;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.22, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
      osc.connect(g);
      g.connect(this.sfxGain!);
      osc.start(t);
      osc.stop(t + 0.44);
    });
  }
}

export const soundEngine = new SoundEngine();
