/* ============================================================================
   MOTOR DE ÁUDIO SINTÉTICO (WEB AUDIO API — ZERO MP3 EXTERNOS)
   ============================================================================ */
export const SoundEngine = {
  ctx: null,
  muted: false,

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
  },

  toggleMute() {
    this.muted = !this.muted;
    return this.muted;
  },

  playNoise(duration, filterType, freqStart, freqEnd, gainPeak, delay = 0) {
    if (this.muted || !this.ctx) return;
    const now = this.ctx.currentTime + delay;
    const bufferSize = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(freqStart, now);
    if (freqEnd !== freqStart) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), now + duration);
    }

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(gainPeak, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    src.start(now);
    src.stop(now + duration);
  },

  playTone(freqStart, freqEnd, duration, type, gainPeak, delay = 0) {
    if (this.muted || !this.ctx) return;
    const now = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, now);
    if (freqEnd !== freqStart) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(30, freqEnd), now + duration);
    }

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(gainPeak, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + duration);
  },

  shuffle() {
    this.init();
    for (let i = 0; i < 7; i++) {
      this.playNoise(0.045, "bandpass", 1800 + i * 120, 900, 0.14, i * 0.038);
    }
  },

  card() {
    this.init();
    this.playNoise(0.055, "highpass", 1500, 700, 0.16, 0);
    this.playTone(220, 90, 0.04, "sine", 0.08, 0);
  },

  chip(delay = 0) {
    this.init();
    this.playTone(2550, 2400, 0.055, "sine", 0.11, delay);
    this.playTone(3900, 3600, 0.04, "triangle", 0.07, delay);
    this.playTone(2800, 2600, 0.05, "sine", 0.08, delay + 0.045);
  },

  allIn() {
    this.init();
    for (let i = 0; i < 5; i++) this.chip(i * 0.065);
  },

  check() {
    this.init();
    this.playTone(170, 65, 0.06, "sine", 0.22, 0);
    this.playTone(160, 60, 0.06, "sine", 0.18, 0.11);
  },

  fold() {
    this.init();
    this.playNoise(0.14, "lowpass", 950, 240, 0.15, 0);
  },

  tick(urgent = false) {
    this.init();
    this.playTone(urgent ? 1046 : 784, urgent ? 1046 : 784, 0.055, "sine", 0.09, 0);
  },

  myTurn() {
    this.init();
    this.playTone(587.33, 587.33, 0.09, "triangle", 0.08, 0);
    this.playTone(880, 880, 0.14, "triangle", 0.09, 0.09);
  },

  win() {
    this.init();
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((n, i) => this.playTone(n, n, 0.24, "triangle", 0.11, i * 0.09));
  },

  playEvent(type) {
    if (type === "shuffle") this.shuffle();
    else if (type === "card") this.card();
    else if (type === "chip") this.chip();
    else if (type === "allin") this.allIn();
    else if (type === "check") this.check();
    else if (type === "fold") this.fold();
    else if (type === "win") this.win();
  }
};

document.addEventListener("pointerdown", () => SoundEngine.init(), { once: true });

/* === FIM DO FICHEIRO audio.js === */
