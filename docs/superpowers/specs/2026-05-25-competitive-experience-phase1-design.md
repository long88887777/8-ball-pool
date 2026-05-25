# Competitive Experience Phase 1 — Design

**Date**: 2026-05-25
**Status**: Approved
**Depends on**: Online matchmaking/state machine, match records, AI opponent, cue spin, growth stats

## Goal

把现有台球游戏从“功能很多”推进到“重度玩家愿意连续开局”的第一期竞技体验增强。第一期聚焦五个互相支撑的方向：

1. 在线公平性和重赛记录
2. 轻量回放和对局历史
3. 手感控制增强
4. AI 更像真人
5. 本地化和界面层级整理

## Player Experience

玩家完成一局在线或本地对战后，可以确信每一局都会被正确记录，包括同一个房间里的重赛。玩家能在菜单里查看最近对局详情，并看到每杆的关键摘要。击球时可以用更稳定的细调和力度控制，不必完全依赖一次拖拽。AI 不再只有“失误大小”差异，而会表现出更像真人的进攻/防守倾向。菜单入口更清晰，中文/英文文案更一致。

## Scope

### Included

- 为在线重赛引入每局唯一标识，避免 `matches.room_id unique` 导致同房间重赛只记录第一局。
- 重赛开始时重置当前局开始时间、当前 match id、杆数追踪和结算状态。
- 扩展最近对局数据，记录轻量 shot history：每杆选手、力度、旋转、是否犯规、进球、结果消息。
- 在成长面板或对局历史面板展示最近对局详情和每杆摘要。
- 加入控制设置：瞄准灵敏度、力度步进/锁定、细调提示和当前控制状态。
- 扩展 AI 难度资料为 AI profile：命中误差、力度误差、旋转误差、防守倾向、风险偏好、思考节奏。
- 清理主菜单层级，把成长、球杆、充值、设置收纳得更明确，并补齐常见硬编码文案的本地化。

### Not Included

- 不做完整动画级回放，不还原每一帧物理轨迹。
- 不做服务端权威物理判定；本期只修正可落地的结算唯一性和记录完整性。
- 不做排行榜、赛季、好友、锦标赛。
- 不做真实支付上线或经济系统重构。
- 不改核心 8 球/9 球规则。
- 不把 AI 改成神经网络或远端服务。

## Architecture

### Online Match Identity

当前 `public.matches.room_id` 是唯一键，`settle_online_match` 查到同 `room_id` 已有 match 后会直接返回旧 match id。因此同一房间重赛不会成为新记录。

本期引入 `game_seq integer not null default 1`：

- `matches` 唯一键从 `room_id` 改为 `(room_id, game_seq)`。
- `settle_online_match` 新增 `p_game_seq integer default 1`。
- `PoolScene` 新增 `onlineGameSeq` 字段，初始为 `1`。
- host 发 `rematch_start` 时带 `gameSeq`。
- 收到或发起重赛后，双方进入新局时同步 `onlineGameSeq`，重置 `matchStartedAt` 和 `currentMatchId`。

`RoomInfo` 不需要新增字段；同一房间内的局号只属于实时对局状态。

### Lightweight Shot History

新增纯数据模块 `src/game/matchHistory.ts`：

```ts
export type ShotHistoryEntry = {
  playerIndex: 0 | 1;
  ruleset: GameRuleset;
  powerPercent: number;
  spin: { x: number; y: number };
  pocketedBallIds: number[];
  foulReason: string | null;
  message: string;
};

export type MatchHistoryRecord = RecentMatchRecord & {
  ruleset: GameRuleset;
  shotHistory: ShotHistoryEntry[];
};
```

The existing `RecentMatchRecord` remains compatible. UI sanitizers accept old records without shot history and show a short empty state for them.

Shot history is local/player-facing state. It is saved with growth stats for signed-in users through existing `player_stats.recent_matches jsonb`, not as a new table in Phase 1. Supabase `matches` remains the authoritative online result table, while `recent_matches` powers the history UI.

### Controls

Keep the current drag-to-shoot model. Add a small control model in `shotControl.ts`:

- `AimControlSettings`: sensitivity (`fine`, `normal`, `fast`) and power step size.
- `resolveAimControlStep(settings, shiftKey)` returns rotation/power steps.
- Optional power lock applies only while aiming: once locked, arrow left/right changes angle without changing current pull distance.

The Phaser scene owns the live setting state and exposes it through a compact settings panel in the game shell.

### AI Profiles

Extend `AIDifficultyProfile` instead of replacing the AI:

- `riskTolerance`: prefers ambitious potting vs safer table leave.
- `safetyBias`: increases safety candidate selection when no clean pot exists.
- `tempoMs`: makes AI pause feel less mechanical.
- hard difficulty still plays strong, but keeps a tiny non-zero imperfection to avoid robotic play.

`AIController` consumes the profile through existing constructor options. The first implementation should avoid rewriting MCTS; it should bias candidate scoring and post-process selected shots.

### Localization And Menu Hierarchy

`i18n.ts` becomes the source for game shell labels that are currently hardcoded in `index.html` or `PoolScene.ts`. The first slice does not need a full app-wide framework; it should add missing copy keys and a small `applyShellCopy(language)` helper.

Menu hierarchy:

- Primary actions: AI, local two-player, challenge, online.
- Secondary actions: progress, collection/shop, recharge, settings.
- Settings hosts language and controls.

## Data Flow

### Online Rematch Settlement

1. Online match starts: `onlineGameSeq = 1`, `matchStartedAt = Date.now()`.
2. Game over calls `settle_online_match(room_id, game_seq, winner, reason, stats...)`.
3. Player requests rematch.
4. Host sends `rematch_start { startAt, breaker, gameSeq: onlineGameSeq + 1 }`.
5. Both clients call `performRematch`, update `onlineGameSeq`, reset match tracking, and set a new `matchStartedAt`.
6. Next game over inserts or returns `(room_id, game_seq)` match independently.

### Shot History

1. When a shot starts, record shooter, ruleset, power, spin.
2. While the shot resolves, collect pocketed ball ids and foul reason from existing rule state.
3. On turn resolution, append a compact `ShotHistoryEntry`.
4. On match settlement, attach the shot history to the local recent match record.
5. History UI reads `recentMatches` and opens a detail view for each match.

## Error Handling

- Missing `gameSeq` in older realtime messages defaults to `1`.
- Existing `matches` rows migrate with `game_seq = 1`.
- If `settle_online_match` fails, keep the current fallback upsert path but include `game_seq`.
- Old `recentMatches` without shot history remain valid.
- If a history record is malformed, sanitize it and show only the result row.
- If settings persistence fails, keep in-memory defaults for the session.

## Security And Fairness

This phase improves record correctness but does not make gameplay server-authoritative. The RPC still verifies participants and winner membership, but does not replay physics. That is an explicit limitation.

Coin and rank hardening is deferred. Any future ranked/season work should move competitive rewards and rating changes into server-side RPCs that verify match identity and idempotency.

## Testing Strategy

### Unit Tests

- `matchHistory.test.ts`: sanitizes old/new records, appends shot entries, caps history length.
- `shotControl.test.ts`: verifies settings step calculations and power lock behavior.
- `difficulty.test.ts` / `aiController.test.ts`: verifies AI profiles produce different risk/safety behavior without mutating shots.
- `onlineState` or `PoolScene.online.test.ts`: verifies rematch `gameSeq` synchronization.

### Database Tests / Static Verification

- Migration creates `game_seq`, replaces unique constraint, and updates indexes.
- `settle_online_match` returns different ids for `(same room, game_seq 1)` and `(same room, game_seq 2)`.
- Repeated settlement for the same `(room_id, game_seq)` is idempotent.

### UI/Manual Checks

- Start an online match, finish game 1, rematch, finish game 2, verify two rows in `matches`.
- Open recent history and inspect a match with shot entries.
- Change aim sensitivity and verify keyboard fine-tune changes feel but drag shooting still works.
- Switch language and verify main shell labels do not remain mixed English/Chinese.
- Start AI at each difficulty and verify pacing/choice differences are visible.

## Acceptance Criteria

- Online rematches produce one match record per game, not one per room.
- Existing rooms/matches remain readable after migration.
- Recent history shows match details and shot summaries without breaking old local records.
- Fine aim and power controls remain deterministic and test-covered.
- AI difficulty still passes existing tests and shows profile-based behavior.
- Primary menu is clearer, and the game shell no longer has obvious mixed-language labels in normal flow.
- `npm test` and `npm run build` pass.

## Rollout And Rollback

Roll out as a normal schema migration plus frontend deploy.

Rollback strategy:

- Frontend can ignore `game_seq` and continue with `1`.
- Database rollback is non-trivial because unique constraints change. Keep migration backward-compatible by preserving `room_id`, adding `game_seq`, and using additive function signature defaults.
- If history UI has issues, hide the detail action while keeping saved records.
- If AI profile bias feels wrong, revert profile fields to neutral values without touching rules or physics.

## File Impact Summary

| Type | Path | Purpose |
| ---- | ---- | ------- |
| Modify | `supabase/migrations/*` | Add match sequence and update settlement RPC |
| Modify | `src/online/types.ts` | Add optional `gameSeq` to rematch message |
| Modify | `src/game/PoolScene.ts` | Rematch sequence, match tracking reset, shot history capture, settings hooks |
| Add | `src/game/matchHistory.ts` | Pure history model and sanitizers |
| Modify | `src/game/growth/stats.ts` | Store optional shot history in recent records |
| Modify | `src/game/shotControl.ts` | Aim control settings helpers |
| Modify | `src/game/ai/difficulty.ts` | AI profile fields |
| Modify | `src/game/ai/aiController.ts` | Profile-driven shot selection bias |
| Modify | `src/game/i18n.ts` | Shell/menu/settings copy |
| Modify | `src/main.ts`, `index.html`, `src/styles.css` | History/settings/menu hierarchy UI |
| Add/Modify | `*.test.ts` | Coverage for each changed behavior |

## Deferred Follow-Ups

- Full animated replay from physics snapshots.
- Server-authoritative ranked settlement and anti-cheat.
- Leaderboards, seasons, tournaments, and friends.
- Complete account inventory/economy hardening.
