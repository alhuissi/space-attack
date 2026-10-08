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

  function movingTargetHitTime(shot, target, radius) {
    return segmentHitTime({
      prevX: shot.prevX - (target.prevX ?? target.x),
      prevY: shot.prevY - (target.prevY ?? target.y),
      x: shot.x - target.x,
      y: shot.y - target.y,
    }, 0, 0, radius);
  }

  // Sample a committed curve once, then travel its segments at a capped speed.
  function curvePoints(start, controlA, controlB, end) {
    return Array.from({ length: 24 }, (_, i) => {
      const t = (i + 1) / 24;
      const u = 1 - t;
      return {
        x: u ** 3 * start.x + 3 * u * u * t * controlA.x + 3 * u * t * t * controlB.x + t ** 3 * end.x,
        y: u ** 3 * start.y + 3 * u * u * t * controlA.y + 3 * u * t * t * controlB.y + t ** 3 * end.y,
      };
    });
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
      this.player = { x: WIDTH / 2, y: 574, radius: 12, invulnerable: 0, shotCooldown: 0, twinTimer: 0, muzzleFlash: 0, damageFlash: 0 };
      this.playerBullets = [];
      this.enemyBullets = [];
      this.pickups = [];
      this.killCount = 0;
      this.firstPickupDropped = false;
      this.dropCooldown = 0;
      this.weaponNotice = null;
      this.particles = [];
      this.rings = [];
      this.flashes = [];
      this.damageFlash = 0;
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
        speed: Math.min(88, 36 + level * 5),
        fireInterval: Math.max(0.9, 1.1 - level * 0.03),
        bulletSpeed: Math.min(235, 185 + level * 5),
        diveInterval: Math.max(3.8, 4.8 - Math.max(0, level - 1) * 0.18),
        diveSpeed: Math.min(300, 235 + level * 6),
        maxDivers: this.wave < 2 ? 0 : this.wave < 5 ? 1 : 2,
        spreadInterval: Math.max(4.8, 6.5 - Math.max(0, level - 2) * 0.25),
        attackGap: Math.max(0.45, 0.6 - level * 0.0125),
      };
      const pattern = this.wave === 1 ? -1 : (this.wave - 2) % 4;
      this.layout = ['CHEVRON', 'DIAMOND', 'SPLIT WINGS', 'CROWN'][pattern] || 'FORMATION';
      const rows = pattern === 1 || pattern === 2 ? 4 : 3;
      this.enemies = [];
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < 7; col++) {
          // Distinct silhouettes and gaps, rather than ever-denser rectangles.
          if (pattern === 1 && Math.abs(col - 3) > [1, 2, 3, 2][row]) continue;
          if (pattern === 2 && col === 3) continue;
          if (pattern === 3 && row === 1 && (col === 0 || col === 6)) continue;
          const baseX = WIDTH / 2 + (col - 3) * (pattern === 1 ? 68 : 72);
          const baseY = pattern === -1 ? 122 + row * 52 : pattern === 0 ? 106 + row * 46 + Math.abs(col - 3) * 10 : pattern === 3 ? 102 + row * 50 + Math.abs(col - 3) * (row === 1 ? 0 : 10) : 106 + row * 48 + (pattern === 2 && col > 3 ? 12 : 0);
          const type = this.wave <= 2 ? row % 3 : [0, 1, 0, 2, 1][(col + row * 2 + this.wave) % 5];
          const role = type === 1 && this.wave >= 2 ? 'diver' : type === 2 && this.wave >= 3 ? 'spread' : 'formation';
          this.enemies.push({ x: baseX, y: baseY, baseX, baseY, width: 36, height: 26, row, col, type, role, alive: true, state: 'formation', attack: null, telegraph: 0, muzzleFlash: 0, attackCooldown: 0, dive: null, heading: 0, trail: [] });
        }
      }
      this.formation = { x: 0, y: 0, direction: 1, total: this.enemies.length };
      this.fireTimer = this.wave === 1 ? 1.6 : 1.3;
      this.diveTimer = this.wave === 2 ? 3.4 : 3.1;
      this.spreadTimer = 5.2;
      this.attackGap = 0;
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
        this.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life, maxLife: life, color, size: 1.5 + this.random() * 2, kind: i % 3 === 0 ? 'shard' : 'spark', rotation: angle });
      }
      this.rings.push({ x, y, radius: 8, life: 0.3, maxLife: 0.3, color });
      this.flashes.push({ x, y, radius: 12, life: 0.085, maxLife: 0.085, color });
      if (this.particles.length > 180) this.particles.splice(0, this.particles.length - 180);
    }

    killEnemy(enemy) {
      if (!enemy.alive) return;
      enemy.alive = false;
      this.score += [150, 100, 75][enemy.type];
      const diver = enemy.role === 'diver';
      const spread = enemy.role === 'spread';
      this.burst(enemy.x, enemy.y, diver ? '#f2a4b5' : spread ? '#efce87' : '#ee967f', spread ? 18 : diver ? 15 : 12);
      this.events.push(diver ? 'killDiver' : spread ? 'killSpread' : 'kill');
      this.killCount++;
      if (this.pickups.length < 2 && this.dropCooldown <= 0 && ((!this.firstPickupDropped && this.killCount >= 3) || (this.firstPickupDropped && this.random() < 0.14))) {
        this.pickups.push({ x: clamp(enemy.x, 32, WIDTH - 32), y: Math.min(enemy.y, HEIGHT - 36), prevX: clamp(enemy.x, 32, WIDTH - 32), prevY: Math.min(enemy.y, HEIGHT - 36), vy: 62, radius: 14, kind: 'twin' });
        this.firstPickupDropped = true;
        this.dropCooldown = 6;
      }
    }

    collectPickup(pickup) {
      if (this.stage !== 'playing' || this.paused || pickup.dead || pickup.kind !== 'twin') return false;
      pickup.dead = true;
      this.player.twinTimer = 10;
      this.weaponNotice = { text: 'TWIN SHOT ONLINE', life: 1.3, maxLife: 1.3 };
      this.burst(this.player.x, this.player.y, '#85ddd4', 10);
      this.events.push('powerup');
      return true;
    }

    updateWeapon(dt) {
      this.dropCooldown = Math.max(0, this.dropCooldown - dt);
      const previous = this.player.twinTimer;
      this.player.twinTimer = Math.max(0, previous - dt);
      if (previous > 3 && this.player.twinTimer <= 3) {
        this.weaponNotice = { text: 'TWIN SHOT FADING', life: 1, maxLife: 1 };
        this.events.push('powerupEnding');
      }
      if (previous > 0 && this.player.twinTimer === 0) {
        this.weaponNotice = { text: 'STANDARD FIRE', life: 1.1, maxLife: 1.1 };
        this.events.push('powerupExpired');
      }
    }

    updatePickups(dt) {
      for (const pickup of this.pickups) {
        pickup.prevX = pickup.x;
        pickup.prevY = pickup.y;
        pickup.y += pickup.vy * dt;
        if (movingTargetHitTime(pickup, this.player, pickup.radius + this.player.radius) !== Infinity) this.collectPickup(pickup);
      }
      this.pickups = this.pickups.filter(pickup => !pickup.dead && pickup.y < HEIGHT + 24);
    }

    hitPlayer() {
      if (this.stage !== 'playing' || this.paused || this.player.invulnerable > 0) return false;
      this.lives--;
      this.player.invulnerable = 1.5;
      this.player.damageFlash = 0.22;
      this.damageFlash = 0.22;
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
      this.updateWeapon(dt);
      this.player.prevX = this.player.x;
      this.player.prevY = this.player.y;
      const dx = Number(Boolean(input.right)) - Number(Boolean(input.left));
      const dy = Number(Boolean(input.down)) - Number(Boolean(input.up));
      const length = Math.hypot(dx, dy) || 1;
      this.player.x = clamp(this.player.x + dx / length * 340 * dt, 28, WIDTH - 28);
      this.player.y = clamp(this.player.y + dy / length * 340 * dt, 410, HEIGHT - 30);
      this.updatePickups(dt);
      if (input.fire && this.player.shotCooldown === 0) {
        for (const offset of this.player.twinTimer > 0 ? [-10, 10] : [0]) {
          const x = this.player.x + offset;
          const y = this.player.y - (offset === 0 ? 24 : 20);
          this.playerBullets.push({ x, y, prevX: x, prevY: y, vx: 0, vy: -720, radius: 3 });
        }
        this.player.shotCooldown = 0.145;
        this.player.muzzleFlash = 0.06;
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
        for (const enemy of alive) {
          enemy.prevX = enemy.x;
          enemy.prevY = enemy.y;
          enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt);
        }
        this.updateFormation(dt, alive);
        this.updateDivers(dt, alive);
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
            const hit = movingTargetHitTime(shot, enemy, 18 + shot.radius);
            if (hit < firstHit) { firstHit = hit; target = enemy; }
          }
        }
        if (target) {
          this.killEnemy(target);
          shot.dead = true;
        }
      }
      for (const shot of this.enemyBullets) {
        if (movingTargetHitTime(shot, this.player, this.player.radius + shot.radius) !== Infinity) {
          shot.dead = true;
          this.hitPlayer();
        }
      }
      for (const enemy of alive) {
        if (enemy.alive && movingTargetHitTime(enemy, this.player, 18 + this.player.radius) !== Infinity && this.hitPlayer()) {
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
      // Living ships retain their slots while diving, so a flight cannot push
      // the formation's edges around or make it bounce unpredictably.
      const left = Math.min(...alive.map(enemy => enemy.baseX)) + this.formation.x;
      const right = Math.max(...alive.map(enemy => enemy.baseX)) + this.formation.x;
      if (left + step < 38 || right + step > WIDTH - 38) {
        this.formation.direction *= -1;
        const bottomBase = Math.max(...alive.map(enemy => enemy.baseY));
        this.formation.y = Math.min(HEIGHT - 75 - bottomBase, this.formation.y + 18);
      } else {
        this.formation.x += step;
      }
      for (const enemy of alive) {
        if (enemy.state === 'formation' || enemy.state === 'diveWarning') {
          Object.assign(enemy, this.formationSlot(enemy));
        }
      }
    }

    formationSlot(enemy) {
      return { x: enemy.baseX + this.formation.x, y: enemy.baseY + this.formation.y + Math.sin(this.time * 1.6 + enemy.col * 0.35) * 4 };
    }

    beginDive(enemy) {
      const active = this.enemies.filter(ship => ship.alive && ship.state !== 'formation').length;
      if (!enemy.alive || enemy.role !== 'diver' || enemy.state !== 'formation' || enemy.attackCooldown > 0 || enemy.y > 355 || active >= this.difficulty.maxDivers || this.pendingShooter === enemy) return false;
      enemy.state = 'diveWarning';
      enemy.attack = 'dive';
      enemy.telegraph = 0.65;
      enemy.dive = { target: { x: this.player.x, y: this.player.y }, phaseTime: 0, totalTime: 0, path: [], index: 0 };
      this.diveTimer = this.difficulty.diveInterval;
      return true;
    }

    launchDive(enemy) {
      const target = enemy.dive.target;
      const side = target.x > WIDTH / 2 ? -1 : 1;
      const safeX = x => clamp(x, 32, WIDTH - 32);
      const start = { x: enemy.x, y: enemy.y };
      const exit = { x: safeX(target.x + side * 230), y: Math.max(230, target.y - 190) };
      enemy.dive.path = [
        ...curvePoints(start, { x: safeX(start.x + side * 90), y: start.y + 90 }, { x: safeX(target.x - side * 75), y: target.y - 150 }, target),
        ...curvePoints(target, { x: safeX(target.x + side * 65), y: Math.min(HEIGHT - 24, target.y + 100) }, { x: safeX(target.x + side * 200), y: target.y - 10 }, exit),
      ];
      enemy.state = 'diving';
      enemy.telegraph = 0;
      enemy.dive.phaseTime = 0;
      this.attackGap = Math.max(this.attackGap, 0.85);
      this.fireTimer = Math.max(this.fireTimer, 0.65);
    }

    updateDivers(dt, alive) {
      for (const enemy of alive) {
        if (!enemy.dive) continue;
        enemy.dive.totalTime += dt;
        enemy.dive.phaseTime += dt;
        if (enemy.state === 'diveWarning') {
          enemy.telegraph = Math.max(0, enemy.telegraph - dt);
          if (enemy.telegraph === 0) this.launchDive(enemy);
          continue;
        }
        // Normal paths stay on screen. An escaped flight heads back; a corrupt
        // or stranded flight retires without points instead of stalling a wave.
        if (!Number.isFinite(enemy.x + enemy.y) || enemy.dive.totalTime > 12) {
          enemy.alive = false;
          continue;
        }
        if (enemy.x < -40 || enemy.x > WIDTH + 40 || enemy.y < -40 || enemy.y > HEIGHT + 40) enemy.state = 'returning';
        enemy.trail.push({ x: enemy.x, y: enemy.y });
        if (enemy.trail.length > 6) enemy.trail.shift();
        const oldX = enemy.x;
        const oldY = enemy.y;
        let distance = this.difficulty.diveSpeed * dt;
        if (enemy.state === 'diving') {
          while (distance > 0 && enemy.dive.index < enemy.dive.path.length) {
            const next = enemy.dive.path[enemy.dive.index];
            const length = Math.hypot(next.x - enemy.x, next.y - enemy.y);
            if (length <= distance) {
              enemy.x = next.x;
              enemy.y = next.y;
              distance -= length;
              enemy.dive.index++;
            } else {
              enemy.x += (next.x - enemy.x) / length * distance;
              enemy.y += (next.y - enemy.y) / length * distance;
              distance = 0;
            }
          }
          if (enemy.dive.index === enemy.dive.path.length) {
            enemy.state = 'returning';
            enemy.dive.phaseTime = 0;
          }
        } else if (enemy.state === 'returning') {
          const slot = this.formationSlot(enemy);
          const length = Math.hypot(slot.x - enemy.x, slot.y - enemy.y);
          distance *= 0.9;
          if (length <= distance) {
            Object.assign(enemy, slot);
            enemy.state = 'formation';
            enemy.attack = null;
            enemy.dive = null;
            enemy.trail = [];
            enemy.attackCooldown = 4;
            this.diveTimer = Math.max(this.diveTimer, 0.9);
          } else {
            enemy.x += (slot.x - enemy.x) / length * distance;
            enemy.y += (slot.y - enemy.y) / length * distance;
          }
        }
        enemy.heading = Math.atan2(enemy.y - oldY, enemy.x - oldX) - Math.PI / 2;
      }
    }

    updateEnemyFire(dt, alive) {
      this.attackGap = Math.max(0, this.attackGap - dt);
      this.fireTimer -= dt;
      this.diveTimer -= dt;
      this.spreadTimer -= dt;
      if (this.pendingShooter) {
        const shooter = this.pendingShooter;
        shooter.telegraph -= dt;
        if (!shooter.alive) {
          this.pendingShooter = null;
          this.attackGap = Math.max(this.attackGap, 0.25);
        }
        else if (shooter.telegraph <= 0) {
          const dx = clamp(this.player.x - shooter.x, -340, 340);
          const dy = Math.max(90, this.player.y - shooter.y);
          const speed = this.difficulty.bulletSpeed;
          const spread = shooter.attack === 'spread';
          const aim = Math.atan2(dy, dx);
          for (const offset of spread ? [-0.16, 0, 0.16] : [0]) {
            this.enemyBullets.push({ x: shooter.x, y: shooter.y + 16, prevX: shooter.x, prevY: shooter.y + 16, vx: Math.cos(aim + offset) * speed, vy: Math.sin(aim + offset) * speed, radius: 5 });
          }
          shooter.telegraph = 0;
          shooter.muzzleFlash = 0.09;
          shooter.attack = null;
          shooter.attackCooldown = spread ? 3.6 : 0.8;
          this.pendingShooter = null;
          this.attackGap = spread ? 1.05 : this.difficulty.attackGap;
          this.fireTimer = spread ? 1.4 : this.difficulty.fireInterval * (0.9 + this.random() * 0.2);
          if (spread) this.spreadTimer = this.difficulty.spreadInterval;
          this.events.push('enemyShoot');
        }
        return;
      }
      if (this.attackGap > 0 || alive.some(enemy => enemy.state === 'diveWarning') || this.enemyBullets.length >= 18) return;
      const formed = alive.filter(enemy => enemy.alive && enemy.state === 'formation');
      if (this.wave >= 3 && this.spreadTimer <= 0 && this.enemyBullets.length <= 15) {
        const spreads = formed.filter(enemy => enemy.role === 'spread' && enemy.attackCooldown === 0);
        if (spreads.length) {
          this.pendingShooter = spreads[Math.floor(this.random() * spreads.length)];
          this.pendingShooter.attack = 'spread';
          this.pendingShooter.telegraph = 0.6;
          return;
        }
      }
      if (this.wave >= 2 && this.diveTimer <= 0) {
        const divers = formed.filter(enemy => enemy.role === 'diver' && enemy.attackCooldown === 0 && enemy.y <= 355);
        if (divers.length && this.beginDive(divers[Math.floor(this.random() * divers.length)])) return;
      }
      if (this.fireTimer <= 0) {
        // Only the front surviving ship in each column can shoot.
        const front = new Map();
        for (const enemy of formed) {
          if (!front.has(enemy.col) || front.get(enemy.col).row < enemy.row) front.set(enemy.col, enemy);
        }
        const shooters = [...front.values()].filter(enemy => enemy.attackCooldown === 0);
        if (!shooters.length) return;
        this.pendingShooter = shooters[Math.floor(this.random() * shooters.length)];
        this.pendingShooter.attack = 'shot';
        this.pendingShooter.telegraph = 0.3;
      }
    }

    updateEffects(dt) {
      this.shake = Math.max(0, this.shake - dt);
      this.damageFlash = Math.max(0, this.damageFlash - dt);
      this.player.muzzleFlash = Math.max(0, this.player.muzzleFlash - dt);
      this.player.damageFlash = Math.max(0, this.player.damageFlash - dt);
      for (const enemy of this.enemies) enemy.muzzleFlash = Math.max(0, enemy.muzzleFlash - dt);
      for (const flash of this.flashes) flash.life -= dt;
      this.flashes = this.flashes.filter(flash => flash.life > 0);
      if (this.weaponNotice) {
        this.weaponNotice.life -= dt;
        if (this.weaponNotice.life <= 0) this.weaponNotice = null;
      }
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
