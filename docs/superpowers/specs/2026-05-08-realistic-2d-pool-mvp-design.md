# Realistic 2D Pool MVP Design

## Product Goal

Build a browser-based 2D pool practice game with a realistic pool-hall mood. The MVP should be immediately playable: aim, set power, shoot, watch balls collide and slow down, pocket target balls, track score and strokes, and restart.

## Target User

The first player is a casual web player who wants a believable pool-table feel without learning advanced billiards controls. The MVP assumes desktop mouse input first, with touch input supported by the same pointer handling when practical.

## Success Criteria

- The first screen is the playable table, not a landing page.
- The player can control shot angle and power with drag input.
- Balls collide, rebound from rails, slow down, and come to rest.
- Target balls that enter pockets are removed and score points.
- The cue ball is reset after being pocketed.
- The player cannot shoot again until all balls are nearly still.
- The UI shows score, stroke count, remaining balls, and a restart control.
- The visual direction reads as a realistic top-down pool hall: green cloth, wooden rails, dark room, ball highlights, and soft lighting.

## Non-Goals

- No spin, English, masse, jump shots, or cue-tip contact-point controls.
- No full 8-ball rules, stripes/solids ownership, fouls beyond cue-ball pocket reset, or win/loss state beyond clearing targets.
- No AI opponent or local multiplayer.
- No account system, backend, persistence, leaderboard, or online play.
- No photo-realistic asset pipeline; the MVP uses canvas/game primitives and lightweight visual polish.

## Core Gameplay

The game starts with a cue ball and a small rack of target balls on a standard-looking table. The player drags from the cue ball area to choose shot direction and power. Releasing the pointer applies an impulse to the cue ball. While any ball is moving above a small velocity threshold, input is locked.

Each target ball is removed when its center enters a pocket radius. Pocketing a target ball adds score. Pocketing the cue ball resets it to the break area after the table settles and adds a stroke penalty. Restart returns the table to its initial layout and resets score, strokes, and messages.

## Controls

- Pointer down near the cue ball starts aiming when the table is ready.
- Pointer drag shows a cue line, projected shot direction, and power indicator.
- Pointer release applies impulse proportional to drag distance, capped at a maximum power.
- Pointer cancel or escape-like cancellation is not required for MVP; releasing with tiny power cancels the shot.

## Architecture

Use a Vite browser app with Phaser 3. Phaser owns rendering, input, the scene lifecycle, and the Matter physics world. Game-specific logic is split into small modules:

- Table constants and geometry define dimensions, pockets, rails, and ball layout.
- Scoring/state utilities track score, strokes, remaining target balls, and readiness.
- The Phaser game scene composes the table, balls, input, physics, pocket checks, and UI.

Matter physics is used through Phaser's built-in Matter integration. The game should keep custom physics code minimal: no custom collision solver, no spin model, and no speculative realism features.

## UI And Visual Design

The page should feel like a dark billiards room around a top-down table. Use a restrained, realistic palette: dark room background, warm wood rails, green cloth, ivory cue ball, colored target balls, subtle highlights, and soft shadows. The HUD should be compact and readable, with tool-like controls rather than marketing sections.

The first viewport should show the playable table and HUD. It should not contain a hero section, explanatory onboarding card, or decorative content that competes with the game surface.

## Error Handling And Edge Cases

- If the cue ball is pocketed, hide or disable it until all balls settle, then reset it to the break area.
- If all target balls are pocketed, show a clear-table message and allow restart.
- If a shot is released with negligible drag, do not increment strokes and do not apply impulse.
- If a target ball overlaps a pocket due to physics tunneling, pocket detection runs every update and removes it as soon as detected.
- If the player clicks away from the cue ball, no aim state starts.

## Testing Strategy

Use focused unit tests for pure geometry and scoring helpers. Use a browser smoke check for Phaser rendering and interaction because the primary behavior is visual and physics-driven.

Unit tests should cover:

- Pocket detection by distance to pocket centers.
- Shot power clamping from drag distance.
- Score and stroke state updates.
- Table-ready detection from ball speed values.

Manual or automated smoke verification should cover:

- App loads locally.
- Table, balls, pockets, and HUD render.
- Dragging the cue ball displays aim feedback.
- Releasing a shot moves the cue ball and target balls.
- Balls slow down and input unlocks after rest.
- Target balls pocket and score updates.
- Cue ball pocket reset works.

## Performance And Compatibility

The MVP targets modern desktop browsers first. The scene uses a fixed logical table size with responsive page layout around it. Physics body counts are small, so the primary performance risk is not computation but unstable tuning. Keep friction, restitution, mass, and velocity thresholds centralized for easy adjustment.

## Rollback

The project starts from an empty repository. Rollback is straightforward: revert the initial app scaffold and generated files. The implementation should avoid external services or irreversible setup.

## Deferred Decisions

- Full 15-ball rack versus smaller beginner rack can be tuned during implementation; the MVP should ship with enough balls to demonstrate collisions and pocketing without overcrowding the first version.
- Advanced aim aids can be added later after core shot feel works.
- Spin and AI are explicitly deferred until the practice mode is stable.
