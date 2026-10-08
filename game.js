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
    }

    unlock() {
      try {
        if (!this.context) {
          const Audio = window.AudioContext || window.webkitAudioContext;
          if (!Audio) return;
          this.context = new Audio();
          this.master = this.context.createGain();
          this.master.gain.value = muted ? 0 : 0.14;
          this.master.connect(this.context.destination);
        }
        if (this.context.state === 'suspended') this.context.resume().catch(() => {});
      } catch (_) { /* The game also works when browser audio is unavailable. */ }
    }

    tone(frequency, duration, type = 'sine', endFrequency = frequency, delay = 0, volume = 0.35) {
      if (!this.context || muted || game.paused) return;
      const time = this.context.currentTime + delay;
      const oscillator = this.context.createOscillator();
      const envelope = this.context.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, time);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), time + duration);
      envelope.gain.setValueAtTime(0.001, time);
      envelope.gain.linearRampToValueAtTime(volume, time + 0.005);
      envelope.gain.exponentialRampToValueAtTime(0.001, time + duration);
      oscillator.connect(envelope);
      envelope.connect(this.master);
      oscillator.start(time);
      oscillator.stop(time + duration + 0.02);
      oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
    }

    play(event) {
      if (event === 'shoot') this.tone(880, 0.07, 'triangle', 260, 0, 0.2);
      if (event === 'kill') this.tone(190, 0.13, 'sawtooth', 45, 0, 0.24);
      if (event === 'damage') this.tone(100, 0.3, 'sawtooth', 25, 0, 0.45);
      if (['start', 'wave', 'clear'].includes(event)) {
        [440, 554, 660].forEach((frequency, i) => this.tone(frequency, 0.15, 'triangle', frequency, i * 0.085));
      }
      if (event === 'gameover') {
        [330, 260, 165].forEach((frequency, i) => this.tone(frequency, 0.24, 'triangle', frequency, i * 0.16));
      }
    }

    silence(paused) {
      if (this.master) this.master.gain.setTargetAtTime(muted || paused ? 0 : 0.14, this.context.currentTime, 0.02);
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
