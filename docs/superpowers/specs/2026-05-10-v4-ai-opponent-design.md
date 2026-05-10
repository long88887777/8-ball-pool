# V4: AI Opponent Design Spec

## Overview

Add a hard-difficulty AI opponent to the 8-ball pool game. The AI uses geometric simulation combined with Monte Carlo Tree Search (MCTS) to plan multi-step run-out routes (3-5 shots ahead). It strictly follows all 8-ball rules and provides visual feedback during its turn.

## Architecture

```
src/game/ai/
├── types.ts            — AI-specific type definitions
├── shotGenerator.ts    — Enumerates all legal shot candidates
├── fastPhysics.ts      — Lightweight physics simulator for prediction
├── evaluator.ts        — Table state evaluation function
├── mcts.ts             — Monte Carlo Tree Search engine
└── aiController.ts     — AI turn lifecycle and PoolScene integration
```

## Module Details

### 1. types.ts

```typescript
type ShotCandidate = {
  targetBallId: number;
  pocketIndex: number;
  direction: Vector;
  power: number;
  spin: Vector;
  type: 'pot' | 'safety';
  ghostBallPos: Vector;
};

type TableState = {
  ballPositions: Map<number, Vector>;
  pocketedBallIds: number[];
  currentPlayer: PlayerIndex;
  playerGroups: [BallGroup | null, BallGroup | null];
};

type FastSimResult = {
  ballPositions: Map<number, Vector>;
  pocketedBalls: number[];
  cueBallPocketed: boolean;
  firstContact: number | null;
  cushionAfterContact: boolean;
};

type MCTSNode = {
  state: TableState;
  shot: ShotCandidate | null;
  parent: MCTSNode | null;
  children: MCTSNode[];
  visits: number;
  totalValue: number;
  untriedShots: ShotCandidate[];
};
```

### 2. shotGenerator.ts

Enumerates all physically feasible shots given the current table state.

Algorithm:
1. Determine AI's legal target balls (based on 8-ball rules: own group, or 8-ball if group cleared)
2. For each target ball x each pocket (6):
   - Compute direction from pocket to target ball (the required hit angle)
   - Compute ghost ball position (where cue ball must be at impact)
   - Check if cue ball path to ghost ball is obstructed by other balls
   - Check if target ball path to pocket is obstructed
3. Filter out obstructed shots
4. For each viable shot, generate power variants (0.4, 0.65, 0.9) and spin variants (center, follow, draw)
5. Generate safety shot candidates (legal contact + hide cue ball)

Expected output: ~30-80 viable candidates after filtering.

### 3. fastPhysics.ts

Lightweight physics simulator that predicts shot outcomes in <1ms.

Simplifications vs real engine:
- 2D only, no spin-throw effects on ball-ball collisions
- Simple elastic collision model (momentum conservation + energy loss coefficient 0.92)
- Cushion bounce: mirror reflection + energy loss 0.78
- Pocket detection: ball center within capture radius of pocket
- Friction: linear deceleration (constant mu)
- Fixed timestep iteration until all balls rest (max ~200 steps at dt=0.016)

Accuracy target: cue ball final position error < 2 ball diameters.

Key interface:
```typescript
function simulateShot(
  balls: Map<number, Vector>,
  cueDirection: Vector,
  power: number,
  spin: Vector
): FastSimResult;
```

### 4. evaluator.ts

Scores a table state from 0.0 to 1.0 for the AI player.

Scoring dimensions (weighted sum):

| Dimension | Weight | Description |
|-----------|--------|-------------|
| Balls potted | 0.35 | Number of own balls pocketed this shot |
| Cue ball position quality | 0.30 | Accessibility to next best target |
| Route connectivity | 0.20 | How many remaining own balls have clear pot paths |
| Safety | 0.10 | Cue ball distance from opponent's easy shots |
| Foul penalty | -0.40 | Cue ball pocketed, no legal contact, etc. |

Position quality details:
- Distance from cue ball to nearest pottable ball (optimal: 1.5-4 ball diameters)
- Angle comfort: 30-60 degree cut angle is ideal
- Snooker penalty: cue ball blocked from all legal targets

Special cases:
- 8-ball potted legally: return 1.0 (win)
- 8-ball potted illegally or foul on 8-ball: return 0.0 (loss)

### 5. mcts.ts

UCT (Upper Confidence bounds applied to Trees) implementation.

Search flow per iteration:
1. Selection: Walk down tree following UCB1-highest child
2. Expansion: Pick one untried shot candidate, simulate with fastPhysics, create child node
3. Simulation (Rollout): From new node, random-play 3-5 shots, evaluate final state
4. Backpropagation: Propagate evaluation score up to all ancestors

Parameters:
- Time budget: 150ms
- Expected iterations: 200-500
- Max search depth: 5 (consecutive AI shots in a run-out)
- UCB1 exploration constant C: 1.41

Optimizations:
- Pre-sort candidates by evaluator quick score (expand promising shots first)
- Pot candidates expanded before safety candidates
- Merge similar shots (angle difference < 2 degrees)
- Branch terminates when turn passes to opponent (miss/foul)

### 6. aiController.ts

Manages AI turn lifecycle and integrates with PoolScene.

Turn flow:
```
Table settled + currentPlayer === AI player
  -> Set aiThinking = true, update HUD ("AI thinking...")
  -> Wait 500ms minimum display time
  -> Run shotGenerator to enumerate candidates
  -> Run MCTS search (150ms budget)
  -> Select best shot from root highest-value child
  -> If ball-in-hand: compute optimal placement, animate (200ms)
  -> Show aim line toward target (800ms, "AI aiming...")
  -> Execute shot via cue stick tween (reuse existing animation)
  -> Set aiThinking = false
  -> Physics engine takes over
  -> Wait for settled -> rules resolve -> loop if still AI turn
```

Ball-in-hand placement:
- Sample grid points across table surface (spacing ~30px)
- Filter legal placements (no overlap, not in pocket zone)
- For each valid point, quick-evaluate best available shot
- Select highest-scoring placement

Opening break:
- Human player (Player 1) always breaks first
- AI (Player 2) takes its first turn after the break resolves
- If AI gets ball-in-hand on its first turn (opponent fouled on break), it uses the placement algorithm above

## PoolScene Integration

New state fields:
```typescript
private gameMode: 'pvp' | 'ai' = 'ai';
private aiController: AIController | null = null;
private aiThinking = false;
```

Modified methods:
- `canAim()`: return false when aiThinking or AI turn
- `handleSettledTable()`: after rules resolve, check isAITurn -> scheduleAITurn()
- `restartRack()`: reset AI controller state
- `updateHud()`: show AI status messages

New methods:
- `isAITurn(): boolean`
- `scheduleAITurn(): void`
- `executeAITurn(): void`
- `showAIAimAnimation(shot): void`

## UI Changes

### HUD
- Player 2 name displays as "AI" / "电脑"
- AI turn messages: "AI 思考中..." / "AI 瞄准中..." / "AI 击球"
- Player card shows human/AI icon distinction

### Mode Toggle
- New button next to restart: "PVP" / "VS AI"
- Switching mode restarts the game
- Default mode: VS AI

### AI Shot Visualization
- During aim phase (~800ms), render aim line using existing renderAim logic
- Show cue stick pointing at target
- Player can observe AI intended shot before execution

## i18n Additions

```typescript
// English
aiThinking: 'AI thinking...',
aiAiming: 'AI aiming...',
aiShooting: 'AI shooting',
modeLabel: 'Mode',
modePvp: 'PVP',
modeAi: 'VS AI',
aiPlayerName: 'AI',

// Chinese
aiThinking: 'AI 思考中...',
aiAiming: 'AI 瞄准中...',
aiShooting: 'AI 击球',
modeLabel: '模式',
modePvp: '双人对战',
modeAi: '人机对战',
aiPlayerName: '电脑',
```

## Performance Budget

| Operation | Target Time |
|-----------|-------------|
| Shot generation | <10ms |
| Single fastPhysics simulation | <1ms |
| MCTS search (full) | 150ms |
| Total AI decision time | ~200ms |
| Visual delay (thinking + aiming) | ~1.5s |
| Total perceived AI turn time | ~2s |

## Testing Strategy

- Unit tests for shotGenerator: verify obstruction detection, candidate count
- Unit tests for fastPhysics: verify basic collision/pocket outcomes
- Unit tests for evaluator: verify scoring edge cases (win/loss/foul)
- Integration test: AI completes a full game without errors or infinite loops
- Manual testing: observe AI making reasonable decisions across multiple games
