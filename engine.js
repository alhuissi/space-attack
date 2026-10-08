/* Pure game simulation. Rendering, input and audio live in their own files. */
(function (root) {
  'use strict';

  const WIDTH = 960;
  const HEIGHT = 640;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  // Swept collision prevents fast shots from passing through a target between frames.
  function segmentHitTime(shot, x, y, radius) {
    const dx = shot.x - shot.prevX;
    const dy = shot.y - shot.prevY;
    const ox = shot.prevX - x;
    const oy = shot.prevY - y;
    const a = dx * dx + dy * dy;
    const c = ox * ox + oy * oy - radius * radius;
    if (c <= 0) return 0;
    if (a === 0) return Infinity;
    const b = 2 * (ox * dx + oy * dy);
    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) return Infinity;
    const t = (-b - Math.sqrt(discriminant)) / (2 * a);
    return t >= 0 && t <= 1 ? t : Infinity;
  }

  class Game {
    constructor({ random = Math.random } = {}) {
      this.random = random;
      this.width = WIDTH;
      this.height = HEIGHT;
      this.reset();
    }

    reset() {
      this.stage = 'start';
      this.paused = false;
      this.score = 0;
      this.wave = 1;
      this.lives = 3;
      this.time = 0;
      this.player = { x: WIDTH / 2, y: 574, radius: 12, invulnerable: 0, shotCooldown: 0 };
      this.playerBullets = [];
      this.enemyBullets = [];
      this.particles = [];
      this.rings = [];
      this.events = [];
      this.shake = 0;
      this.nextWaveTimer = 0;
      this.spawnWave();
      this.waveBanner = 0;
    }

    start() {
      this.reset();
      this.stage = 'playing';
      this.waveBanner = 1.8;
      this.events.push('start');
    }

    setPaused(paused) {
      if (this.stage === 'playing') this.paused = Boolean(paused);
    }

    spawnWave() {
      const level = this.wave - 1;
      this.difficulty = {
        speed: Math.min(100, 36 + level * 6),
        fireInterval: Math.max(0.34, 1.1 - level * 0.065),
        bulletSpeed: Math.min(265, 185 + level * 7),
      };
      const rows = this.wave >= 4 ? 4 : 3;
      this.formation = { x: 0, y: 0, direction: 1, total: rows * 7 };
      this.enemies = [];
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < 7; col++) {
          const baseX = WIDTH / 2 + (col - 3) * 72;
          const baseY = 122 + row * 52;
          this.enemies.push({ x: baseX, y: baseY, baseX, baseY, width: 36, height: 26, row, col, type: row % 3, alive: true, telegraph: 0 });
        }
      }
      this.fireTimer = 1.6;
      this.pendingShooter = null;
      this.nextWaveTimer = 0;
      this.playerBullets.length = 0;
      this.enemyBullets.length = 0;
      this.waveBanner = 1.8;
    }

    burst(x, y, color, count = 12) {
      for (let i = 0; i < count; i++) {
        const angle = this.random() * Math.PI * 2;
        const speed = 40 + this.random() * 140;
        const life = 0.22 + this.random() * 0.3;
        this.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life, maxLife: life, color, size: 1.5 + this.random() * 2 });
      }
      this.rings.push({ x, y, radius: 8, life: 0.3, maxLife: 0.3, color });
    }

    killEnemy(enemy) {
      if (!enemy.alive) return;
      enemy.alive = false;
      this.score += [150, 100, 75][enemy.type];
      this.burst(enemy.x, enemy.y, '#ee967f');
      this.events.push('kill');
    }

    hitPlayer() {
      if (this.stage !== 'playing' || this.paused || this.player.invulnerable > 0) return false;
      this.lives--;
      this.player.invulnerable = 1.5;
      this.shake = 0.18;
      this.burst(this.player.x, this.player.y, '#efd078', 22);
      // A small clear zone leaves space to recover without erasing distant threats.
      this.enemyBullets = this.enemyBullets.filter(shot => Math.hypot(shot.x - this.player.x, shot.y - this.player.y) > 100);
      this.events.push('damage');
      if (this.lives <= 0) {
        this.stage = 'gameover';
        this.paused = false;
        this.events.push('gameover');
      }
      return true;
    }

    update(dt, input = {}) {
      if (this.paused) return;
      dt = clamp(dt, 0, 0.05);
      this.time += dt;
      this.updateEffects(dt);
      if (this.stage !== 'playing') return;
      this.waveBanner = Math.max(0, this.waveBanner - dt);
      this.player.invulnerable = Math.max(0, this.player.invulnerable - dt);
      this.player.shotCooldown = Math.max(0, this.player.shotCooldown - dt);
      const dx = Number(Boolean(input.right)) - Number(Boolean(input.left));
      const dy = Number(Boolean(input.down)) - Number(Boolean(input.up));
      const length = Math.hypot(dx, dy) || 1;
      this.player.x = clamp(this.player.x + dx / length * 340 * dt, 28, WIDTH - 28);
      this.player.y = clamp(this.player.y + dy / length * 340 * dt, 410, HEIGHT - 30);
      if (input.fire && this.player.shotCooldown === 0) {
        this.playerBullets.push({ x: this.player.x, y: this.player.y - 24, prevX: this.player.x, prevY: this.player.y - 24, vx: 0, vy: -720, radius: 3 });
        this.player.shotCooldown = 0.145;
        this.events.push('shoot');
      }

      const alive = this.enemies.filter(enemy => enemy.alive);
      if (alive.length === 0) {
        if (this.nextWaveTimer === 0) {
          this.nextWaveTimer = 1.4;
          this.enemyBullets.length = 0;
          this.events.push('clear');
        }
        this.nextWaveTimer -= dt;
        if (this.nextWaveTimer <= 0) {
          this.wave++;
          this.spawnWave();
          this.events.push('wave');
        }
      } else {
        this.updateFormation(dt, alive);
        this.updateEnemyFire(dt, alive);
      }

      for (const shots of [this.playerBullets, this.enemyBullets]) {
        for (const shot of shots) {
          shot.prevX = shot.x;
          shot.prevY = shot.y;
          shot.x += shot.vx * dt;
          shot.y += shot.vy * dt;
        }
      }

      for (const shot of this.playerBullets) {
        let target = null;
        let firstHit = Infinity;
        for (const enemy of alive) {
          if (enemy.alive) {
            const hit = segmentHitTime(shot, enemy.x, enemy.y, 18 + shot.radius);
            if (hit < firstHit) { firstHit = hit; target = enemy; }
          }
        }
        if (target) {
          this.killEnemy(target);
          shot.dead = true;
        }
      }
      for (const shot of this.enemyBullets) {
        if (segmentHitTime(shot, this.player.x, this.player.y, this.player.radius + shot.radius) !== Infinity) {
          shot.dead = true;
          this.hitPlayer();
        }
      }
      for (const enemy of alive) {
        if (enemy.alive && Math.hypot(enemy.x - this.player.x, enemy.y - this.player.y) < 18 + this.player.radius && this.hitPlayer()) {
          enemy.alive = false;
          this.burst(enemy.x, enemy.y, '#ee967f');
        }
      }
      const onScreen = shot => !shot.dead && shot.x > -20 && shot.x < WIDTH + 20 && shot.y > -30 && shot.y < HEIGHT + 30;
      this.playerBullets = this.playerBullets.filter(onScreen);
      this.enemyBullets = this.enemyBullets.filter(onScreen);
    }

    updateFormation(dt, alive) {
      const speed = this.difficulty.speed + (1 - alive.length / this.formation.total) * 28;
      const step = this.formation.direction * speed * dt;
      const left = Math.min(...alive.map(enemy => enemy.x));
      const right = Math.max(...alive.map(enemy => enemy.x));
      if (left + step < 38 || right + step > WIDTH - 38) {
        this.formation.direction *= -1;
        const bottomBase = Math.max(...alive.map(enemy => enemy.baseY));
        this.formation.y = Math.min(HEIGHT - 75 - bottomBase, this.formation.y + 18);
      } else {
        this.formation.x += step;
      }
      for (const enemy of alive) {
        enemy.x = enemy.baseX + this.formation.x;
        enemy.y = enemy.baseY + this.formation.y + Math.sin(this.time * 1.6 + enemy.col * 0.35) * 4;
      }
    }

    updateEnemyFire(dt, alive) {
      if (this.pendingShooter) {
        const shooter = this.pendingShooter;
        shooter.telegraph -= dt;
        if (!shooter.alive) this.pendingShooter = null;
        else if (shooter.telegraph <= 0) {
          const dx = clamp(this.player.x - shooter.x, -340, 340);
          const dy = Math.max(90, this.player.y - shooter.y);
          const length = Math.hypot(dx, dy);
          const speed = this.difficulty.bulletSpeed;
          this.enemyBullets.push({ x: shooter.x, y: shooter.y + 16, prevX: shooter.x, prevY: shooter.y + 16, vx: dx / length * speed, vy: dy / length * speed, radius: 5 });
          this.pendingShooter = null;
          this.events.push('enemyShoot');
        }
      }
      this.fireTimer -= dt;
      if (this.fireTimer <= 0 && !this.pendingShooter && this.enemyBullets.length < 32) {
        // Only the front surviving ship in each column can shoot.
        const front = new Map();
        for (const enemy of alive) {
          if (!front.has(enemy.col) || front.get(enemy.col).row < enemy.row) front.set(enemy.col, enemy);
        }
        const shooters = [...front.values()];
        this.pendingShooter = shooters[Math.floor(this.random() * shooters.length)];
        this.pendingShooter.telegraph = 0.3;
        this.fireTimer = this.difficulty.fireInterval * (0.85 + this.random() * 0.3);
      }
    }

    updateEffects(dt) {
      this.shake = Math.max(0, this.shake - dt);
      for (const particle of this.particles) {
        particle.life -= dt;
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.vx *= Math.exp(-4 * dt);
        particle.vy *= Math.exp(-4 * dt);
      }
      this.particles = this.particles.filter(particle => particle.life > 0);
      for (const ring of this.rings) {
        ring.life -= dt;
        ring.radius += 110 * dt;
      }
      this.rings = this.rings.filter(ring => ring.life > 0);
    }
  }

  const api = { Game, WIDTH, HEIGHT, clamp };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SpaceAttackCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
