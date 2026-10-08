# User prompts

## Prompt 1 — 2026-10-08

Build Space Attack, a polished browser arcade shooter, in this fresh project using plain JavaScript and Canvas 2D.

The attached screenshot is a reference for composition: the player’s spaceship near the bottom, enemy formations above, bullets and a simple HUD. Create original sprites and a cohesive visual style rather than copying its artwork. Keep the action immediately readable.

Implement a complete game:

- Move with WASD or arrow keys within the lower part of the playfield. Hold Space to fire.
- Show controls on the start screen and during gameplay.
- Enemies move in formation and shoot toward the player.
- Player bullets destroy enemies and award points. Enemy bullets and ship collisions cost a life.
- Display score, wave number and three lives. After damage, briefly flash the player and grant invulnerability so one collision cannot consume multiple lives.
- Clearing a formation starts the next wave. Increase enemy movement and firing frequency gradually, with sensible limits.
- Include a start screen, game-over screen with final score, and restart that fully resets the game.

Prioritize responsive controls, fair collisions and satisfying shooting. Use a restrained starfield, distinct player/enemy bullets and short hit/explosion effects. Add simple synthesized sounds and a mute control if the core game is already complete.

Keep the project small, readable and dependency-free, with straightforward run instructions. Scale the playfield to fit the browser while preserving its proportions. Prevent gameplay keys from scrolling the page, clear held keys on focus loss, and pause when the tab becomes hidden.

I have a two-hour total active-work limit, including my playtesting and reflection. Aim to deliver the first complete playable version within about 35–40 minutes, leaving time for iteration.

Briefly state your implementation plan, then build it. Check the full start → play → game over → restart flow, and report what you verified and any known issues. I will personally playtest it afterward.

Save this exact prompt and each subsequent user prompt in prompts.md. Record your work’s start/end timestamps. Include a short README with run instructions and controls.



Make small, focused commits as you go, grouping related changes together.
