/* Run with: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const { Game, WIDTH, HEIGHT } = require('../engine.js');

function playing(wave = 1) {
  let seed = 37;
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const game = new Game({ random });
  game.start();
  if (wave !== 1) {
    game.wave = wave;
    game.spawnWave();
  }
  game.player.invulnerable = 1000;
  return game;
}

function advance(game, seconds, input = {}, observe = () => {}) {
  for (let remaining = seconds; remaining > 1e-8; remaining -= 0.05) {
    game.update(Math.min(0.05, remaining), input);
    observe(game);
  }
}

function activeDivers(game) {
  return game.enemies.filter(enemy => enemy.alive && enemy.state !== 'formation');
}

test('wave one keeps the introductory formation attacks', () => {
  const game = playing();
  assert.equal(game.difficulty.maxDivers, 0);
  advance(game, 12, {}, () => {
    assert.ok(game.enemies.every(enemy => enemy.state === 'formation'));
    assert.ok(!game.pendingShooter || game.pendingShooter.attack !== 'spread');
    assert.equal(activeDivers(game).length, 0);
  });
});

test('wave two automatically introduces single divers without spread attacks', () => {
  const game = playing(2);
  const states = new Set();
  advance(game, 25, {}, () => {
    assert.ok(activeDivers(game).length <= 1);
    assert.ok(!game.pendingShooter || game.pendingShooter.attack !== 'spread');
    assert.ok(game.enemies.every(enemy => enemy.role !== 'spread'));
    for (const enemy of game.enemies) if (enemy.role === 'diver') states.add(enemy.state);
  });
  assert.ok(states.has('diveWarning'));
  assert.ok(states.has('diving'));
  assert.ok(states.has('returning'));
});

test('dive warnings reserve a slot and higher waves have a finite simultaneous cap', () => {
  for (const [wave, expectedCap] of [[2, 1], [5, 2], [10000, 2]]) {
    const game = playing(wave);
    const candidates = game.enemies.filter(enemy => enemy.type === 1);
    assert.equal(game.difficulty.maxDivers, expectedCap);
    for (let i = 0; i < expectedCap; i++) {
      assert.equal(game.beginDive(candidates[i]), true);
      assert.equal(candidates[i].state, 'diveWarning');
    }
    assert.equal(game.beginDive(candidates[expectedCap]), false);
    assert.equal(activeDivers(game).length, expectedCap);
  }
});

test('a diver commits its target during its warning rather than tracking later movement', () => {
  const game = playing(2);
  const enemy = game.enemies.find(enemy => enemy.type === 1);
  assert.equal(game.beginDive(enemy), true);
  const target = { ...enemy.dive.target };
  assert.deepEqual(target, { x: game.player.x, y: game.player.y });
  game.player.x = 28;
  game.player.y = 410;
  game.fireTimer = 0;
  advance(game, 0.5, {}, () => {
    assert.equal(game.pendingShooter, null, 'ordinary fire waits until the dive warning has finished');
    assert.equal(game.enemyBullets.length, 0);
  });
  advance(game, 0.5);
  assert.deepEqual(enemy.dive.target, target);
  assert.equal(enemy.alive, true);
  assert.equal(enemy.state, 'diving');
});

test('a surviving diver completes its run and rejoins a moving formation', () => {
  const game = playing(2);
  const enemy = game.enemies.find(enemy => enemy.type === 1);
  assert.equal(game.beginDive(enemy), true);
  game.diveTimer = 100;
  const states = new Set([enemy.state]);
  advance(game, 12, {}, () => {
    states.add(enemy.state);
    assert.ok(Number.isFinite(enemy.x) && Number.isFinite(enemy.y));
  });
  assert.ok(states.has('diving'));
  assert.ok(states.has('returning'));
  assert.equal(enemy.alive, true);
  assert.equal(enemy.state, 'formation');
  assert.ok(Math.abs(enemy.x - (enemy.baseX + game.formation.x)) < 0.1);
  assert.ok(Math.abs(enemy.y - (enemy.baseY + game.formation.y)) <= 4.1);
});

test('a live diver prevents wave clear, and shooting it awards points before progression', () => {
  const game = playing(2);
  const enemy = game.enemies.find(enemy => enemy.type === 1);
  assert.equal(game.beginDive(enemy), true);
  game.diveTimer = 100;
  for (const other of game.enemies) if (other !== enemy) other.alive = false;
  advance(game, 2);
  assert.equal(game.wave, 2);
  assert.equal(game.nextWaveTimer, 0);
  const score = game.score;
  game.killEnemy(enemy);
  assert.equal(game.score, score + 100);
  game.killEnemy(enemy);
  assert.equal(game.score, score + 100);
  advance(game, 2);
  assert.equal(game.wave, 3);
  assert.ok(game.enemies.some(ship => ship.alive));
});

test('a player projectile can destroy an enemy while it is diving', () => {
  const game = playing(2);
  const enemy = game.enemies.find(enemy => enemy.type === 1);
  game.beginDive(enemy);
  advance(game, 1);
  assert.equal(enemy.state, 'diving');
  game.playerBullets.push({
    x: enemy.x, y: enemy.y, prevX: enemy.x, prevY: enemy.y,
    vx: 0, vy: 0, radius: 3,
  });
  game.update(0.01);
  assert.equal(enemy.alive, false);
  assert.equal(game.score, 100);
  assert.equal(game.playerBullets.length, 0);
  const replacement = game.enemies.find(ship => ship.alive && ship.type === 1);
  assert.equal(game.beginDive(replacement), true, 'a killed diver frees its simultaneous-attack slot');
});

test('formation boundaries depend on slots while an outer ship is diving', () => {
  const control = playing(2);
  const attack = playing(2);
  for (const game of [control, attack]) {
    for (const enemy of game.enemies) {
      enemy.alive = (enemy.row === 0 && enemy.col === 0) || (enemy.row === 1 && enemy.col === 6);
    }
    game.diveTimer = 100;
  }
  const diver = attack.enemies.find(enemy => enemy.alive && enemy.type === 1);
  assert.equal(attack.beginDive(diver), true);
  for (let i = 0; i < 240; i++) {
    control.update(0.05);
    attack.update(0.05);
    assert.equal(attack.formation.x, control.formation.x);
    assert.equal(attack.formation.y, control.formation.y);
    assert.equal(attack.formation.direction, control.formation.direction);
  }
});

test('an offscreen diver recovers without disappearing or stalling wave completion', () => {
  const game = playing(2);
  const enemy = game.enemies.find(ship => ship.type === 1);
  game.enemies = [enemy];
  game.beginDive(enemy);
  game.diveTimer = 100;
  advance(game, 1);
  enemy.x = WIDTH * 2;
  enemy.y = HEIGHT * 2;
  advance(game, 15);
  assert.equal(enemy.alive, true);
  assert.equal(enemy.state, 'formation');
  assert.equal(game.wave, 2);
  assert.ok(enemy.x > 0 && enemy.x < WIDTH);
  assert.ok(enemy.y > 0 && enemy.y < HEIGHT);
  game.killEnemy(enemy);
  advance(game, 2);
  assert.equal(game.wave, 3);
});

for (const phase of ['diveWarning', 'diving', 'returning']) {
  test(`pause freezes the entire ${phase} state and resume continues the flight`, () => {
    const game = playing(2);
    const enemy = game.enemies.find(enemy => enemy.type === 1);
    game.beginDive(enemy);
    game.fireTimer = game.diveTimer = game.spreadTimer = 100;
    for (let frames = 0; enemy.state !== phase && frames < 240; frames++) game.update(0.05);
    assert.equal(enemy.state, phase);
    const before = JSON.stringify(game);
    game.setPaused(true);
    const paused = JSON.stringify(game);
    advance(game, 2, { right: true, fire: true });
    assert.equal(JSON.stringify(game), paused);
    game.setPaused(false);
    assert.equal(JSON.stringify(game), before);
    const position = { x: enemy.x, y: enemy.y };
    advance(game, 0.1);
    assert.ok(Math.hypot(enemy.x - position.x, enemy.y - position.y) > 0);
  });
}

test('a spread shooter warns before releasing a narrow three-shot fan', () => {
  const game = playing(3);
  game.fireTimer = game.diveTimer = 100;
  game.spreadTimer = 0;
  game.update(0.01);
  const shooter = game.pendingShooter;
  assert.ok(shooter);
  assert.equal(shooter.role, 'spread');
  assert.equal(shooter.attack, 'spread');
  assert.ok(shooter.telegraph > 0.3);
  assert.equal(game.enemyBullets.length, 0);
  advance(game, 0.5);
  assert.equal(game.enemyBullets.length, 0);
  assert.equal(game.pendingShooter, shooter);
  advance(game, 0.15);
  assert.equal(game.enemyBullets.length, 3);
  assert.equal(game.pendingShooter, null);
  const angles = game.enemyBullets.map(shot => Math.atan2(shot.vx, shot.vy)).sort((a, b) => a - b);
  assert.ok(angles[2] - angles[0] < 0.4);
  assert.ok(angles[1] - angles[0] > 0.05);
  assert.ok(Math.abs((angles[1] - angles[0]) - (angles[2] - angles[1])) < 1e-8);
  for (const shot of game.enemyBullets) {
    assert.ok(shot.vy > 0);
    assert.ok(Math.abs(Math.hypot(shot.vx, shot.vy) - game.difficulty.bulletSpeed) < 1e-8);
  }
  assert.ok(shooter.attackCooldown > 3);
  assert.ok(game.spreadTimer > game.difficulty.fireInterval * 3);
});

test('a fan leaves a repositioning gap before another warning can begin', () => {
  const game = playing(3);
  game.fireTimer = game.diveTimer = 100;
  game.spreadTimer = 0;
  game.update(0.01);
  advance(game, 0.65);
  assert.equal(game.enemyBullets.length, 3);
  assert.ok(game.attackGap > 0.8);
  game.fireTimer = game.diveTimer = 0;
  advance(game, 0.65, {}, () => {
    assert.equal(game.pendingShooter, null);
    assert.equal(activeDivers(game).length, 0);
  });
  assert.equal(game.enemyBullets.length, 3);
});

test('destroying a warned spread shooter cancels its queued volley', () => {
  const game = playing(3);
  game.fireTimer = game.diveTimer = 100;
  game.spreadTimer = 0;
  game.update(0.01);
  const shooter = game.pendingShooter;
  game.killEnemy(shooter);
  game.update(0.05);
  assert.equal(game.pendingShooter, null);
  assert.equal(game.enemyBullets.length, 0);
  assert.equal(game.score, 75);
});

test('moving ship collision detects a crossing whose endpoints both miss', () => {
  const game = playing(10000);
  const enemy = game.enemies.find(ship => ship.role === 'diver');
  game.enemies = [enemy];
  game.beginDive(enemy);
  game.fireTimer = game.diveTimer = game.spreadTimer = 100;
  game.player.invulnerable = 0;
  enemy.state = 'diving';
  enemy.x = game.player.x - 16;
  enemy.y = game.player.y + 29;
  enemy.dive.path = [{ x: enemy.x + 100, y: enemy.y }];
  enemy.dive.index = 0;
  assert.ok(Math.hypot(enemy.x - game.player.x, enemy.y - game.player.y) > 30);
  game.update(0.05, { left: true });
  assert.ok(Math.hypot(enemy.x - game.player.x, enemy.y - game.player.y) > 30);
  assert.equal(game.lives, 2);
  assert.equal(enemy.alive, false);
  assert.equal(game.score, 0);
});

test('two diver contacts and a following volley cannot consume multiple lives during immunity', () => {
  const game = playing(5);
  const divers = game.enemies.filter(enemy => enemy.role === 'diver').slice(0, 2);
  game.fireTimer = game.diveTimer = game.spreadTimer = 100;
  game.player.invulnerable = 0;
  for (const enemy of divers) {
    game.beginDive(enemy);
    enemy.state = 'diving';
    enemy.x = game.player.x - 15;
    enemy.y = game.player.y + 29;
    enemy.dive.path = [{ x: enemy.x + 100, y: enemy.y }];
    enemy.dive.index = 0;
  }
  game.update(0.05, { left: true });
  assert.equal(game.lives, 2);
  assert.equal(divers.filter(enemy => enemy.alive).length, 1);
  assert.ok(game.player.invulnerable > 1);
  for (let i = 0; i < 6; i++) {
    game.enemyBullets.push({
      x: game.player.x, y: game.player.y, prevX: game.player.x, prevY: game.player.y,
      vx: 0, vy: 0, radius: 5,
    });
  }
  game.update(0.01);
  assert.equal(game.lives, 2);
});

test('a corrupt stranded flight retires without points and cannot stall a wave', () => {
  const game = playing(2);
  const enemy = game.enemies.find(ship => ship.role === 'diver');
  game.enemies = [enemy];
  game.beginDive(enemy);
  advance(game, 0.8);
  enemy.x = NaN;
  game.update(0.05);
  assert.equal(enemy.alive, false);
  assert.equal(game.score, 0);
  advance(game, 2);
  assert.equal(game.wave, 3);
});

test('restart clears paths, trails, attack warnings, cooldowns and all scheduling timers', () => {
  const game = playing(5);
  const diver = game.enemies.find(enemy => enemy.role === 'diver');
  game.beginDive(diver);
  advance(game, 1);
  assert.equal(diver.state, 'diving');
  assert.ok(diver.trail.length > 0);
  const spread = game.enemies.find(enemy => enemy.role === 'spread');
  game.pendingShooter = spread;
  spread.attack = 'spread';
  spread.telegraph = 0.6;
  game.score = 725;
  game.lives = 1;
  game.setPaused(true);
  game.start();
  const fresh = playing();
  assert.equal(game.stage, 'playing');
  assert.equal(game.wave, 1);
  assert.equal(game.score, 0);
  assert.equal(game.lives, 3);
  assert.equal(game.paused, false);
  assert.equal(game.pendingShooter, null);
  assert.equal(game.playerBullets.length, 0);
  assert.equal(game.enemyBullets.length, 0);
  for (const key of ['fireTimer', 'diveTimer', 'spreadTimer', 'attackGap', 'nextWaveTimer']) {
    assert.equal(game[key], fresh[key], key);
  }
  assert.ok(game.enemies.every(enemy => enemy.state === 'formation' && enemy.role === 'formation'));
  assert.ok(game.enemies.every(enemy => enemy.dive === null && enemy.attack === null && enemy.telegraph === 0));
  assert.ok(game.enemies.every(enemy => enemy.attackCooldown === 0 && enemy.trail.length === 0));
  assert.ok(!game.enemies.includes(diver) && !game.enemies.includes(spread));
});

test('a seeded later-wave simulation keeps paths finite, speeds capped and divers returning', () => {
  const game = playing(8);
  const previousStates = new Map(game.enemies.map(enemy => [enemy, enemy.state]));
  let dives = 0;
  let returns = 0;
  let fans = 0;
  let warning = null;
  for (let i = 0; i < 2400; i++) {
    game.player.x = WIDTH / 2 + Math.sin(game.time * 0.7) * 330;
    const positions = new Map(game.enemies.map(enemy => [enemy, { x: enemy.x, y: enemy.y }]));
    game.update(0.05);
    assert.equal(game.stage, 'playing');
    assert.ok(activeDivers(game).length <= game.difficulty.maxDivers);
    assert.ok(game.enemyBullets.length <= 18);
    for (const enemy of game.enemies) {
      assert.ok(Number.isFinite(enemy.x) && Number.isFinite(enemy.y));
      if (!enemy.alive) continue;
      const previousState = previousStates.get(enemy);
      const old = positions.get(enemy);
      if (previousState === 'diving' || previousState === 'returning') {
        assert.ok(Math.hypot(enemy.x - old.x, enemy.y - old.y) <= game.difficulty.diveSpeed * 0.05 + 1e-6);
      }
      if (enemy.state === 'diving' && previousState === 'diveWarning') dives++;
      if (enemy.state === 'formation' && previousState === 'returning') returns++;
      previousStates.set(enemy, enemy.state);
    }
    if (game.pendingShooter?.attack === 'spread' && game.pendingShooter !== warning) {
      fans++;
      warning = game.pendingShooter;
    }
    if (!game.pendingShooter) warning = null;
    for (const shot of game.enemyBullets) assert.ok(Number.isFinite(shot.x + shot.y + shot.vx + shot.vy));
    game.events.length = 0;
  }
  assert.ok(dives >= 3);
  assert.ok(returns >= 3);
  assert.ok(fans >= 3);
  assert.equal(game.lives, 3);
  assert.equal(game.wave, 8);
  assert.ok(game.enemies.every(enemy => enemy.alive), 'normal surviving paths must not need the retirement failsafe');
});

test('difficulty caps keep dive and spread attacks within sensible limits', () => {
  const game = playing(10000);
  assert.ok(game.difficulty.diveInterval >= 3.3);
  assert.ok(game.difficulty.diveSpeed <= 330);
  assert.ok(game.difficulty.spreadInterval >= 4.2);
  assert.equal(game.difficulty.maxDivers, 2);
  assert.ok(WIDTH > 0 && HEIGHT > 0);
});
