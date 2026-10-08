/* Run with: node --test tests/engine.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const { Game, WIDTH, HEIGHT } = require('../engine.js');

function playing() {
  const game = new Game({ random: () => 0.5 });
  game.start();
  return game;
}

function advance(game, seconds, input = {}) {
  for (let remaining = seconds; remaining > 1e-8; remaining -= 0.05) {
    game.update(Math.min(0.05, remaining), input);
  }
}

test('a new game starts ready, and start creates a complete playable formation', () => {
  const game = new Game({ random: () => 0.5 });
  assert.equal(game.stage, 'start');
  game.start();
  assert.equal(game.stage, 'playing');
  assert.equal(game.score, 0);
  assert.equal(game.wave, 1);
  assert.equal(game.lives, 3);
  assert.ok(game.enemies.length > 0);
  assert.equal(game.enemies.filter((enemy) => enemy.alive).length, game.enemies.length);
  assert.ok(game.player.x > 0 && game.player.x < WIDTH);
  assert.ok(game.player.y > HEIGHT / 2 && game.player.y < HEIGHT);
});

test('diagonal movement covers the same distance as movement on one axis', () => {
  const straight = playing();
  const diagonal = playing();
  const origin = { ...straight.player };
  straight.update(0.05, { right: true });
  diagonal.update(0.05, { right: true, up: true });
  const straightDistance = Math.hypot(straight.player.x - origin.x, straight.player.y - origin.y);
  const diagonalDistance = Math.hypot(diagonal.player.x - origin.x, diagonal.player.y - origin.y);
  assert.ok(straightDistance > 0);
  assert.ok(Math.abs(straightDistance - diagonalDistance) < 1e-6);
});

test('movement stays within the lower playfield, including at the corners', () => {
  const game = playing();
  game.player.invulnerable = 100;
  advance(game, 5, { right: true, down: true });
  assert.equal(game.player.x, 932);
  assert.equal(game.player.y, 610);
  advance(game, 5, { left: true, up: true });
  assert.equal(game.player.x, 28);
  assert.equal(game.player.y, 410);
});

test('a long frame cannot move the player farther than a capped frame', () => {
  const longFrame = playing();
  const cappedFrame = playing();
  longFrame.update(5, { right: true });
  cappedFrame.update(0.05, { right: true });
  assert.equal(longFrame.player.x, cappedFrame.player.x);
});

test('holding fire emits shots repeatedly with a firing cadence', () => {
  const game = playing();
  game.update(0.01, { fire: true });
  const firstCount = game.playerBullets.length;
  assert.ok(firstCount > 0);
  game.update(0.01, { fire: true });
  assert.equal(game.playerBullets.length, firstCount);
  advance(game, 0.25, { fire: true });
  assert.ok(game.playerBullets.length > firstCount);
});

test('one damage event grants immunity, and three separated hits end the game', () => {
  const game = playing();
  game.player.invulnerable = 0;
  game.hitPlayer();
  assert.equal(game.lives, 2);
  assert.ok(game.player.invulnerable > 0);
  game.hitPlayer();
  assert.equal(game.lives, 2);
  game.player.invulnerable = 0;
  game.hitPlayer();
  assert.equal(game.lives, 1);
  game.player.invulnerable = 0;
  game.hitPlayer();
  assert.equal(game.lives, 0);
  assert.equal(game.stage, 'gameover');
  game.player.invulnerable = 0;
  game.hitPlayer();
  assert.equal(game.lives, 0);
});

test('destroying an enemy awards points exactly once', () => {
  const game = playing();
  const enemy = game.enemies[0];
  game.killEnemy(enemy);
  assert.equal(enemy.alive, false);
  assert.ok(game.score > 0);
  const awardedScore = game.score;
  game.killEnemy(enemy);
  assert.equal(game.score, awardedScore);
});

test('a fast player shot hits a crossed enemy between animation frames', () => {
  const game = playing();
  const enemy = game.enemies[0];
  game.enemies = [enemy];
  game.playerBullets.push({
    x: enemy.x, y: enemy.y + 80, prevX: enemy.x, prevY: enemy.y + 80,
    vx: 0, vy: -3200, radius: 3,
  });
  game.update(0.05);
  assert.equal(enemy.alive, false);
  assert.ok(game.score > 0);
  assert.equal(game.playerBullets.length, 0);
});

test('a shot crossing two enemies destroys the nearer one regardless of array order', () => {
  const game = playing();
  const upper = game.enemies.find(enemy => enemy.row === 0 && enemy.col === 0);
  const lower = game.enemies.find(enemy => enemy.row === 1 && enemy.col === 0);
  game.enemies = [upper, lower]; // The farther target is deliberately listed first.
  game.playerBullets.push({
    x: lower.x, y: lower.y + 80, prevX: lower.x, prevY: lower.y + 80,
    vx: 0, vy: -3200, radius: 3,
  });
  game.update(0.05);
  assert.equal(lower.alive, false);
  assert.equal(upper.alive, true);
  assert.equal(game.score, 100);
  assert.equal(game.playerBullets.length, 0);
});

test('a player shot passing outside the enemy hitbox remains a miss', () => {
  const game = playing();
  const enemy = game.enemies[0];
  game.playerBullets.push({
    x: enemy.x + 28, y: enemy.y + 80, prevX: enemy.x + 28, prevY: enemy.y + 80,
    vx: 0, vy: -3200, radius: 3,
  });
  game.update(0.05);
  assert.equal(enemy.alive, true);
  assert.equal(game.score, 0);
});

test('a fast enemy shot damages the player even when its endpoints miss', () => {
  const game = playing();
  const player = game.player;
  game.enemyBullets.push({
    x: player.x, y: player.y - 60, prevX: player.x, prevY: player.y - 60,
    vx: 0, vy: 2400, radius: 5,
  });
  game.update(0.05);
  assert.equal(game.lives, 2);
  assert.equal(game.enemyBullets.length, 0);
});

test('a simultaneous enemy volley consumes only one life', () => {
  const game = playing();
  for (let i = 0; i < 6; i++) {
    game.enemyBullets.push({
      x: game.player.x, y: game.player.y, prevX: game.player.x, prevY: game.player.y,
      vx: 0, vy: 0, radius: 5,
    });
  }
  game.update(0.01);
  assert.equal(game.lives, 2);
  assert.ok(game.player.invulnerable > 0);
  assert.equal(game.enemyBullets.length, 0);
});

test('contact with an enemy costs one life and removes the collided ship', () => {
  const game = playing();
  const enemy = game.enemies[0];
  enemy.baseX = enemy.x = game.player.x;
  enemy.baseY = enemy.y = game.player.y;
  game.update(0.01);
  assert.equal(game.lives, 2);
  assert.equal(enemy.alive, false);
  assert.equal(game.score, 0, 'ramming a ship must not award shooting points');
});

test('enemy fire gives a warning and then travels toward the player', () => {
  const game = playing();
  game.player.x = 600;
  game.player.y = 500;
  game.fireTimer = 0;
  game.update(0.01);
  assert.ok(game.pendingShooter);
  assert.ok(game.pendingShooter.telegraph > 0);
  assert.equal(game.enemyBullets.length, 0);
  advance(game, 0.35);
  assert.equal(game.enemyBullets.length, 1);
  const shot = game.enemyBullets[0];
  assert.ok(shot.vx > 0, 'the player is to the right of the firing ship');
  assert.ok(shot.vy > 0, 'enemy shots should descend toward the player');
});

test('later waves increase difficulty gradually, with finite limits', () => {
  const game = playing();
  const firstWave = { ...game.difficulty };
  game.wave = 2;
  game.spawnWave();
  const secondWave = { ...game.difficulty };
  assert.ok(secondWave.speed > firstWave.speed);
  assert.ok(secondWave.fireInterval < firstWave.fireInterval);
  assert.ok(secondWave.bulletSpeed > firstWave.bulletSpeed);
  game.wave = 100;
  game.spawnWave();
  const capped = { ...game.difficulty };
  game.wave = 10000;
  game.spawnWave();
  assert.deepEqual(game.difficulty, capped);
  assert.ok(capped.speed <= 150);
  assert.ok(capped.fireInterval >= 0.25);
  assert.ok(capped.bulletSpeed <= 300);
  assert.ok(game.enemies.length <= 28);
});

test('clearing the formation starts the next wave after the short transition', () => {
  const game = playing();
  game.enemies.forEach((enemy) => game.killEnemy(enemy));
  const score = game.score;
  advance(game, 3);
  assert.equal(game.stage, 'playing');
  assert.equal(game.wave, 2);
  assert.ok(game.enemies.some((enemy) => enemy.alive));
  assert.equal(game.score, score);
  assert.equal(game.lives, 3);
});

test('pause freezes movement, shots, collisions and wave transitions', () => {
  const game = playing();
  game.setPaused(true);
  const before = JSON.stringify(game);
  advance(game, 2, { right: true, fire: true });
  assert.equal(JSON.stringify(game), before);
  game.setPaused(false);
  const x = game.player.x;
  game.update(0.05, { right: true });
  assert.ok(game.player.x > x);
});

test('restart discards score, damage, projectiles and pause state', () => {
  const game = playing();
  game.killEnemy(game.enemies[0]);
  game.hitPlayer();
  game.wave = 7;
  game.update(0.01, { fire: true });
  game.enemyBullets.push({ x: 5, y: 5, prevX: 5, prevY: 5, vx: 0, vy: 0, radius: 5 });
  game.setPaused(true);
  game.start();
  assert.equal(game.stage, 'playing');
  assert.equal(game.score, 0);
  assert.equal(game.wave, 1);
  assert.equal(game.lives, 3);
  assert.equal(game.playerBullets.length, 0);
  assert.equal(game.enemyBullets.length, 0);
  assert.ok(game.enemies.every((enemy) => enemy.alive));
  const x = game.player.x;
  game.update(0.05, { right: true });
  assert.ok(game.player.x > x, 'restart must also clear pause');
});
