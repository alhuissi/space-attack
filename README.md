# Space Attack

A small, dependency-free browser arcade shooter built with plain JavaScript and Canvas 2D. All ships, effects, and sounds are generated in code.

## Run

Open `index.html` directly in a current desktop browser, or serve this folder:

```sh
python3 -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000). No installation or build step is needed. A keyboard is required; the playfield scales to fit the browser while keeping its 3:2 proportions.

## Controls

- **WASD / arrow keys:** move within the lower flight area.
- **Hold Space:** fire.
- **Enter:** start or restart.
- **P / pause button:** pause or resume.
- **M / sound button:** mute or unmute synthesized sounds.

Destroy the formation to advance to the next wave. Coral ships award **150 points**, pink ships **100**, and ochre ships **75**. Enemy shots and ship collisions cost one of your three lives. After a hit, your ship flashes and briefly becomes invulnerable. Losing all lives ends the mission; restarting resets the score, wave, lives, and active objects.

Wave 1 introduces aimed formation fire. From wave 2, pink hooked-wing ships signal a dive, commit to a swoop, then curve away and rejoin the formation. From wave 3, ochre heavy ships occasionally fire a narrow three-shot fan after a warning, followed by a longer cooldown. Later waves combine these attacks, with capped speeds, firing rates, and threats plus gaps between attacks. From wave 5, up to two divers can attack at once. Watch the warning cues and keep moving.

The game pauses when its tab is hidden or focus is lost. Resume when you're ready. Gameplay keys do not scroll the page. Best score is kept locally when browser storage is available.

## Files

- `index.html` — game shell, HUD, screens, and controls.
- `styles.css` — responsive layout and visual styling.
- `engine.js` — simulation, formations, bullets, and collisions.
- `renderer.js` — Canvas ships, starfield, and effects.
- `game.js` — browser input, game loop, audio, and screen state.
- `prompts.md` — exact user prompts.
- `WORK_LOG.md` — work timestamps and verification results.

## Checks

If Node.js is available, run `node --test tests/*.test.js` for the dependency-free simulation and browser-controller tests. Node.js is not needed to play.
