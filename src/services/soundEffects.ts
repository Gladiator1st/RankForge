/**
 * Tactical Esports Web Audio API Sound Synthesizer & Audio File Player
 * Supports both high-fidelity UI synthesis and custom MP3/WAV/OGG match victory/defeat audio cues.
 */

class SoundEffectsService {
  private ctx: AudioContext | null = null;
  private volume: number = 0.5;
  private enabled: boolean = true;
  private matchSoundEnabled: boolean = true;
  private victorySoundPath: string = '';
  private defeatSoundPath: string = '';
  private currentAudio: HTMLAudioElement | null = null;

  constructor() {
    // Lazy initialize AudioContext on user interaction
  }

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        this.ctx = new AudioContextClass();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public setConfig(
    volume: number,
    enabled: boolean,
    matchSoundEnabled: boolean = true,
    victoryPath: string = '',
    defeatPath: string = ''
  ) {
    this.volume = Math.max(0, Math.min(1, volume));
    this.enabled = enabled;
    this.matchSoundEnabled = matchSoundEnabled;
    this.victorySoundPath = victoryPath || '';
    this.defeatSoundPath = defeatPath || '';

    if (this.currentAudio) {
      this.currentAudio.volume = this.volume;
    }
  }

  public stopCurrentAudio() {
    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
      } catch {}
      this.currentAudio = null;
    }
  }

  /**
   * Play an external or bundled audio file (e.g., custom MP3 or default victory/defeat).
   * Falls back to Web Audio API synthesizer if the file cannot be loaded.
   */
  private async playAudioFile(src: string, fallbackSynth: () => void) {
    if (!this.enabled || this.volume <= 0) return;
    this.stopCurrentAudio();

    try {
      let resolvedSrc = src;
      // If local filesystem path on desktop, read buffer through Electron IPC as data URI
      if (
        src &&
        !src.startsWith('data:') &&
        !src.startsWith('http://') &&
        !src.startsWith('https://') &&
        !src.startsWith('blob:')
      ) {
        if (window.rfrApi?.readAudioFile) {
          const dataUri = await window.rfrApi.readAudioFile(src);
          if (dataUri) {
            resolvedSrc = dataUri;
          }
        }
      }

      const audio = new Audio(resolvedSrc);
      audio.volume = this.volume;
      this.currentAudio = audio;

      audio.onended = () => {
        if (this.currentAudio === audio) {
          this.currentAudio = null;
        }
      };

      await audio.play();
    } catch (err) {
      console.warn('[SoundEffects] Failed to play audio file, using fallback synthesis:', err);
      fallbackSynth();
    }
  }

  /**
   * Play match victory sound (custom file or bundled default 'the-winner-takes-all')
   * Optional customPath parameter allows immediate preview in Settings.
   */
  public async playMatchVictorySound(customPath?: string) {
    const isManualTest = customPath !== undefined;
    if (!this.enabled || this.volume <= 0) return;
    if (!isManualTest && !this.matchSoundEnabled) return;

    const target = (customPath !== undefined ? customPath : this.victorySoundPath) || './sounds/victory.mp3';
    await this.playAudioFile(target, () => this.playSynthesizedVictory());
  }

  /**
   * Play match defeat sound (custom file or bundled default 'sadHorn')
   * Optional customPath parameter allows immediate preview in Settings.
   */
  public async playMatchDefeatSound(customPath?: string) {
    const isManualTest = customPath !== undefined;
    if (!this.enabled || this.volume <= 0) return;
    if (!isManualTest && !this.matchSoundEnabled) return;

    const target = (customPath !== undefined ? customPath : this.defeatSoundPath) || './sounds/defeat.mp3';
    await this.playAudioFile(target, () => this.playSynthesizedDefeat());
  }

  /**
   * Synthesized Victory fanfare fallback (Major ascending triad & shimmer)
   */
  public playSynthesizedVictory() {
    if (!this.enabled || this.volume <= 0) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const chords = [392.0, 523.25, 659.25, 783.99, 1046.5];
    chords.forEach((freq, idx) => {
      const startTime = ctx.currentTime + idx * 0.09;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(this.volume * 0.35, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.65);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + 0.65);
    });
  }

  /**
   * Synthesized Defeat cue fallback (Somber descending tactical minor cadence)
   */
  public playSynthesizedDefeat() {
    if (!this.enabled || this.volume <= 0) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const chords = [311.13, 261.63, 207.65, 164.81]; // Eb4 -> C4 -> Ab3 -> E3
    chords.forEach((freq, idx) => {
      const startTime = ctx.currentTime + idx * 0.15;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, startTime);
      osc.frequency.linearRampToValueAtTime(freq * 0.95, startTime + 0.4);

      gain.gain.setValueAtTime(this.volume * 0.25, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.55);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + 0.55);
    });
  }

  /**
   * Crisp, tactical Valorant-style button click
   */
  public playTacticalClick() {
    if (!this.enabled || this.volume <= 0) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.04);

    gain.gain.setValueAtTime(this.volume * 0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.04);
  }

  /**
   * Ticking double-chime when First Win is ready (+1,000 AP)
   */
  public playFirstWinChime() {
    if (!this.enabled || this.volume <= 0) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const notes = [587.33, 880]; // D5, A5
    notes.forEach((freq, i) => {
      const startTime = ctx.currentTime + i * 0.09;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(this.volume * 0.35, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.25);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + 0.25);
    });
  }

  /**
   * Crisp, normal tactical click for launching
   */
  public playLaunchSound() {
    this.playTacticalClick();
  }

  /**
   * Celebratory Level 20 Ready for Rank fanfare
   */
  public playLevelUpFanfare() {
    if (!this.enabled || this.volume <= 0) return;
    const ctx = this.getContext();
    if (!ctx) return;

    // Triumphant chord: C5 -> E5 -> G5 -> C6
    const chords = [523.25, 659.25, 783.99, 1046.5];
    chords.forEach((freq, idx) => {
      const startTime = ctx.currentTime + idx * 0.1;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(this.volume * 0.4, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.6);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + 0.6);
    });
  }

  /**
   * Clean confirmation ding for copied delivery slips & saved settings
   */
  public playSuccessDing() {
    if (!this.enabled || this.volume <= 0) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(987.77, ctx.currentTime); // B5
    osc.frequency.exponentialRampToValueAtTime(1318.51, ctx.currentTime + 0.15); // E6

    gain.gain.setValueAtTime(this.volume * 0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  }

  /**
   * Tactical error buzz for invalid inputs or duplicate usernames
   */
  public playErrorBuzz() {
    if (!this.enabled || this.volume <= 0) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(100, ctx.currentTime + 0.18);

    gain.gain.setValueAtTime(this.volume * 0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.18);
  }
}

export const sound = new SoundEffectsService();
