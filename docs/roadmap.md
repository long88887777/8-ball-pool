# 8 Ball Pool Roadmap

This roadmap records the planned evolution after the first playable MVP. It is a planning reference, not an implementation plan. Each version can be revised before work begins.

## Current State: Multi-Mode Competitive Prototype

The game has moved beyond the original MVP. It is a browser-based pool game built with Vite, TypeScript, Phaser 3, Supabase, and a professional physics layer. It now supports local two-player, AI opponent, challenge mode, online matchmaking/rooms, 8-ball and 9-ball rules, cue spin, shot clock, online chat/rematch, player growth stats, daily tasks, wallet/cue collection, and a mock recharge foundation.

## V1.1: Visual And Shot-Feel Refinement

### Goal

Upgrade the MVP from a rough playable prototype into a more polished pool-hall experience.

### Scope

- Add a refined visible cue stick with wood tone, tip, ferrule, shadow, and better table alignment.
- Animate the cue stick during aim, pullback, strike, and release.
- Improve aiming feedback with cleaner guide lines and power presentation.
- Refine table visuals: wood rails, pocket depth, cloth texture, lighting, and shadows.
- Refine ball visuals: better highlights, shadows, color treatment, and optional ball numbers.
- Add basic sound effects for cue strike, ball collision, rail contact, and pocketing.
- Tune physics feel: shot force, friction, restitution, pocket radius, and rest threshold.
- Improve responsive layout so the table remains readable on smaller screens.

### Non-Goals

- No full 8-ball rules.
- No spin or English.
- No AI opponent.
- No online play or persistence.

### Acceptance Criteria

- The cue stick feels like the player's primary interaction object, not a simple line.
- A shot has a clear aim, pullback, strike, motion, and settle rhythm.
- The table and balls look intentionally designed rather than placeholder-like.
- The game remains playable and stable after visual changes.

## V1.2: Practice Mode Expansion

### Goal

Make single-player practice more complete and replayable after the visual foundation is improved.

### Scope

- Add a full 15-ball rack option.
- Add clear-table completion state.
- Track best stroke count for the current browser session.
- Add simple practice variants, such as free practice, limited-stroke clear, and target-ball challenge.
- Improve restart/new-rack controls.
- Add optional basic aim assist that can be enabled or disabled.

### Non-Goals

- No competitive 8-ball rule enforcement.
- No AI.
- No account-based records.

### Acceptance Criteria

- Practice mode gives the player a reason to replay beyond casual shooting.
- The player can clear a rack and see a meaningful result.
- Added modes do not clutter the first-screen game experience.

## V2: Local Two-Player 8-Ball

### Goal

Turn the practice table into a real local 8-ball game for two players sharing one device.

### Scope

- Add alternating turns.
- Add solids/stripes assignment after the first legally pocketed ball.
- Add legal target detection.
- Add foul handling for cue-ball pocket and illegal first contact.
- Add ball-in-hand or simplified cue-ball placement after fouls.
- Add black-ball win/loss conditions.
- Add turn, group, foul, and win-state HUD.

### Non-Goals

- No AI opponent.
- No online multiplayer.
- No advanced tournament rule variants.
- No spin system unless already introduced separately.

### Acceptance Criteria

- Two players can complete a full local 8-ball game.
- The game clearly explains whose turn it is and what happened after each shot.
- Win/loss states are unambiguous.

## V3: Simplified Spin System

### Goal

Add approachable cue-ball spin controls without attempting a full professional billiards simulation.

### Scope

- Add a cue-ball contact-point control UI.
- Support simplified top spin, back spin, left spin, and right spin.
- Let spin influence cue-ball follow/draw behavior and rail exit angles.
- Add visual feedback showing the selected contact point.
- Add a practice mode or tooltip-free visual cue that helps players learn spin behavior.

### Non-Goals

- No full rigid-body rotational simulation.
- No jump shots or masse shots.
- No professional-grade spin physics.

### Acceptance Criteria

- Spin creates meaningful strategic differences without making shots feel unpredictable.
- The control is understandable at a glance.
- Players can ignore spin and still play normally.

## V4: Human Vs Computer AI

### Goal

Add a computer opponent after the physics, rules, and controls are stable.

### Scope

- Add a simple AI that finds direct potting opportunities.
- Add difficulty levels through aim error, shot strength limits, and decision quality.
- Add basic tactical choices, such as safety shots when no clear pot exists.
- Add AI turn pacing and shot preview timing so the opponent feels readable.
- Reuse V2 rules for legal target and win/loss decisions.

### Non-Goals

- No neural-network AI.
- No deep multi-shot planning in the first AI version.
- No online matchmaking.

### Acceptance Criteria

- The AI can finish turns without getting stuck.
- Easy AI feels beatable and imperfect.
- Harder AI makes visibly better shot choices.
- AI behavior remains performant in the browser.

## V5: Domestic Recharge Foundation

### Goal

Add a safe recharge foundation for authenticated players without launching real-money payment until merchant credentials and provider callbacks are ready.

### Scope

- Add recharge packages, recharge orders, and wallet ledger tables.
- Add backend-only recharge confirmation so paid coins are not minted by browser code.
- Add a mock payment channel for development and staging verification.
- Add a restrained recharge dialog in the game UI.
- Keep WeChat Pay and Alipay as future provider adapters over the same order and ledger model.

### Non-Goals

- No real WeChat Pay or Alipay production launch in the first slice.
- No overseas payment aggregator integration.
- No full wallet hardening for every game reward and purchase until the next payment phase.

### Acceptance Criteria

- A signed-in test player can create a recharge order, complete mock payment, and see coins arrive.
- Repeating the same payment confirmation does not add coins twice.
- Recharge grants are recorded in an append-only wallet ledger.
- The existing game remains playable if recharge UI is hidden or mock payments are disabled.

## V6: Competitive Experience Phase 1

### Goal

Improve the game for repeat competitive play by strengthening online rematch records, recent match history, shot controls, AI personality, and menu/localization clarity.

### Scope

- Add per-game identity inside an online room so rematches create separate match records.
- Reset online match tracking correctly when a rematch starts.
- Add lightweight recent match details with per-shot summaries.
- Add aim control settings for sensitivity and power fine-tuning without replacing drag-to-shoot.
- Extend AI difficulty profiles with risk, safety, imperfection, and pacing traits.
- Improve menu hierarchy and reduce mixed-language hardcoded labels in normal gameplay.

### Non-Goals

- No full animated replay.
- No server-authoritative physics or anti-cheat.
- No ranked seasons, leaderboards, friends, clubs, or tournaments.
- No full economy hardening or real-money payment launch.
- No rewrite of core 8-ball/9-ball rules.

### Acceptance Criteria

- Two online rematches in the same room produce two independent match records.
- Old match records and old recent match data remain readable.
- Players can inspect recent match details and shot summaries.
- Keyboard fine aim and power controls are deterministic, tested, and discoverable.
- AI difficulties feel behaviorally distinct without breaking existing AI tests.
- Primary menu actions are visually and semantically clearer than economy/settings actions.
- Normal Chinese and English flows avoid obvious mixed-language labels.

## Suggested Development Order

1. V1.1: Visual and shot-feel refinement.
2. V1.2: Practice mode expansion.
3. V2: Local two-player 8-ball.
4. V3: Simplified spin system.
5. V4: Human vs computer AI.
6. V5: Domestic Recharge Foundation.
7. V6: Competitive Experience Phase 1.

## Notes

- V1.1 should come before larger rule work because every future mode depends on the core shot feel.
- V3 and V4 can swap order depending on whether the next priority is realism or game variety.
- Each version should get its own design spec and implementation plan before coding begins.
