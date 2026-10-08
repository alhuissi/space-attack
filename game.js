(function () {
  'use strict';

  const byId = id => document.getElementById(id);
  const canvas = byId('game-canvas');
  const game = new SpaceAttackCore.Game();
  const renderer = new SpaceAttackRenderer(canvas);
  const keys = new Set();
  const ui = Object.fromEntries(['score', 'best', 'wave', 'lives', 'status', 'start-screen', 'gameover-screen', 'pause-screen', 'final-score', 'final-wave', 'wave-banner', 'wave-banner-title', 'wave-banner-subtitle', 'mute-button', 'pause-button'].map(id => [id, byId(id)]));
  let best = 0;
  let muted = false;
  try {
    best = Number(localStorage.getItem('space-attack-best')) || 0;
    muted = localStorage.getItem('space-attack-muted') === 'true';
  } catch (_) { /* Storage is optional, including when opening the file directly. */ }

  class Sound {
    constructor() {
      this.context = null;
      this.master = null;
      this.voices = new Set();
      this.musicStep = -1;
    }

    unlock() {
      try {
        if (!this.context) {
          const Audio = window.AudioContext || window.webkitAudioContext;
          if (!Audio) return;
          this.context = new Audio();
          this.master = this.context.createGain();
          this.master.gain.value = muted || game.paused ? 0 : 0.14;
          this.master.connect(this.context.destination);
          this.noiseBuffer = this.context.createBuffer(1, Math.ceil(this.context.sampleRate * 0.4), this.context.sampleRate);
          const samples = this.noiseBuffer.getChannelData(0);
          for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
        }
        if (this.context.state === 'suspended') this.context.resume().catch(() => {});
      } catch (_) { /* The game also works when browser audio is unavailable. */ }
    }

    voice(source, duration, delay, volume, filter = null, music = false) {
      const time = this.context.currentTime + delay;
      const envelope = this.context.createGain();
      envelope.gain.setValueAtTime(0.001, time);
      envelope.gain.linearRampToValueAtTime(volume, time + 0.008);
      envelope.gain.exponentialRampToValueAtTime(0.001, time + duration);
      source.connect(filter || envelope);
      if (filter) filter.connect(envelope);
      envelope.connect(this.master);
      const voice = { source, envelope, filter, music };
      this.voices.add(voice);
      source.onended = () => {
        source.disconnect(); envelope.disconnect();
        if (filter) filter.disconnect();
        this.voices.delete(voice);
      };
      source.start(time);
      source.stop(time + duration + 0.02);
    }

    tone(frequency, duration, type = 'sine', endFrequency = frequency, delay = 0, volume = 0.35, music = false) {
      if (!this.context || muted || game.paused) return;
      const time = this.context.currentTime + delay;
      const oscillator = this.context.createOscillator();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, time);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), time + duration);
      this.voice(oscillator, duration, delay, volume, null, music);
    }

    noise(duration, cutoff, volume) {
      if (!this.context || !this.noiseBuffer || muted || game.paused) return;
      const source = this.context.createBufferSource();
      source.buffer = this.noiseBuffer;
      source.playbackRate.value = 0.94 + Math.random() * 0.12;
      const filter = this.context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = cutoff;
      this.voice(source, duration, 0, volume, filter);
    }

    play(event) {
      // Audio variation is independent of the simulation's random number source.
      const variation = 0.93 + Math.random() * 0.14;
      if (event === 'shoot') this.tone(880 * variation, 0.065 * variation, 'triangle', 260, 0, 0.18 * variation);
      if (event === 'kill') {
        this.tone(185 * variation, 0.13 * variation, 'sawtooth', 46, 0, 0.22);
        this.noise(0.12, 1500, 0.18 * variation);
      }
      if (event === 'killDiver') {
        this.tone(470 * variation, 0.07, 'square', 700, 0, 0.1);
        this.tone(270 * variation, 0.14 * variation, 'triangle', 58, 0.035, 0.27);
        this.noise(0.13, 2800, 0.14 * variation);
      }
      if (event === 'killSpread') {
        this.tone(105 * variation, 0.23 * variation, 'sine', 28, 0, 0.43);
        this.tone(165 * variation, 0.15, 'triangle', 36, 0.025, 0.19);
        this.noise(0.23, 700, 0.3 * variation);
      }
      if (event === 'damage') {
        this.tone(83, 0.3, 'sawtooth', 31, 0, 0.36);
        this.tone(65, 0.17, 'square', 43, 0.15, 0.16);
        this.noise(0.18, 470, 0.18);
      }
      if (event === 'start' || event === 'wave') {
        [330, 440].forEach((frequency, i) => this.tone(frequency, 0.13, 'triangle', frequency, i * 0.12, 0.2));
      }
      if (event === 'clear') {
        [523.25, 659.25, 783.99, 1046.5].forEach((frequency, i) => this.tone(frequency, i === 3 ? 0.29 : 0.12, 'triangle', frequency, i * 0.085, 0.22));
        this.tone(523.25, 0.26, 'sine', 523.25, 0.255, 0.17);
      }
      if (event === 'powerup') {
        [660, 990, 1320].forEach((frequency, i) => this.tone(frequency, 0.16, 'sine', frequency * 1.15, i * 0.065, 0.25));
      }
      if (event === 'powerupEnding') {
        [880, 660].forEach((frequency, i) => this.tone(frequency, 0.09, 'sine', frequency, i * 0.14, 0.14));
      }
      if (event === 'powerupExpired') this.tone(440, 0.17, 'triangle', 220, 0, 0.16);
      if (event === 'gameover') {
        [330, 260, 165].forEach((frequency, i) => this.tone(frequency, 0.24, 'triangle', frequency, i * 0.16, 0.25));
      }
    }

    stopVoices(musicOnly = false) {
      for (const voice of [...this.voices]) {
        if (musicOnly && !voice.music) continue;
        try { voice.source.stop(); } catch (_) {}
      }
      this.musicStep = -1;
    }

    reset() { this.stopVoices(); }

    silence(paused) {
      if (!this.master) return;
      if (muted || paused) this.stopVoices();
      const time = this.context.currentTime;
      this.master.gain.cancelScheduledValues(time);
      this.master.gain.setTargetAtTime(muted || paused ? 0 : 0.14, time, 0.008);
    }

    update(time, stage) {
      if (!this.context || muted || game.paused || stage !== 'playing') {
        if (this.musicStep !== -1) this.stopVoices(true);
        return;
      }
      // A quiet six-second motif follows game time; pausing never queues a backlog.
      const step = Math.floor(time / 0.375);
      if (step === this.musicStep) return;
      this.musicStep = step;
      const notes = [220, 0, 330, 0, 392, 0, 330, 0, 196, 0, 293.66, 0, 349.23, 0, 293.66, 0];
      const note = notes[step % notes.length];
      if (note) this.tone(note, 0.28, 'triangle', note, 0, 0.035, true);
      if (step % 4 === 0) {
        const bass = step % 16 < 8 ? 110 : 98;
        this.tone(bass, 0.38, 'sine', bass, 0, 0.045, true);
      }
    }
  }

  const sound = new Sound();
  const formatScore = value => String(value).padStart(6, '0');
  let lastUiState = '';

  function updateUi() {
    const state = [game.stage, game.paused, game.score, best, game.wave, game.lives, muted, game.waveBanner > 0, game.nextWaveTimer > 0].join('|');
    if (state === lastUiState) return;
    lastUiState = state;
    ui.score.textContent = formatScore(game.score);
    ui.best.textContent = formatScore(best);
    ui.wave.textContent = String(game.wave).padStart(2, '0');
    [...ui.lives.children].forEach((life, index) => life.classList.toggle('lost', index >= game.lives));
    ui.lives.setAttribute('aria-label', `${game.lives} ${game.lives === 1 ? 'life' : 'lives'} remaining`);
    ui['start-screen'].hidden = game.stage !== 'start';
    ui['gameover-screen'].hidden = game.stage !== 'gameover';
    ui['pause-screen'].hidden = !game.paused;
    ui['final-score'].textContent = formatScore(game.score);
    ui['final-wave'].textContent = String(game.wave).padStart(2, '0');
    ui['wave-banner'].hidden = game.stage !== 'playing' || game.paused || (game.waveBanner <= 0 && game.nextWaveTimer <= 0);
    ui['wave-banner-title'].textContent = game.nextWaveTimer > 0 ? 'SECTOR CLEAR' : `WAVE ${String(game.wave).padStart(2, '0')}`;
    ui['wave-banner-subtitle'].textContent = game.nextWaveTimer > 0 ? 'Next formation incoming' : 'Incoming formation';
    ui.status.textContent = game.stage === 'start' ? 'AWAITING PILOT' : game.stage === 'gameover' ? 'SIGNAL LOST' : game.paused ? 'MISSION PAUSED' : 'MISSION ACTIVE';
    ui.status.dataset.state = game.stage === 'playing' && !game.paused ? 'active' : 'idle';
    ui['pause-button'].disabled = game.stage !== 'playing';
    ui['pause-button'].querySelector('path').setAttribute('d', game.paused ? 'M6 4l10 6-10 6z' : 'M6 4v12M14 4v12');
    ui['pause-button'].title = game.paused ? 'Resume (P)' : 'Pause (P)';
    ui['pause-button'].setAttribute('aria-label', game.paused ? 'Resume game (P)' : 'Pause game (P)');
    ui['mute-button'].querySelector('path').setAttribute('d', muted ? 'M3 7h3l4-3v12l-4-3H3zM13 6l5 8M18 6l-5 8' : 'M3 7h3l4-3v12l-4-3H3zM13 7c2 1.6 2 4.4 0 6M15.5 4.5c4 3 4 8 0 11');
    ui['mute-button'].title = muted ? 'Unmute (M)' : 'Mute (M)';
    ui['mute-button'].setAttribute('aria-pressed', String(muted));
    ui['mute-button'].setAttribute('aria-label', muted ? 'Unmute sound (M)' : 'Mute sound (M)');
  }

  function start() {
    keys.clear();
    sound.unlock();
    sound.reset();
    sound.silence(false);
    game.start();
    updateUi();
    canvas.focus({ preventScroll: true });
  }

  function pause(paused) {
    keys.clear();
    game.setPaused(paused);
    sound.silence(game.paused);
    updateUi();
    if (paused && game.stage === 'playing') byId('resume-button').focus({ preventScroll: true });
    else if (game.stage === 'playing') canvas.focus({ preventScroll: true });
  }

  function toggleMute() {
    sound.unlock();
    muted = !muted;
    sound.silence(game.paused);
    try { localStorage.setItem('space-attack-muted', String(muted)); } catch (_) {}
    updateUi();
  }

  byId('start-button').addEventListener('click', start);
  byId('restart-button').addEventListener('click', start);
  byId('resume-button').addEventListener('click', () => pause(false));
  ui['pause-button'].addEventListener('click', () => pause(!game.paused));
  ui['mute-button'].addEventListener('click', toggleMute);
  canvas.addEventListener('pointerdown', () => canvas.focus({ preventScroll: true }));

  const gameplayKeys = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space']);
  window.addEventListener('keydown', event => {
    if (gameplayKeys.has(event.code)) event.preventDefault();
    if (event.repeat) return;
    if (event.code === 'KeyM') { event.preventDefault(); toggleMute(); return; }
    if (event.code === 'KeyP' || event.code === 'Escape') {
      event.preventDefault();
      if (game.stage === 'playing') pause(!game.paused);
      return;
    }
    if (event.code === 'Enter' && event.target.tagName !== 'BUTTON') {
      event.preventDefault();
      if (game.stage !== 'playing') start();
      else if (game.paused) pause(false);
      return;
    }
    if (event.code === 'KeyR' && game.stage === 'gameover') { event.preventDefault(); start(); return; }
    if (game.stage === 'playing' && !game.paused && gameplayKeys.has(event.code)) {
      keys.add(event.code);
      sound.unlock();
    }
  });
  window.addEventListener('keyup', event => {
    if (gameplayKeys.has(event.code)) event.preventDefault();
    keys.delete(event.code);
  });
  window.addEventListener('blur', () => {
    keys.clear();
    if (game.stage === 'playing') pause(true);
  });
  document.addEventListener('visibilitychange', () => {
    keys.clear();
    if (document.hidden && game.stage === 'playing') pause(true);
  });

  const observer = new ResizeObserver(() => renderer.resize());
  observer.observe(canvas);
  window.addEventListener('resize', () => renderer.resize());
  renderer.resize();
  let previousTime = null;
  let previousStage = game.stage;
  function frame(timestamp) {
    const dt = previousTime === null ? 0 : Math.min((timestamp - previousTime) / 1000, 0.05);
    previousTime = timestamp;
    game.update(dt, {
      left: keys.has('ArrowLeft') || keys.has('KeyA'),
      right: keys.has('ArrowRight') || keys.has('KeyD'),
      up: keys.has('ArrowUp') || keys.has('KeyW'),
      down: keys.has('ArrowDown') || keys.has('KeyS'),
      fire: keys.has('Space'),
    });
    if (game.score > best) {
      best = game.score;
      try { localStorage.setItem('space-attack-best', String(best)); } catch (_) {}
    }
    for (const event of game.events.splice(0)) sound.play(event);
    sound.update(game.time, game.stage);
    updateUi();
    if (previousStage !== game.stage && game.stage === 'gameover') {
      keys.clear();
      byId('restart-button').focus({ preventScroll: true });
    }
    previousStage = game.stage;
    renderer.draw(game, timestamp / 1000, dt);
    requestAnimationFrame(frame);
  }
  updateUi();
  requestAnimationFrame(frame);
})();
