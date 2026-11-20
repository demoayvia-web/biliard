import { getLegalTargetBallIds } from '../game/rules.ts';
import type { MatchState, ShotOutcomeSummary } from '../game/types.ts';

export interface CrowdStakesSnapshot {
  stakes: number; // 0..1
  isProfessional: boolean;
  isSandbox: boolean;
}

export function computeCrowdStakes(state: MatchState): CrowdStakesSnapshot {
  const isProfessional =
    state.players[0].aiDifficulty === 'professional' ||
    state.players[1].aiDifficulty === 'professional';
  const isSandbox = state.gameMode === 'practice' || state.gameMode === 'trick_shot';

  if (isSandbox) {
    return { stakes: 0.08, isProfessional: false, isSandbox: true };
  }

  let stakes = 0.18;
  if (state.isBreakShot) {
    stakes += 0.22;
  }

  if (state.gameMode === 'daily_challenge' && state.dailyChallenge) {
    const remainingShots = state.dailyChallenge.maxShots - state.dailyChallenge.shotsTaken;
    if (remainingShots <= 1) stakes += 0.55;
    else stakes += 0.25;
  } else {
    const legal = getLegalTargetBallIds(state);
    if (
      (state.gameMode === '8-ball' && legal.includes(8)) ||
      (state.gameMode === '9-ball' && legal.includes(9))
    ) {
      stakes += 0.58;
    }

    const activeBalls = state.balls.filter((b) => b.id > 0 && !b.pocketed);
    if (activeBalls.length <= 4) {
      stakes += 0.24;
    } else if (activeBalls.length <= 8) {
      stakes += 0.1;
    }
  }

  if (isProfessional) {
    stakes = Math.min(1, stakes * 1.2 + 0.12);
  }

  return {
    stakes: Math.max(0, Math.min(1, stakes)),
    isProfessional,
    isSandbox,
  };
}

/**
 * Procedural Web Audio API crowd & venue atmosphere controller.
 * Dynamically shapes audience chatter, tense murmurs, and applause swells
 * based on match stakes, shot outcomes, and 'Professional' AI difficulty intensity.
 */
export class AmbientCrowdController {
  private ctx: AudioContext | null = null;
  private outputGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private started = false;
  private chatterLowGain: GainNode | null = null;
  private chatterMidGain: GainNode | null = null;
  private chatterMidFilter: BiquadFilterNode | null = null;
  private chatterSources: AudioBufferSourceNode[] = [];
  private lfoOscs: OscillatorNode[] = [];

  private currentStakes = 0.15;
  private currentIsProfessional = false;

  public init(ctx: AudioContext, destination: GainNode): void {
    if (this.ctx === ctx && this.started) return;
    this.ctx = ctx;

    this.outputGain = ctx.createGain();
    this.outputGain.gain.value = 1.0;
    this.outputGain.connect(destination);

    this.noiseBuffer = this.createPinkNoiseBuffer(ctx, 4.0);
    this.startChatterBed(ctx);
  }

  private createPinkNoiseBuffer(ctx: AudioContext, durationSec: number): AudioBuffer {
    const sampleRate = ctx.sampleRate;
    const length = Math.floor(sampleRate * durationSec);
    const buffer = ctx.createBuffer(2, length, sampleRate);

    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      let b0 = 0;
      let b1 = 0;
      let b2 = 0;
      let b3 = 0;
      let b4 = 0;
      let b5 = 0;
      let b6 = 0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.065;
        b6 = white * 0.115926;
      }
      // Crossfade loop seam (first/last 2048 samples) for seamless looping
      const fadeSamples = Math.min(2048, Math.floor(length / 8));
      for (let i = 0; i < fadeSamples; i++) {
        const t = i / fadeSamples;
        const tailIdx = length - fadeSamples + i;
        const blended = data[i] * t + data[tailIdx] * (1 - t);
        data[i] = blended;
        data[tailIdx] = blended;
      }
    }
    return buffer;
  }

  private startChatterBed(ctx: AudioContext): void {
    if (this.started || !this.noiseBuffer || !this.outputGain) return;
    this.started = true;

    // Warm low-mid room murmur (340 Hz)
    const lowSrc = ctx.createBufferSource();
    lowSrc.buffer = this.noiseBuffer;
    lowSrc.loop = true;
    const lowFilter = ctx.createBiquadFilter();
    lowFilter.type = 'bandpass';
    lowFilter.frequency.value = 340;
    lowFilter.Q.value = 1.15;
    this.chatterLowGain = ctx.createGain();
    this.chatterLowGain.gain.value = 0.0;

    lowSrc.connect(lowFilter);
    lowFilter.connect(this.chatterLowGain);
    this.chatterLowGain.connect(this.outputGain);
    lowSrc.start();

    // Conversational mid-band crowd chatter (880 Hz)
    const midSrc = ctx.createBufferSource();
    midSrc.buffer = this.noiseBuffer;
    midSrc.loop = true;
    midSrc.playbackRate.value = 0.94;
    this.chatterMidFilter = ctx.createBiquadFilter();
    this.chatterMidFilter.type = 'bandpass';
    this.chatterMidFilter.frequency.value = 880;
    this.chatterMidFilter.Q.value = 1.4;
    this.chatterMidGain = ctx.createGain();
    this.chatterMidGain.gain.value = 0.0;

    // Gentle LFO breathing on crowd chatter so it feels organic
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.19;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.05;
    lfo.connect(lfoGain);
    lfoGain.connect(this.chatterMidGain.gain);
    lfo.start();

    midSrc.connect(this.chatterMidFilter);
    this.chatterMidFilter.connect(this.chatterMidGain);
    this.chatterMidGain.connect(this.outputGain);
    midSrc.start();

    this.chatterSources.push(lowSrc, midSrc);
    this.lfoOscs.push(lfo);
  }

  public updateContext(state: MatchState | null, activeInMatch: boolean): void {
    if (!this.ctx || !this.chatterLowGain || !this.chatterMidGain || !this.chatterMidFilter) {
      return;
    }

    const now = this.ctx.currentTime;
    if (!activeInMatch || !state) {
      this.chatterLowGain.gain.setTargetAtTime(0.0, now, 0.25);
      this.chatterMidGain.gain.setTargetAtTime(0.0, now, 0.25);
      return;
    }

    const { stakes, isProfessional, isSandbox } = computeCrowdStakes(state);
    this.currentStakes = stakes;
    this.currentIsProfessional = isProfessional;

    // Professional AI scales arena crowd density & dynamic hush/chatter contrast
    const proScale = isProfessional ? 1.55 : 1.0;
    const modeScale = isSandbox ? 0.38 : 1.0;

    // High-stakes aiming creates subtle pre-shot hush; shooting/post-shot lifts murmur
    const isHighStakesAim = state.phase === 'aiming' && stakes > 0.55;
    const tensionDuck = isHighStakesAim ? (isProfessional ? 0.52 : 0.68) : 1.0;

    const targetLow = (0.14 + stakes * 0.16) * proScale * modeScale * tensionDuck;
    const targetMid = (0.07 + stakes * 0.14) * proScale * modeScale * tensionDuck;
    const targetCutoff = isHighStakesAim ? 720 : 880 + stakes * 320 + (isProfessional ? 140 : 0);

    this.chatterLowGain.gain.setTargetAtTime(targetLow, now, 0.35);
    this.chatterMidGain.gain.setTargetAtTime(targetMid, now, 0.35);
    this.chatterMidFilter.frequency.setTargetAtTime(targetCutoff, now, 0.4);
  }

  public triggerMurmur(intensity: number, isProfessional = this.currentIsProfessional): void {
    if (!this.ctx || !this.outputGain || !this.noiseBuffer) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const proMult = isProfessional ? 1.48 : 1.0;
    const amp = Math.min(0.85, Math.max(0.15, intensity) * 0.42 * proMult);
    const dur = 1.15 + intensity * 0.65;

    // Collective "ooooh / murmur" dual formant swell
    for (const [startFreq, endFreq, gainScale] of [
      [340, 235, 1.0],
      [740, 510, 0.65],
    ] as const) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      src.playbackRate.value = 0.85 + Math.random() * 0.2;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.value = 2.1;
      filter.frequency.setValueAtTime(startFreq, now);
      filter.frequency.exponentialRampToValueAtTime(endFreq, now + dur);

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.001, now);
      g.gain.linearRampToValueAtTime(amp * gainScale, now + 0.22);
      g.gain.exponentialRampToValueAtTime(0.001, now + dur);

      src.connect(filter);
      filter.connect(g);
      g.connect(this.outputGain);
      src.start(now, Math.random() * 1.5, dur + 0.05);
      src.stop(now + dur + 0.06);
    }

    // Briefly lift chatter after murmur reaction
    if (this.chatterMidGain) {
      this.chatterMidGain.gain.setTargetAtTime(0.24 * proMult, now + 0.15, 0.25);
    }
  }

  public triggerApplause(
    intensity: number,
    isProfessional = this.currentIsProfessional,
    durationSec?: number,
  ): void {
    if (!this.ctx || !this.outputGain || !this.noiseBuffer) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const proMult = isProfessional ? 1.55 : 1.0;
    const clamped = Math.max(0.18, Math.min(1.0, intensity));
    const dur = durationSec ?? (1.35 + clamped * 1.55 + (isProfessional ? 0.45 : 0));

    // 1. Broadband arena applause wash
    const washSrc = ctx.createBufferSource();
    washSrc.buffer = this.noiseBuffer;
    washSrc.loop = true;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1450 + clamped * 600, now);
    bp.Q.value = 0.75;

    const washGain = ctx.createGain();
    const peakWash = Math.min(0.95, clamped * 0.46 * proMult);
    washGain.gain.setValueAtTime(0.001, now);
    washGain.gain.linearRampToValueAtTime(peakWash, now + 0.18);
    washGain.gain.setValueAtTime(peakWash * 0.88, now + dur * 0.42);
    washGain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    washSrc.connect(bp);
    bp.connect(washGain);
    washGain.connect(this.outputGain);
    washSrc.start(now, Math.random() * 1.5);
    washSrc.stop(now + dur + 0.05);

    // 2. Staggered stereo hand-clap transients for natural crowd texture
    const clapCount = Math.min(34, Math.round((8 + clamped * 14) * (isProfessional ? 1.45 : 1.0)));
    for (let i = 0; i < clapCount; i++) {
      const progress = i / clapCount;
      const offset = 0.04 + progress * dur * 0.82 + Math.random() * 0.08;
      const clapDur = 0.022 + Math.random() * 0.018;
      const envFade = progress < 0.15 ? 0.75 : 1 - (progress - 0.15) * 0.65;

      const cSrc = ctx.createBufferSource();
      cSrc.buffer = this.noiseBuffer;

      const cFilter = ctx.createBiquadFilter();
      cFilter.type = 'bandpass';
      cFilter.frequency.value = 1750 + Math.random() * 1650;
      cFilter.Q.value = 1.6;

      const cGain = ctx.createGain();
      const cAmp = Math.min(0.45, clamped * 0.16 * proMult * envFade);
      cGain.gain.setValueAtTime(0.001, now + offset);
      cGain.gain.linearRampToValueAtTime(cAmp, now + offset + 0.004);
      cGain.gain.exponentialRampToValueAtTime(0.001, now + offset + clapDur);

      cSrc.connect(cFilter);
      cFilter.connect(cGain);
      if (typeof ctx.createStereoPanner === 'function') {
        const pan = ctx.createStereoPanner();
        pan.pan.value = (Math.random() * 2 - 1) * 0.82;
        cGain.connect(pan);
        pan.connect(this.outputGain);
      } else {
        cGain.connect(this.outputGain);
      }

      cSrc.start(now + offset, Math.random() * 2.5, clapDur + 0.01);
      cSrc.stop(now + offset + clapDur + 0.015);
    }
  }

  public reactToShotOutcome(
    prevMatch: MatchState,
    nextMatch: MatchState,
    summary: ShotOutcomeSummary,
  ): void {
    const { stakes, isProfessional, isSandbox } = computeCrowdStakes(prevMatch);
    this.currentStakes = stakes;
    this.currentIsProfessional = isProfessional;

    // 1. Victory / Match Won / Daily Challenge Completed
    if (nextMatch.phase === 'game_over') {
      if (nextMatch.gameMode === 'daily_challenge') {
        if (nextMatch.dailyChallenge?.completed) {
          this.triggerApplause(0.95, isProfessional, isProfessional ? 3.2 : 2.5);
        } else {
          this.triggerMurmur(0.72, isProfessional);
        }
        return;
      }

      const humanWon =
        nextMatch.playMode === 'ai'
          ? nextMatch.winnerIndex === 0
          : nextMatch.winnerIndex !== null;

      if (humanWon) {
        this.triggerApplause(1.0, isProfessional, isProfessional ? 3.4 : 2.6);
      } else {
        // AI win in Professional tournament still gets respectful arena applause + murmur
        if (isProfessional) {
          this.triggerApplause(0.65, true, 2.2);
        } else {
          this.triggerMurmur(0.75, false);
        }
      }
      return;
    }

    // Quiet sandbox modes only softly respond to multi-pots or scratches
    if (isSandbox) {
      if (summary.cueBallPocketed || nextMatch.lastFoul) {
        this.triggerMurmur(0.28, false);
      } else if (summary.pocketedBallIds.length >= 2) {
        this.triggerApplause(0.34, false, 1.2);
      }
      return;
    }

    // 2. Foul or Scratch -> Crowd Murmur / Gasp
    if (nextMatch.lastFoul || summary.cueBallPocketed) {
      const murmurIntensity = Math.min(1.0, 0.45 + stakes * 0.5);
      this.triggerMurmur(murmurIntensity, isProfessional);
      return;
    }

    // 3. Legal Pot(s) -> Applause scaled by pot count, bank complexity, and stakes
    const pots = summary.pocketedBallIds.length;
    if (pots > 0) {
      const multiBonus = Math.min(0.36, (pots - 1) * 0.22);
      const bankBonus = summary.railContactsAfterFirstHit >= 1 ? 0.16 : 0;
      const applauseIntensity = Math.min(1.0, 0.36 + stakes * 0.4 + multiBonus + bankBonus);
      this.triggerApplause(applauseIntensity, isProfessional);
      return;
    }

    // 4. Dry / Missed High-Stakes Shot -> Tense Murmur
    if (stakes >= 0.48) {
      this.triggerMurmur(0.32 + stakes * 0.32, isProfessional);
    }
  }

  public getDebugStakes(): { stakes: number; isProfessional: boolean } {
    return { stakes: this.currentStakes, isProfessional: this.currentIsProfessional };
  }

  public dispose(): void {
    for (const s of this.chatterSources) {
      try {
        s.stop();
        s.disconnect();
      } catch {
        // Ignore already stopped sources
      }
    }
    for (const osc of this.lfoOscs) {
      try {
        osc.stop();
        osc.disconnect();
      } catch {
        // Ignore already stopped oscillators
      }
    }
    this.chatterSources = [];
    this.lfoOscs = [];
    this.started = false;
  }
}
