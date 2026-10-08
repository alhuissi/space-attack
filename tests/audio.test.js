/* Exercises the production synth with a small Web Audio test double. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function synth() {
  class Parameter {
    constructor() { this.value = 0; this.calls = []; }
    setValueAtTime(value, time) { this.calls.push(['set', value, time]); }
    linearRampToValueAtTime(value, time) { this.calls.push(['linear', value, time]); }
    exponentialRampToValueAtTime(value, time) { this.calls.push(['exponential', value, time]); }
    setTargetAtTime(value, time) { this.calls.push(['target', value, time]); }
    cancelScheduledValues(time) { this.calls.push(['cancel', time]); }
  }
  class Node {
    constructor(kind) {
      this.kind = kind;
      this.gain = new Parameter();
      this.frequency = new Parameter();
      this.playbackRate = new Parameter();
      this.connections = [];
      this.cancelled = false;
    }
    connect(node) { this.connections.push(node); }
    disconnect() { this.disconnected = true; }
    start(time) { this.startTime = time; }
    stop(time) {
      if (time === undefined) { this.cancelled = true; this.onended?.(); }
      else this.stopTime = time;
    }
  }
  class AudioContext {
    constructor() { this.currentTime = 0; this.sampleRate = 1000; this.state = 'running'; this.destination = new Node('destination'); this.nodes = []; }
    node(kind) { const node = new Node(kind); this.nodes.push(node); return node; }
    createGain() { return this.node('gain'); }
    createOscillator() { return this.node('oscillator'); }
    createBufferSource() { return this.node('noise'); }
    createBiquadFilter() { return this.node('filter'); }
    createBuffer(channels, length) { return { getChannelData() { return new Float32Array(length); } }; }
    resume() { this.state = 'running'; return Promise.resolve(); }
  }
  const context = { window: { AudioContext }, game: { paused: false }, muted: false };
  const source = fs.readFileSync(path.join(__dirname, '../game.js'), 'utf8');
  const productionClass = source.slice(source.indexOf('  class Sound {'), source.indexOf('\n  const sound = new Sound();'));
  vm.runInNewContext(`${productionClass}\nglobalThis.sound = new Sound();`, context);
  context.sound.unlock();
  return context;
}

function sources(sound) { return sound.context.nodes.filter(node => node.kind === 'oscillator' || node.kind === 'noise'); }
function contour(node) { return [node.type, node.frequency.calls[0]?.[1], node.frequency.calls[1]?.[1]]; }

test('all effects and music use the same master gain so mute covers every layer', () => {
  const { sound } = synth();
  for (const event of ['shoot', 'kill', 'killDiver', 'killSpread', 'damage', 'clear', 'powerup', 'powerupEnding', 'powerupExpired']) sound.play(event);
  sound.update(0, 'playing');
  assert.ok(sources(sound).length > 20);
  for (const source of sources(sound)) {
    let node = source;
    const visited = new Set();
    while (node !== sound.master) {
      assert.ok(!visited.has(node), 'the audio routing must not contain a loop');
      visited.add(node);
      assert.equal(node.connections.length, 1);
      node = node.connections[0];
    }
    assert.equal(sound.master.connections[0], sound.context.destination);
  }
});

test('mute cancels delayed fanfare notes and prevents new effects or music', () => {
  const context = synth();
  context.sound.play('clear');
  const scheduled = sources(context.sound);
  assert.ok(scheduled.some(node => node.startTime > context.sound.context.currentTime));
  context.muted = true;
  context.sound.silence(false);
  assert.ok(scheduled.every(node => node.cancelled));
  assert.equal(context.sound.master.gain.calls.at(-1)[1], 0);
  context.sound.play('shoot');
  context.sound.update(10, 'playing');
  assert.equal(sources(context.sound).length, scheduled.length);
  context.muted = false;
  context.sound.silence(false);
  context.sound.update(10, 'playing');
  assert.ok(sources(context.sound).length > scheduled.length);
  assert.ok(scheduled.every(node => node.cancelled), 'unmuting must not revive old delayed notes');
});

test('pause stops voices and music resumes at the current beat without catching up', () => {
  const context = synth();
  context.sound.play('powerup');
  context.sound.update(0, 'playing');
  const previous = sources(context.sound);
  context.game.paused = true;
  context.sound.silence(true);
  context.sound.update(0, 'playing');
  assert.ok(previous.every(node => node.cancelled));
  assert.equal(sources(context.sound).length, previous.length);
  context.game.paused = false;
  context.sound.silence(false);
  context.sound.update(30, 'playing');
  assert.ok(sources(context.sound).length > previous.length);
  assert.ok(sources(context.sound).length <= previous.length + 2, 'resume should play at most one lead and one bass note');
  const count = sources(context.sound).length;
  context.sound.update(30, 'playing');
  assert.equal(sources(context.sound).length, count);
});

test('game over stops music while preserving its ending cue, and reset cancels everything', () => {
  const { sound } = synth();
  sound.update(0, 'playing');
  const music = sources(sound).slice();
  sound.play('gameover');
  const ending = sources(sound).filter(node => !music.includes(node));
  sound.update(0.1, 'gameover');
  assert.ok(music.every(node => node.cancelled));
  assert.ok(ending.every(node => !node.cancelled));
  const count = sources(sound).length;
  sound.update(20, 'gameover');
  assert.equal(sources(sound).length, count);
  sound.reset();
  assert.ok(ending.every(node => node.cancelled));
  sound.update(0, 'playing');
  assert.equal(sources(sound).length, count + 2, 'a new run should restart the motif from its first beat');
});

test('enemy kill sounds have distinct contours and filtered explosion layers', () => {
  const signatures = [];
  for (const event of ['kill', 'killDiver', 'killSpread']) {
    const { sound } = synth();
    sound.play(event);
    signatures.push(JSON.stringify(sources(sound).filter(node => node.kind === 'oscillator').map(contour)));
    assert.ok(sources(sound).some(node => node.kind === 'noise'));
    assert.ok(sound.context.nodes.some(node => node.kind === 'filter' && node.type === 'lowpass'));
  }
  assert.equal(new Set(signatures).size, 3);
});
