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
- End: pending.
- Scope: distinct formation/diver/spread behaviors, gradual introductions, readable warnings and attack gaps, reliable diver return and wave completion, focused regression coverage. Deployment remains for later.
