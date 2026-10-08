/* Tests the actual browser controller without browser or package dependencies. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const core = require('../engine.js');

function controller() {
  const windowListeners = new Map();
  const documentListeners = new Map();
  const frames = [];
  const stored = new Map();
  const elements = new Map();
  let game;
  let timestamp = 0;
  let activeElement;

  function element(id) {
    const listeners = new Map();
    const attributes = new Map();
    const classes = new Set();
    const result = {
      id,
      tagName: id.endsWith('-button') ? 'BUTTON' : id === 'game-canvas' ? 'CANVAS' : 'DIV',
      textContent: '',
      hidden: false,
      disabled: false,
      dataset: {},
      children: [],
      classList: { toggle(name, on) { on ? classes.add(name) : classes.delete(name); }, contains(name) { return classes.has(name); } },
      setAttribute(name, value) { attributes.set(name, value); },
      getAttribute(name) { return attributes.get(name); },
      addEventListener(name, callback) { listeners.set(name, callback); },
      focus() { activeElement = result; },
      querySelector() { return result; },
      click() { listeners.get('click')?.({ target: result }); },
    };
    return result;
  }

  const document = {
    hidden: false,
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, element(id));
      return elements.get(id);
    },
    addEventListener(name, callback) { documentListeners.set(name, callback); },
  };
  document.getElementById('lives').children = [element('life-0'), element('life-1'), element('life-2')];

  class CapturedGame extends core.Game {
    constructor() {
      super({ random: () => 0.5 });
      game = this;
    }
  }
  class Renderer {
    resize() {}
    draw() {}
  }
  const window = { addEventListener(name, callback) { windowListeners.set(name, callback); } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../game.js'), 'utf8'), {
    window,
    document,
    SpaceAttackCore: { ...core, Game: CapturedGame },
    SpaceAttackRenderer: Renderer,
    ResizeObserver: class { observe() {} },
    requestAnimationFrame(callback) { frames.push(callback); },
    localStorage: { getItem(key) { return stored.get(key) ?? null; }, setItem(key, value) { stored.set(key, value); } },
  }, { filename: 'game.js' });

  function step(milliseconds = 50) {
    timestamp += milliseconds;
    assert.ok(frames.length, 'the controller must schedule the next animation frame');
    frames.shift()(timestamp);
  }
  step(0); // Establish the initial animation-frame clock.

  return {
    game,
    element: id => document.getElementById(id),
    activeElement: () => activeElement,
    step,
    key(code, type = 'keydown', repeat = false) {
      const event = {
        code, repeat, target: document.getElementById('game-canvas'), prevented: false,
        preventDefault() { this.prevented = true; },
      };
      windowListeners.get(type)(event);
      return event;
    },
    blur() { windowListeners.get('blur')(); },
    visibility(hidden) { document.hidden = hidden; documentListeners.get('visibilitychange')(); },
  };
}

test('gameplay keys suppress scrolling on keydown and keyup', () => {
  const browser = controller();
  for (const code of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space']) {
    assert.equal(browser.key(code).prevented, true, code);
    assert.equal(browser.key(code, 'keyup').prevented, true, code);
  }
});

test('start hides its screen, focuses the canvas, and held controls drive the game', () => {
  const browser = controller();
  assert.equal(browser.element('start-screen').hidden, false);
  assert.equal(browser.element('pause-button').disabled, true);
  browser.key('Enter');
  assert.equal(browser.game.stage, 'playing');
  assert.equal(browser.element('start-screen').hidden, true);
  assert.equal(browser.activeElement(), browser.element('game-canvas'));
  const x = browser.game.player.x;
  browser.key('ArrowRight');
  browser.key('Space');
  browser.step();
  assert.ok(browser.game.player.x > x);
  assert.ok(browser.game.playerBullets.length > 0);
  browser.key('ArrowRight', 'keyup');
  browser.key('Space', 'keyup');
  const releasedX = browser.game.player.x;
  browser.step();
  assert.equal(browser.game.player.x, releasedX);
});

test('losing focus clears held movement and fire before resuming', () => {
  const browser = controller();
  browser.element('start-button').click();
  browser.key('KeyD');
  browser.key('Space');
  browser.step();
  browser.blur();
  assert.equal(browser.game.paused, true);
  assert.equal(browser.element('pause-screen').hidden, false);
  assert.equal(browser.activeElement(), browser.element('resume-button'));
  const snapshot = JSON.stringify(browser.game);
  browser.step(1000);
  assert.equal(JSON.stringify(browser.game), snapshot);
  browser.game.playerBullets.length = 0;
  const x = browser.game.player.x;
  browser.element('resume-button').click();
  browser.step();
  assert.equal(browser.game.paused, false);
  assert.equal(browser.game.player.x, x);
  assert.equal(browser.game.playerBullets.length, 0);
});

test('hiding the tab pauses, clears held keys, and waits for deliberate resume', () => {
  const browser = controller();
  browser.element('start-button').click();
  browser.key('KeyA');
  browser.key('Space');
  browser.step();
  browser.visibility(true);
  assert.equal(browser.game.paused, true);
  const snapshot = JSON.stringify(browser.game);
  browser.step(5000);
  assert.equal(JSON.stringify(browser.game), snapshot);
  browser.visibility(false);
  assert.equal(browser.game.paused, true);
  browser.game.playerBullets.length = 0;
  const x = browser.game.player.x;
  browser.key('KeyP');
  browser.step();
  assert.equal(browser.game.paused, false);
  assert.equal(browser.game.player.x, x);
  assert.equal(browser.game.playerBullets.length, 0);
});

test('manual pause freezes the simulation and mute updates its accessible state', () => {
  const browser = controller();
  browser.element('start-button').click();
  browser.key('Space');
  browser.step();
  browser.key('KeyP');
  assert.equal(browser.game.paused, true);
  const snapshot = JSON.stringify(browser.game);
  browser.step();
  assert.equal(JSON.stringify(browser.game), snapshot);
  browser.key('KeyM');
  assert.equal(browser.element('mute-button').getAttribute('aria-pressed'), 'true');
  browser.key('KeyM');
  assert.equal(browser.element('mute-button').getAttribute('aria-pressed'), 'false');
  browser.key('Escape');
  assert.equal(browser.game.paused, false);
  assert.equal(browser.element('pause-screen').hidden, true);
});

test('game over displays final results, and restart clears the entire run', () => {
  const browser = controller();
  browser.element('start-button').click();
  browser.game.killEnemy(browser.game.enemies[0]);
  browser.game.wave = 4;
  browser.key('Space');
  browser.step();
  for (let i = 0; i < 3; i++) {
    browser.game.player.invulnerable = 0;
    browser.game.hitPlayer();
  }
  browser.step();
  assert.equal(browser.game.stage, 'gameover');
  assert.equal(browser.element('gameover-screen').hidden, false);
  assert.equal(browser.element('final-score').textContent, '000150');
  assert.equal(browser.element('final-wave').textContent, '04');
  assert.equal(browser.activeElement(), browser.element('restart-button'));
  assert.equal(browser.element('pause-button').disabled, true);
  browser.element('restart-button').click();
  browser.step();
  assert.equal(browser.game.stage, 'playing');
  assert.equal(browser.game.score, 0);
  assert.equal(browser.game.wave, 1);
  assert.equal(browser.game.lives, 3);
  assert.equal(browser.game.paused, false);
  assert.equal(browser.game.playerBullets.length, 0);
  assert.equal(browser.game.enemyBullets.length, 0);
  assert.equal(browser.game.particles.length, 0);
  assert.equal(browser.element('gameover-screen').hidden, true);
  assert.equal(browser.element('score').textContent, '000000');
  assert.equal(browser.element('wave').textContent, '01');
  assert.equal(browser.element('lives').getAttribute('aria-label'), '3 lives remaining');
  assert.ok(browser.element('lives').children.every(life => !life.classList.contains('lost')));
});

test('clearing a formation updates the transition banner and next-wave HUD', () => {
  const browser = controller();
  browser.element('start-button').click();
  browser.game.enemies.forEach(enemy => browser.game.killEnemy(enemy));
  browser.step();
  assert.equal(browser.element('wave-banner-title').textContent, 'SECTOR CLEAR');
  for (let i = 0; i < 30; i++) browser.step();
  assert.equal(browser.game.wave, 2);
  assert.equal(browser.element('wave').textContent, '02');
  assert.equal(browser.element('wave-banner-title').textContent, 'WAVE 02');
});
