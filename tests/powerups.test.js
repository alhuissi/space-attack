/* Run with: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const { Game, WIDTH } = require('../engine.js');

function playing(random = () => 0.99) {
  const game = new Game({ random });
  game.start();
  game.player.invulnerable = 1000;
  return game;
}

function advance(game, seconds, input = {}) {
  for (let remaining = seconds; remaining > 1e-8; remaining -= 0.05) {
    game.update(Math.min(0.05, remaining), input);
  }
}

function pickup(x, y) {
  return { kind: 'twin', x, y, prevX: x, prevY: y, vx: 0, vy: 62, radius: 14, dead: false };
}

function equip(game) {
  const item = pickup(game.player.x, game.player.y);
  game.collectPickup(item);
  return item;
}

test('the third shot kill guarantees the first drop, even across a wave change', () => {
  const game = playing();
  game.killEnemy(game.enemies[0]);
  game.killEnemy(game.enemies[1]);
  assert.equal(game.killCount, 2);
  assert.equal(game.pickups.length, 0);
  game.wave = 2;
  game.spawnWave();
  const enemy = game.enemies[0];
  game.killEnemy(enemy);
  assert.equal(game.killCount, 3);
  assert.equal(game.pickups.length, 1);
  const item = game.pickups[0];
  assert.equal(item.kind, 'twin');
  assert.ok(item.x >= item.radius && item.x <= WIDTH - item.radius);
  const initialY = item.y;
  game.update(0.05);
  assert.ok(Math.abs(item.y - initialY - 62 * 0.05) < 1e-8);
});

test('ramming an enemy cannot create shooting score, kill count or drops', () => {
  const game = playing();
  const enemy = game.enemies[0];
  game.enemies = [enemy];
  game.player.invulnerable = 0;
  enemy.baseX = enemy.x = game.player.x;
  enemy.baseY = enemy.y = game.player.y;
  game.update(0.01);
  assert.equal(game.lives, 2);
  assert.equal(enemy.alive, false);
  assert.equal(game.killCount, 0);
  assert.equal(game.score, 0);
  assert.equal(game.pickups.length, 0);
});

test('later drops respect their probability, cooldown and two-pickup cap', () => {
  const game = playing(() => 0);
  game.player.x = 932;
  game.enemies.slice(0, 3).forEach(enemy => game.killEnemy(enemy));
  assert.equal(game.pickups.length, 1);
  game.enemies.slice(3, 6).forEach(enemy => game.killEnemy(enemy));
  assert.equal(game.pickups.length, 1, 'kills during the drop cooldown must not drop another item');
  game.pickups[0].x = 28;
  game.pickups[0].y = 100;
  advance(game, 6.1);
  game.killEnemy(game.enemies[6]);
  assert.equal(game.pickups.length, 2);
  for (const item of game.pickups) { item.x = 28; item.y = 100; }
  advance(game, 6.1);
  game.killEnemy(game.enemies[7]);
  assert.equal(game.pickups.length, 2, 'a favorable roll must still respect the item cap');

  const unlucky = playing();
  unlucky.player.x = 932;
  unlucky.enemies.slice(0, 3).forEach(enemy => unlucky.killEnemy(enemy));
  unlucky.pickups[0].x = 28;
  unlucky.pickups[0].y = 100;
  advance(unlucky, 6.1);
  unlucky.killEnemy(unlucky.enemies[3]);
  assert.equal(unlucky.pickups.length, 1, 'later drops are optional rather than guaranteed');
});

test('relative swept collection detects a crossing whose endpoints both miss', () => {
  const game = playing();
  const item = pickup(game.player.x - 15, game.player.y + 23.5);
  game.pickups.push(item);
  assert.ok(Math.hypot(item.x - game.player.x, item.y - game.player.y) > 26);
  game.update(0.05, { left: true });
  assert.ok(Math.hypot(item.x - game.player.x, item.y - game.player.y) > 26);
  assert.equal(game.pickups.length, 0);
  assert.ok(game.player.twinTimer > 9.9);
  assert.ok(game.events.includes('powerup'));
});

test('collecting twin shot refreshes a ten-second timer without stacking duration', () => {
  const game = playing();
  equip(game);
  assert.equal(game.player.twinTimer, 10);
  advance(game, 4);
  assert.ok(Math.abs(game.player.twinTimer - 6) < 1e-8);
  const collected = equip(game);
  assert.equal(collected.dead, true);
  assert.equal(game.player.twinTimer, 10);
  advance(game, 10.05);
  assert.equal(game.player.twinTimer, 0);
});

test('twin shot signals its ending and expiry once, then returns to ordinary fire', () => {
  const game = playing();
  equip(game);
  advance(game, 7.05);
  assert.ok(game.player.twinTimer > 2.9 && game.player.twinTimer < 3);
  assert.equal(game.events.filter(event => event === 'powerupEnding').length, 1);
  assert.equal(game.events.filter(event => event === 'powerupExpired').length, 0);
  assert.equal(game.weaponNotice.text, 'TWIN SHOT FADING');
  advance(game, 3);
  assert.equal(game.player.twinTimer, 0);
  assert.equal(game.events.filter(event => event === 'powerupEnding').length, 1);
  assert.equal(game.events.filter(event => event === 'powerupExpired').length, 1);
  assert.equal(game.weaponNotice.text, 'STANDARD FIRE');
  advance(game, 1);
  assert.equal(game.events.filter(event => event === 'powerupExpired').length, 1);
  game.update(0, { fire: true });
  assert.equal(game.playerBullets.length, 1);
  equip(game);
  advance(game, 7.05);
  assert.equal(game.events.filter(event => event === 'powerupEnding').length, 2, 'a new activation gets its own ending cue');
});

test('twin shot emits two parallel shots with the ordinary firing cadence', () => {
  const game = playing();
  equip(game);
  game.update(0, { fire: true });
  assert.equal(game.playerBullets.length, 2);
  assert.deepEqual(game.playerBullets.map(shot => shot.x), [game.player.x - 10, game.player.x + 10]);
  assert.ok(game.playerBullets.every(shot => shot.y === game.player.y - 20 && shot.vy === -720 && shot.radius === 3));
  const cadence = game.player.shotCooldown;
  game.update(0.01, { fire: true });
  assert.equal(game.playerBullets.length, 2);
  advance(game, 0.2, { fire: true });
  assert.equal(game.playerBullets.length, 4);
  const plain = playing();
  plain.update(0, { fire: true });
  assert.equal(plain.playerBullets.length, 1);
  assert.equal(cadence, plain.player.shotCooldown);
});

test('both twin shots touching one enemy award its score only once', () => {
  const game = playing();
  const enemy = game.enemies[0];
  game.enemies = [enemy];
  enemy.baseX = enemy.x = game.player.x;
  enemy.baseY = enemy.y = 350;
  game.player.y = 410;
  equip(game);
  game.update(0.05, { fire: true });
  assert.equal(enemy.alive, false);
  assert.equal(game.score, 150);
  assert.equal(game.killCount, 1);
});

test('the two twin shots can destroy two separate enemies in one frame', () => {
  const game = playing();
  const targets = game.enemies.slice(0, 2);
  game.enemies = targets;
  for (const [index, enemy] of targets.entries()) {
    enemy.baseX = enemy.x = game.player.x + (index ? 20 : -20);
    enemy.baseY = enemy.y = 350;
  }
  game.player.y = 410;
  equip(game);
  game.update(0.05, { fire: true });
  assert.ok(targets.every(enemy => !enemy.alive));
  assert.equal(game.score, 300);
  assert.equal(game.killCount, 2);
  assert.equal(game.playerBullets.length, 0);
});

test('pickups and twin duration survive a wave transition while continuing to advance', () => {
  const game = playing();
  equip(game);
  const item = pickup(28, 100);
  game.pickups.push(item);
  game.enemies.forEach(enemy => { enemy.alive = false; });
  game.update(0.05);
  assert.ok(game.nextWaveTimer > 0);
  advance(game, 1.5);
  assert.equal(game.wave, 2);
  assert.ok(game.pickups.includes(item));
  assert.ok(item.y > 100);
  assert.ok(game.player.twinTimer > 8 && game.player.twinTimer < 9);
});

test('a pickup remains collectible during the cleared-wave gap', () => {
  const game = playing();
  game.enemies.forEach(enemy => { enemy.alive = false; });
  game.pickups.push(pickup(game.player.x, game.player.y - 10));
  game.update(0.05);
  assert.ok(game.nextWaveTimer > 0);
  assert.equal(game.pickups.length, 0);
  assert.ok(game.player.twinTimer > 9.9);
});

test('pause freezes pickups, weapon duration and feedback timers', () => {
  const game = playing();
  equip(game);
  game.pickups.push(pickup(28, 100));
  game.player.invulnerable = 0;
  game.hitPlayer();
  game.update(0.01, { fire: true });
  assert.ok(game.player.muzzleFlash > 0);
  assert.ok(game.player.damageFlash > 0);
  game.setPaused(true);
  const before = JSON.stringify(game);
  advance(game, 2, { left: true, fire: true });
  assert.equal(JSON.stringify(game), before);
  game.setPaused(false);
  const y = game.pickups[0].y;
  const timer = game.player.twinTimer;
  game.update(0.05);
  assert.ok(game.pickups[0].y > y);
  assert.ok(game.player.twinTimer < timer);
});

test('restart clears pickups, weapon effects, drop counters and feedback timers', () => {
  const game = playing();
  equip(game);
  game.enemies.slice(0, 3).forEach(enemy => game.killEnemy(enemy));
  game.player.invulnerable = 0;
  game.hitPlayer();
  game.update(0.01, { fire: true });
  game.setPaused(true);
  game.start();
  assert.equal(game.pickups.length, 0);
  assert.equal(game.killCount, 0);
  assert.equal(game.dropCooldown, 0);
  assert.equal(game.player.twinTimer, 0);
  assert.equal(game.player.muzzleFlash, 0);
  assert.equal(game.player.damageFlash, 0);
  assert.equal(game.weaponNotice, null);
  assert.equal(game.playerBullets.length, 0);
  assert.equal(game.enemyBullets.length, 0);
  assert.equal(game.wave, 1);
  assert.equal(game.score, 0);
  assert.equal(game.lives, 3);
  assert.equal(game.paused, false);
});
