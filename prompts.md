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

Save this exact prompt and each subsequent user prompt in prompts.md. Record your work’s start/end timestamps. Include a short README with run instructions and controls.&#x20;



Make small, focused commits as you go, grouping related changes together.

## Prompt 2 — 2026-10-08

Improve Space Attack’s enemies and difficulty progression. I personally playtested the first version: it works correctly, but the enemies feel boring.

Preserve the existing controls, screens, visual style, scoring, lives and restart behavior. Focus this pass on making combat more engaging.

Give the existing enemy types distinct behaviors:

- Formation enemies: retain the current movement and single aimed shots.
- Divers: briefly signal their attack, leave formation, swoop toward the player’s position, then curve away and rejoin if they survive. Commit to their path rather than continuously chasing the player.
- Spread shooters: occasionally fire a narrow three-shot fan, with a visible warning and a longer cooldown than ordinary shots.

Introduce these gradually:

- Wave 1: straightforward formation combat.
- Wave 2: introduce one diver at a time.
- Wave 3: introduce occasional spread attacks.
- Later waves: gradually combine these threats, with capped speeds, firing rates and simultaneous divers.

Create short gaps between attacks so the player can reposition. Keep the opening approachable and make attacks clearly readable. Avoid overwhelming volleys or enemies appearing directly on the player. Distinguish enemy roles through their existing silhouettes and small visual cues.

Maintain reliable wave progression: diving enemies still count as living enemies, surviving divers return correctly, and leaving the screen cannot stall a wave. Formation boundaries must remain stable while enemies are diving. Preserve collision fairness and damage immunity.

Aim for a focused 20–25 minute implementation. Verify wave completion with divers active, scoring, collision damage, pause/resume and complete restart cleanup. Add focused tests for the new behavior and run the existing tests.

Make small, focused commits. Save this exact prompt in prompts.md. Report what changed, what you verified and what I should personally playtest next. Leave deployment for later.
