/* Original ships and effects, drawn in a fixed 960 × 640 playfield. */
(() => {
  'use strict';

  const WIDTH = 960;
  const HEIGHT = 640;
  const ENEMY_COLORS = ['#eaa779', '#ea8292', '#cfb477'];
  const polygon = (ctx, points) => {
    ctx.beginPath();
    points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.closePath();
  };

  class SpaceAttackRenderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
      let seed = 81429;
      const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
      this.stars = Array.from({ length: 88 }, () => ({
        x: random() * WIDTH,
        y: random() * HEIGHT,
        radius: random() > 0.94 ? 1.35 : 0.45 + random() * 0.55,
        alpha: 0.12 + random() * 0.32,
        speed: 2 + random() * 5,
      }));
      this.resize();
    }

    resize() {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(this.canvas.clientWidth * ratio));
      const height = Math.max(1, Math.round(this.canvas.clientHeight * ratio));
      if (this.canvas.width !== width || this.canvas.height !== height) {
        this.canvas.width = width;
        this.canvas.height = height;
      }
    }

    draw(game) {
      const ctx = this.ctx;
      const time = game.time || 0;
      ctx.setTransform(this.canvas.width / WIDTH, 0, 0, this.canvas.height / HEIGHT, 0, 0);
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      this.background(time);
      ctx.save();
      if (game.shake > 0 && !game.paused && !this.reducedMotion.matches) {
        const strength = Math.min(game.shake * 18, 3);
        ctx.translate(Math.sin(time * 107) * strength, Math.cos(time * 89) * strength);
      }
      for (const bullet of game.playerBullets) this.playerBullet(bullet);
      for (const bullet of game.enemyBullets) this.enemyBullet(bullet);
      for (const enemy of game.enemies) {
        if (enemy.alive) this.enemy(enemy, time);
      }
      if (game.stage !== 'gameover') this.player(game.player, time, game.stage);
      this.effects(game.particles, game.rings);
      ctx.restore();
    }

    background(time) {
      const ctx = this.ctx;
      const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
      gradient.addColorStop(0, '#101620');
      gradient.addColorStop(0.65, '#0b111b');
      gradient.addColorStop(1, '#101b24');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      for (const star of this.stars) {
        const y = (star.y + time * star.speed) % HEIGHT;
        ctx.globalAlpha = star.alpha;
        ctx.fillStyle = '#b5c6d4';
        ctx.fillRect(star.x, y, star.radius, star.radius);
      }
      ctx.globalAlpha = 1;

      // Side marks quietly indicate the pilot's movement area.
      ctx.strokeStyle = 'rgba(117, 174, 183, 0.16)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(18, 410);
      ctx.lineTo(43, 410);
      ctx.moveTo(WIDTH - 43, 410);
      ctx.lineTo(WIDTH - 18, 410);
      for (let y = 438; y < HEIGHT - 24; y += 28) {
        ctx.moveTo(18, y);
        ctx.lineTo(24, y);
        ctx.moveTo(WIDTH - 24, y);
        ctx.lineTo(WIDTH - 18, y);
      }
      ctx.stroke();

      // A subtle instrument frame gives the space a composed arcade feel.
      ctx.strokeStyle = 'rgba(139, 162, 177, 0.15)';
      ctx.beginPath();
      for (const [x, y, dx, dy] of [[12, 12, 1, 1], [948, 12, -1, 1], [12, 628, 1, -1], [948, 628, -1, -1]]) {
        ctx.moveTo(x, y + dy * 13);
        ctx.lineTo(x, y);
        ctx.lineTo(x + dx * 22, y);
      }
      ctx.stroke();
    }

    player(player, time, stage) {
      const ctx = this.ctx;
      ctx.save();
      ctx.translate(player.x, player.y);
      if (player.invulnerable > 0) {
        ctx.globalAlpha = Math.floor(time * 13) % 2 ? 0.35 : 1;
      }

      const flame = 10 + Math.sin(time * 41) * 3;
      ctx.fillStyle = 'rgba(102, 219, 232, 0.13)';
      polygon(ctx, [[-8, 13], [0, 34 + flame], [8, 13]]);
      ctx.fill();
      ctx.fillStyle = '#70d8e2';
      polygon(ctx, [[-4, 12], [0, 19 + flame], [4, 12]]);
      ctx.fill();
      ctx.fillStyle = '#dcf8ee';
      polygon(ctx, [[-2, 12], [0, 21], [2, 12]]);
      ctx.fill();

      // Narrow nose, swept wings, inset cockpit: a legible silhouette.
      ctx.fillStyle = '#e9d9ac';
      polygon(ctx, [[0, -23], [7, -5], [18, 9], [18, 15], [7, 11], [4, 16], [-4, 16], [-7, 11], [-18, 15], [-18, 9], [-7, -5]]);
      ctx.fill();
      ctx.strokeStyle = '#fff0c9';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-16, 10);
      ctx.lineTo(-6, -3);
      ctx.lineTo(0, -20);
      ctx.lineTo(6, -3);
      ctx.lineTo(16, 10);
      ctx.stroke();
      ctx.fillStyle = '#a18f65';
      polygon(ctx, [[-15, 10], [-7, 5], [-7, 10], [-15, 12]]);
      ctx.fill();
      polygon(ctx, [[15, 10], [7, 5], [7, 10], [15, 12]]);
      ctx.fill();
      ctx.fillStyle = '#243744';
      polygon(ctx, [[0, -12], [4, -3], [3, 7], [-3, 7], [-4, -3]]);
      ctx.fill();
      ctx.fillStyle = '#87dde0';
      polygon(ctx, [[0, -10], [2, -4], [1.5, 1], [-1.5, 1], [-2, -4]]);
      ctx.fill();

      if (player.invulnerable > 0 && stage === 'playing') {
        ctx.strokeStyle = 'rgba(127, 218, 224, 0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, 0, 28, -Math.PI * 0.82, -Math.PI * 0.18);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, 28, Math.PI * 0.18, Math.PI * 0.82);
        ctx.stroke();
      }
      ctx.restore();
    }

    enemy(enemy, time) {
      const ctx = this.ctx;
      const type = enemy.type % 3;
      const inFlight = enemy.state === 'diving' || enemy.state === 'returning';
      if (inFlight && enemy.trail?.length) {
        // Small fading segments show flight direction without hiding shots.
        const points = [...enemy.trail, { x: enemy.x, y: enemy.y }];
        ctx.strokeStyle = ENEMY_COLORS[type];
        for (let i = 1; i < points.length; i++) {
          if (Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y) > 90) continue;
          ctx.globalAlpha = 0.06 + i / points.length * 0.2;
          ctx.lineWidth = 0.5 + i / points.length * 1.5;
          ctx.beginPath();
          ctx.moveTo(points[i - 1].x, points[i - 1].y);
          ctx.lineTo(points[i].x, points[i].y);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
      ctx.save();
      ctx.translate(enemy.x, enemy.y);
      if (inFlight) ctx.rotate(Math.sin(enemy.heading || 0) * 0.32);
      ctx.fillStyle = ENEMY_COLORS[type];
      if (type === 0) {
        polygon(ctx, [[-18, -5], [-11, -12], [-5, -6], [5, -6], [11, -12], [18, -5], [13, 5], [7, 5], [4, 13], [-4, 13], [-7, 5], [-13, 5]]);
      } else if (type === 1) {
        polygon(ctx, [[-18, -9], [-10, -3], [-6, -10], [6, -10], [10, -3], [18, -9], [16, 7], [9, 4], [5, 12], [-5, 12], [-9, 4], [-16, 7]]);
      } else {
        polygon(ctx, [[-16, -3], [-9, -11], [9, -11], [16, -3], [18, 8], [11, 5], [7, 12], [-7, 12], [-11, 5], [-18, 8]]);
      }
      ctx.fill();
      if (enemy.telegraph > 0) {
        ctx.strokeStyle = '#ffe7bd';
        ctx.lineWidth = 1.4;
        ctx.shadowColor = '#f6b797';
        ctx.shadowBlur = 7;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
      ctx.fillStyle = '#553e49';
      polygon(ctx, [[-7, -4], [7, -4], [5, 6], [0, 10], [-5, 6]]);
      ctx.fill();
      ctx.fillStyle = '#ffe3b6';
      ctx.fillRect(-9, -3, 5, 2);
      ctx.fillRect(4, -3, 5, 2);
      ctx.fillStyle = 'rgba(255, 238, 205, 0.45)';
      ctx.fillRect(-5, -9, 10, 1);
      ctx.fillStyle = `rgba(245, 144, 141, ${0.3 + Math.sin(time * 6 + enemy.col) * 0.1})`;
      ctx.fillRect(-2, 10, 4, 5);

      // These cues appear only once the corresponding role is enabled.
      ctx.strokeStyle = '#ffe3b6';
      ctx.lineWidth = 1.6;
      if (enemy.role === 'diver') {
        ctx.beginPath();
        ctx.moveTo(-4, 1);
        ctx.lineTo(0, 5);
        ctx.lineTo(4, 1);
        ctx.stroke();
        ctx.fillStyle = inFlight ? '#ffd2c3' : '#ad596c';
        polygon(ctx, [[-3, -10], [0, inFlight ? -21 : -15], [3, -10]]);
        ctx.fill();
      } else if (enemy.role === 'spread') {
        ctx.fillStyle = '#ffe3b6';
        for (const [x, y] of [[-7, 8], [0, 11], [7, 8]]) {
          ctx.beginPath();
          ctx.arc(x, y, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      if (enemy.telegraph > 0) this.enemyWarning(enemy, time);
      ctx.restore();
    }

    enemyWarning(enemy, time) {
      const ctx = this.ctx;
      const pulse = this.reducedMotion.matches ? 0.8 : 0.72 + Math.sin(time * 15) * 0.18;
      ctx.strokeStyle = enemy.attack === 'dive' ? '#ffc3cc' : '#f4dab0';
      ctx.globalAlpha = pulse;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (enemy.attack === 'dive' || enemy.state === 'diveWarning') {
        ctx.arc(0, 0, 25, Math.PI * 0.88, Math.PI * 2.12);
        for (const y of [20, 27]) {
          ctx.moveTo(-5, y);
          ctx.lineTo(0, y + 4);
          ctx.lineTo(5, y);
        }
      } else if (enemy.attack === 'spread') {
        for (const angle of [-0.5, 0, 0.5]) {
          ctx.moveTo(Math.sin(angle) * 19, Math.cos(angle) * 19);
          ctx.lineTo(Math.sin(angle) * 28, Math.cos(angle) * 28);
        }
        ctx.moveTo(-9, 17);
        ctx.lineTo(0, 19);
        ctx.lineTo(9, 17);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    playerBullet(bullet) {
      const ctx = this.ctx;
      ctx.fillStyle = 'rgba(245, 213, 139, 0.13)';
      ctx.fillRect(bullet.x - 3, bullet.y - 5, 6, 24);
      ctx.fillStyle = '#f0cc83';
      ctx.fillRect(bullet.x - 1.5, bullet.y - 6, 3, 16);
      ctx.fillStyle = '#fff1c3';
      ctx.fillRect(bullet.x - 1, bullet.y - 6, 2, 7);
    }

    enemyBullet(bullet) {
      const ctx = this.ctx;
      const length = Math.hypot(bullet.vx, bullet.vy) || 1;
      ctx.strokeStyle = 'rgba(239, 123, 133, 0.28)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(bullet.x, bullet.y);
      ctx.lineTo(bullet.x - bullet.vx / length * 15, bullet.y - bullet.vy / length * 15);
      ctx.stroke();
      ctx.fillStyle = 'rgba(243, 120, 138, 0.12)';
      ctx.beginPath();
      ctx.arc(bullet.x, bullet.y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f08a98';
      ctx.beginPath();
      ctx.arc(bullet.x, bullet.y, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffe0c7';
      ctx.beginPath();
      ctx.arc(bullet.x - 0.7, bullet.y - 0.7, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }

    effects(particles, rings) {
      const ctx = this.ctx;
      for (const ring of rings) {
        ctx.globalAlpha = Math.max(0, ring.life / ring.maxLife) * 0.65;
        ctx.strokeStyle = ring.color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2);
        ctx.stroke();
      }
      for (const particle of particles) {
        ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife);
        ctx.fillStyle = particle.color;
        const size = particle.size * (0.5 + ctx.globalAlpha * 0.5);
        ctx.fillRect(particle.x - size / 2, particle.y - size / 2, size, size);
      }
      ctx.globalAlpha = 1;
    }
  }

  window.SpaceAttackRenderer = SpaceAttackRenderer;
})();
