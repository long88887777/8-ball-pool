# Pool V1.1 And V1.2 Refinement Design

## Product Goal

Upgrade the current playable MVP into a more polished single-player pool practice game. V1.1 focuses on realistic visual and shot-feel refinement. V1.2 expands the practice mode so the player has clearer goals and replay value.

## Classification

This is Level 3 work because it changes user-facing gameplay, rendering, interaction flow, audio feedback, practice mode state, and module boundaries. It should proceed through a written implementation plan before code changes.

## Current Baseline

The current MVP is a Vite, TypeScript, Phaser 3, and Matter-based browser game. It has a single `PoolScene`, basic primitive-rendered table and balls, drag aiming, shot force, collisions, pocket scoring, cue-ball reset, restart, and unit tests for pure geometry and state helpers.

The current weakness is presentation and game feel: the cue stick is only a thick line, the table and balls are visually coarse, there is no sound, and practice mode has no full rack, completion result, or best-score loop.

## Target User

The target player is still a casual desktop web player who wants a believable pool-hall experience without advanced controls. The player should feel that every shot has a physical cue-stick rhythm, while the practice mode remains simple enough to understand immediately.

## V1.1 Scope: Visual And Shot-Feel Refinement

### Cue Stick

Add a refined visible wooden cue stick as a first-class interaction object. The cue should have a tapered wooden shaft, darker butt end, ferrule, leather tip, subtle highlight, and table shadow. It should be drawn from reusable Phaser graphics or generated textures rather than imported image assets.

During aiming, the cue aligns behind the cue ball. Dragging farther pulls the cue back farther. On release, the cue performs a short strike animation toward the cue ball before the cue ball receives impulse. The delay should be brief enough to feel responsive.

### Aiming And Power

The aim guide should become slimmer and more restrained so the cue stick carries the main visual weight. Power should be represented through cue pullback distance plus a compact power indicator near the rail or HUD. Tiny drags still cancel without incrementing strokes.

### Table, Pockets, And Balls

Refine the table with deeper wood rails, more convincing pockets, cloth texture, subtle lighting, and better depth separation between room, rails, cloth, pockets, and balls. Refine balls with clearer highlights, shadows, optional numbers, and more distinct colors.

### Audio

Add generated or lightweight procedural sound effects for cue strike, ball collision, rail contact, and pocketing. Audio should start only after user interaction to comply with browser autoplay restrictions. The game must still work if audio cannot play.

### Physics Feel

Tune shot impulse, friction, air friction, restitution, pocket radius, and rest threshold after visual changes. Keep tuning constants centralized. Do not introduce spin, English, jump shots, or custom collision solving.

## V1.2 Scope: Practice Mode Expansion

### Full Rack

Add a 15-ball rack mode as the default practice layout unless it makes the table feel overcrowded. Use a stable triangle layout with enough separation to avoid physics overlap at spawn.

### Clear-Table Completion

When all target balls are pocketed, show a clear-table completion state with score, strokes, and best stroke count. The player should be able to start a new rack without losing the first-screen gameplay focus.

### Local Best Stroke Count

Track best stroke count locally for the browser using `localStorage`. This is local-only and does not require accounts or backend storage.

### Practice Variants

Support a minimal mode model with:

- Free practice: simple rack and restart.
- Clear-table challenge: finish the rack in as few strokes as possible.

Do not add multiple complex challenge types in this phase. Limited-stroke and target-ball challenge can remain future work unless the implementation stays small after the core V1.2 work is complete.

### Controls And HUD

Improve restart/new-rack controls so the player can clearly start another rack after completion. Add only the HUD elements needed for the current mode, such as mode label, strokes, best, remaining balls, and restart/new rack. Avoid a menu-heavy interface.

### Aim Assist

Add an optional basic aim assist only if it stays visually restrained. It can show a short first-contact projection, not a full multi-cushion or potting solver. The assist should be toggleable and should not be required to play.

## Non-Goals

- No local two-player 8-ball rules.
- No solids/stripes ownership or black-ball win/loss.
- No AI opponent.
- No spin or English.
- No online play, account system, backend, leaderboard, or remote persistence.
- No imported paid art/audio assets.
- No photo-realistic asset pipeline.

## Architecture

The current `PoolScene.ts` should be split where it improves clarity. The implementation should introduce small focused modules rather than adding every V1.1/V1.2 behavior to the existing scene file.

Expected module boundaries:

- `constants.ts`: shared dimensions, physics tuning, colors, rack definitions.
- `geometry.ts`: pocket checks, power calculations, rack layout helpers, table-ready helpers.
- `state.ts`: game state transitions, clear-table completion, best-stroke handling helpers.
- `rendering` or scene helper modules: cue rendering, table rendering, ball texture generation, and HUD bridging when useful.
- `PoolScene.ts`: scene orchestration, Phaser lifecycle, input binding, and calling helpers.

The scene should remain understandable without reading every rendering detail inline.

## Data Model

State should include score, strokes, remaining target balls, cue-ball pocketed flag, current mode, rack status, completion flag, and optional best stroke count.

Persistence is limited to `localStorage` for best stroke count. If `localStorage` is unavailable, the game should continue without best-score persistence.

No database, migrations, API contracts, or backend events are involved.

## UI States And Interaction Flow

### Normal Ready State

The table is still. The cue stick is visible behind the cue ball when the pointer begins aiming. HUD shows mode, strokes, remaining balls, and best if available.

### Aiming State

The cue rotates around the cue ball, pulls back with drag distance, and displays restrained aim/power feedback. Releasing with enough power starts the strike sequence. Releasing with too little power cancels.

### Strike State

The cue briefly moves forward, then applies impulse to the cue ball. Input is locked as balls move.

### Balls Moving State

Cue and aim feedback are hidden or de-emphasized. Pockets, collision sounds, and score updates can happen while balls move.

### Settled State

When all balls stop, cue-ball reset occurs if needed. If targets remain, the next shot becomes available. If no targets remain, the completion state appears.

### Completion State

The HUD/message area shows rack cleared, strokes, and best stroke count. A new-rack action is available.

## Error Handling

- Audio failures should not break gameplay.
- `localStorage` failures should disable best-score persistence quietly.
- Cue-ball pocket reset should keep the cue ball from overlapping target balls when possible.
- Rack creation should avoid overlapping balls at spawn.
- If a browser blocks sound until interaction, sound should begin after the first valid pointer interaction.

## Testing Strategy

Add unit tests for pure logic:

- 15-ball rack layout count and non-overlap.
- Shot power and cue pullback calculations.
- State transitions for completion and best stroke count.
- Safe local best-score read/write behavior through injectable storage.

Use browser smoke checks for visual and interactive behavior:

- Page renders nonblank.
- Cue stick appears during aim.
- Cue strike increments strokes and moves the cue ball.
- Restart/new rack restores the rack.
- Completion state appears when targets are cleared through state-level or controlled scene checks.

## Performance And Compatibility

The target remains modern desktop browsers. Phaser bundle size warnings are acceptable for now. Rendering should continue using Phaser primitives/generated textures so there are no external asset loading risks. Keep object counts low and avoid per-frame DOM updates except HUD changes.

## Rollout And Rollback

Implement V1.1 first and verify the original MVP loop still works. Then implement V1.2 practice expansion. Each milestone should be committed separately. Rollback can revert the V1.1 or V1.2 milestone commit group independently.

## Risks

- Cue strike animation can make controls feel laggy if the delay is too long.
- 15 balls can reveal physics overlap or rest-threshold issues.
- Audio can become annoying if collision sounds trigger too often.
- Splitting `PoolScene.ts` too aggressively can create unnecessary abstraction; split only around clear responsibilities.

## Deferred Work

- Full 8-ball competitive rules remain V2.
- Spin remains V3.
- AI remains V4.
- Advanced challenge modes can be added after V1.2 if the simpler practice loop is stable.
