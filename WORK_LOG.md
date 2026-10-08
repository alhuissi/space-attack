# Work log

All local timestamps use Asia/Taipei (UTC+08:00).

## First playable version

- Start: **2026-10-08 13:21:14 +08:00** (2026-10-08 05:21:14 UTC).
- End of implementation and verification: **2026-10-08 13:44:07 +08:00** (2026-10-08 05:44:07 UTC).
- Implementation session resumed: **2026-10-08 13:33:14 +08:00** (2026-10-08 05:33:14 UTC). The repository contained the brief-recording commit; its two missing documentation files were restored.
- Scope: original Canvas 2D arcade game, responsive shell, complete game flow, input/focus safety, synthesized audio, documentation, and verification.

The first complete playable version was running by approximately **13:38 +08:00**, within the requested 35–40 minute window from the original recorded start. The recorded start-to-verification window is 22 minutes 53 seconds, including the gap before this implementation session resumed.

### Delivered

- Plain JavaScript and Canvas 2D, with original ships and effects drawn in code; no runtime dependencies, build step, or remote assets.
- Formation movement, telegraphed aimed enemy fire, held player fire, three lives, score, capped wave progression, 1.5-second damage immunity, full restart, and synthesized audio with mute.
- Responsive 3:2 playfield, start/game-over/pause screens, persistent controls, best-score storage, focus-loss protection, and explicit resume after automatic pause.
- Short run instructions and controls in README.md; original request preserved in prompts.md.

### Verification

- **Actual browser:** start via button and Enter; arrow movement; held Space fires continuously and destroys enemies; score increases; enemy fire consumes all lives; game-over screen shows the final score (650 in the checked run); restart restores score 0, wave 1 and three lives. Pause/resume and mute/unmute controls work. No JavaScript console warnings or errors were observed.
- **Responsive layout:** checked desktop, 390 × 844, and 320 × 568 viewports. The start screen fits the smallest checked playfield, and there is no horizontal overflow. Temporary viewport overrides were reset.
- **Automated tests:** `node --test tests/*.test.js` — **25 passed, 0 failed**. Includes diagonal speed, movement bounds, firing cadence, swept collisions, nearest-target ordering, ship contact, simultaneous-hit immunity, aimed fire, capped difficulty, waves, full restart, scroll prevention, and the actual browser controller's focus/visibility event handling. Hidden-tab handling was tested through controller events because the in-app browser's separate views did not trigger real document hiding.
- **Static checks:** all three JavaScript files passed `node --check`; `git diff --check` passed.
- Fixed the shot-ordering edge case found during review and added a regression test. Tightened small-screen overlay spacing after visual inspection.

### Known limits

- A keyboard is required; touch controls are outside this version's scope.
- Late-wave difficulty has capped values and automated coverage, but its balance awaits the user's playtesting.
- No known gameplay blockers at delivery.

## Enemy behavior and difficulty pass

- Start: **2026-10-08 14:00:36 +08:00** (2026-10-08 06:00:36 UTC).
- End of implementation and verification: **2026-10-08 14:12:05 +08:00** (2026-10-08 06:12:05 UTC).
- Scope: distinct formation/diver/spread behaviors, gradual introductions, readable warnings and attack gaps, reliable diver return and wave completion, focused regression coverage. Deployment remains for later.

### Changed

- Wave 1 keeps formation movement and warned single aimed shots. Wave 2 enables pink divers: a 0.65-second warning commits the player's position, followed by a curved swoop, escape curve, and return to the moving formation slot. Wave 3 enables ochre spread shooters: a 0.6-second warning precedes a narrow three-shot fan and longer cooldown.
- Later waves combine these attacks. Dive speed caps at 320 pixels/second, enemy bullets at 265 pixels/second, and simultaneous divers at one through wave 4 and two from wave 5. Ordinary fire, dive intervals, and spread intervals have lower limits; volley size and live bullets are capped. The shared scheduler spaces warnings and provides a recovery gap after launches and volleys.
- Living divers retain their formation slots for boundary calculations, count toward wave completion throughout flight, and rejoin without teleporting. Offscreen flights return; a corrupt or stranded flight has a retirement failsafe so it cannot stall the wave or award unearned points.
- Small chevrons, muzzle pips, warning arcs/fan ticks, and faint flight trails distinguish existing silhouettes. Relative swept collisions preserve fairness when ships and the player move between frames.
- Controls, screens, score values, three lives, damage immunity, and browser-controller behavior are preserved. No deployment or runtime dependencies added.

### Verified

- `node --test tests/*.test.js`: **46 passed, 0 failed** — the original 25 tests plus 21 focused enemy tests. Covers automatic wave 2 introduction; committed targets; simultaneous caps; diver return and stable formation bounds; live-diver wave blocking and shooting/scoring; offscreen recovery; killed warning cancellation; narrow three-shot fans and recovery gaps; moving ship collisions; multiple-hit immunity; pause/resume during warning, dive, and return; and complete restart cleanup of paths, trails, queues, cooldowns, and timers.
- A deterministic two-minute wave 8 simulation completed with finite positions, capped actual flight speeds, at most 18 live enemy bullets and two active divers, repeated dive returns and fans, and no normal flights requiring retirement.
- Browser smoke check: unchanged start screen, Enter start, held firing and scoring, pause, and no console warnings/errors. A temporary browser fixture using the actual engine and renderer verified dive warnings, spread warnings, and an active dive with three fan projectiles. Fixture files and its tab were removed after screenshots; the normal game was left on its start screen.
- All three production JavaScript files passed `node --check`; `git diff --check` passed. Independent source review found no unresolved issues.

### Next personal playtest

- Wave 2: whether the pink warning gives enough time to move away from its committed target, and whether the return path stays readable.
- Wave 3: whether the fan warning and post-volley gap feel fair, particularly near the sides and while moving upward.
- Wave 5 onward: whether two divers plus occasional fans feel engaging without becoming crowded. Pause mid-attack and resume during the run; restart after a loss to confirm the experience stays clean.
- No known gameplay blockers. Timing and later-wave balance still need the user's subjective playtest.
