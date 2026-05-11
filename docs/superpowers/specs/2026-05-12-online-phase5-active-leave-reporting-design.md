# Online Phase 5 — Active Leave Reporting (Design)

**Date**: 2026-05-12
**Status**: Approved
**Depends on**: Phase 3 (heartbeat + state machine), Phase 4 (match records)

## Goal

在线对战中，当本端玩家**主动离开**对局页面（关闭标签 / 刷新 / 浏览器后退 / 点应用内「返回主菜单」按钮），对方在 **< 1 秒**内进入结算画面，而不是像现在这样要等满 30 秒心跳超时。

## Background

Phase 3 引入了 5 秒心跳 + 30 秒超时（`src/online/onlineState.ts` 的 `checkDisconnect`）。当前表现：只要一方离开页面，另一方必然要等 30 秒才会看到结算，体验糟糕。Phase 5 通过在页面卸载事件里主动发 `game_over(disconnect)` 消息缩短这个等待时间；30 秒心跳兜底保留，用于「消息发不出去」的极端场景。

## Tech Decision

**档 1**: `pagehide` + `beforeunload` + Phaser `SHUTDOWN` → 复用现有 `channel.send(broadcast)` 路径。

放弃档 2（sendBeacon + Edge Function）。理由：
1. 心跳兜底已存在，档 1 没覆盖的场景（Safari/iOS/网差）会 degrade 回原行为，体验不更差。
2. 档 2 的 sendBeacon 无法带自定义 header，JWT 鉴权要绕弯；不做就有「伪造 winner 判负」隐患。
3. 单人开发，档 1 用 ~30 行代码覆盖 90%+ 场景，ROI 高。

## Scope

**Included**
- 新增 `src/online/leaveReporter.ts`：封装 `pagehide` + `beforeunload` 事件监听，内置去重。
- `PoolScene` 在 online 模式启动时创建 `leaveReporter`，在 `SHUTDOWN` 事件里做同样的离开上报（覆盖应用内「返回主菜单」按钮路径）。
- 新增 `reportOnlineLeave()` 方法：带前置条件，发 `{ type: 'game_over', reason: 'disconnect', winner: opponentIndex }`，本地转 `game_over` 态。
- 单元测试 + 扩展现有 `PoolScene.online.test.ts`。

**Not Included (Non-Goals)**
1. 双方同时离线的服务端 DB 兜底（Phase 4 Non-Goal，留未来）。
2. 短暂断网的自动重连窗口（回合制游戏价值低）。
3. 「对手连接不稳定」等 UX 提示条。
4. 我方离开时把自己的 `losses` 写到 `profiles.losses`（`fetch` 会被 unload 取消，档 1 接受此损失）。
5. Safari / iOS 移动端 100% 覆盖（pagehide 在移动 Safari 上触发不稳定，降级到 30s 心跳兜底）。
6. `beforeunload` 弹浏览器默认离开确认对话框（UX 侵入性太强）。
7. sendBeacon / Edge Function（档 2 显式放弃）。

## Architecture

### 触发源（3 个汇聚到同一个钩子）

| 触发源 | 场景 | 实现位置 |
|--------|------|----------|
| `window.pagehide` | 关标签 / 刷新 / 浏览器后退 / 页面导航 | `leaveReporter.ts` |
| `window.beforeunload` | Firefox 某些场景 pagehide 不触发时补漏；**不 preventDefault** | `leaveReporter.ts` |
| Phaser Scene `SHUTDOWN` | 应用内「返回主菜单」按钮（`main.ts` 的 `backToMenu` → `destroy(true)` → SHUTDOWN） | `PoolScene.ts` |

三个触发源最终都调 `PoolScene.reportOnlineLeave()`。

### 前置条件（全部满足才发）

- 当前是 online 模式（`this.roomInfo` 存在）
- `this.onlineState` 存在且 `phase !== 'game_over'`
- `this.onlineChannel` 存在

任何一条不满足：静默返回，不崩。

### 动作

```ts
const myIndex: 0 | 1 = this.roomInfo.isHost ? 0 : 1;
const opponentIndex: 0 | 1 = myIndex === 0 ? 1 : 0;
try {
  this.onlineChannel.send({
    type: 'game_over',
    reason: 'disconnect',
    winner: opponentIndex,  // 对方赢（我离开）
  });
} catch {
  // pagehide 期间不做日志；发不出去走 30s 心跳兜底
}
this.onlineState = transitionToGameOver(this.onlineState, opponentIndex, 'disconnect');
// 不调 updateOnlineStats：页面正在 unload，fetch 会被取消
```

### 幂等保护（两层）

1. `leaveReporter` 内部 `fired` 布尔：pagehide + beforeunload 同时触发只调一次 `onLeave`。
2. `reportOnlineLeave` 自己检查 `phase !== 'game_over'`：Scene 已结算后 SHUTDOWN 再触发不重复发消息。

## Components

### New: `src/online/leaveReporter.ts`

```ts
export interface LeaveReporter {
  dispose(): void;
}

export interface LeaveReporterOptions {
  onLeave: () => void;
  window?: Window;  // 测试注入
}

export function createLeaveReporter(opts: LeaveReporterOptions): LeaveReporter;
```

职责：
- 注册 `pagehide` + `beforeunload` 事件
- 同次卸载内多事件去重（`fired` 布尔）
- `dispose()` 移除所有监听

**不负责**：业务判断、发消息、知道游戏状态。

### Modified: `src/game/PoolScene.ts`

- 新增字段 `private leaveReporter: LeaveReporter | null = null`
- `startOnlineGame()` / `initOnlineMode()` 尾部：
  ```ts
  this.leaveReporter = createLeaveReporter({
    onLeave: () => this.reportOnlineLeave(),
  });
  ```
- 新增 `private reportOnlineLeave(): void`（逻辑见 Architecture）
- `startOnlineGame()` / online 初始化路径里**同时**挂 SHUTDOWN 监听（只在 online 模式挂，不影响本地对局）：
  ```ts
  this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    this.reportOnlineLeave();
    this.leaveReporter?.dispose();
    this.leaveReporter = null;
  });
  ```

### Unchanged

- `src/online/realtimeChannel.ts` — 继续用 `channel.send`
- `src/online/onlineState.ts` — 继续用现有 `transitionToGameOver`
- `src/online/types.ts` — 不新增消息类型
- `src/main.ts` — 不改（Scene 自己挂 SHUTDOWN）
- DB 迁移 / Edge Function — 无

## Data Flow

### 成功路径

```
用户 A (离开)                     Supabase Realtime              用户 B (留守)
-----------                      -----------------              ------------
pagehide 触发
├─ leaveReporter 去重锁定 fired
├─ reportOnlineLeave()
│  ├─ 前置检查通过
│  ├─ channel.send(game_over, winner=B) ─┐
│  └─ 本地 transitionToGameOver          │
└─ 浏览器继续 unload                     │
                                   WS flush
                                         │
                                         └─→ onMessage(game_over)
                                              ├─ transitionToGameOver
                                              ├─ showOnlineGameOver(iWin=true, 'disconnect')
                                              └─ updateOnlineStats(true, 'disconnect')
                                              ← B 看到结算：< 1 秒
```

### 降级路径（WS flush 失败）

```
A: pagehide → channel.send → 浏览器被 kill → WS frame 丢
B: 收不到 game_over，心跳也停
B: 30 秒后 checkDisconnect → handleOpponentDisconnect → 本地判 A 掉线
← 与当前行为一致，不劣化
```

### 双方同时离开（Non-Goal，此处仅说明）

```
A 发 game_over(winner=B) → B 已离开，收不到
B 发 game_over(winner=A) → A 已离开，收不到
两边前端都本地 transitionToGameOver 自己，但 DB matches 无完整记录
（留给未来的服务端 DB 兜底，Phase 4 Non-Goal）
```

## Error Handling

- `channel.send` 底层 WS 断时**静默丢弃**，不抛异常。为稳妥仍 `try { send } catch {}`，不打日志（pagehide 期间 console 不稳）。
- 发失败 → 心跳停 → 对方 30 秒兜底。
- `dispose()` 幂等：多次调用不崩（内部 null 检查 + 已 removeEventListener 是安全操作）。

## Testing Strategy

### New: `src/online/leaveReporter.test.ts`（jsdom）

| # | Case | 期望 |
|---|------|------|
| 1 | `pagehide` dispatch | `onLeave` 调 1 次 |
| 2 | `beforeunload` dispatch | `onLeave` 调 1 次 |
| 3 | 先 `pagehide` 再 `beforeunload` | `onLeave` 只调 1 次 |
| 4 | `dispose()` 后 dispatch | `onLeave` 不调 |
| 5 | `dispose()` 调两次 | 不崩 |

### Extended: `src/game/PoolScene.online.test.ts`

注入 mock channel，模拟 Phaser `SHUTDOWN`。

| # | Case | 期望 |
|---|------|------|
| 6 | online 模式 + 游戏中 → 触发 SHUTDOWN | channel 收到 `game_over(disconnect, winner=opponentIndex)` |
| 7 | `phase === 'game_over'` 时 SHUTDOWN | channel 不收到消息 |
| 8 | `roomInfo === null`（本地模式）SHUTDOWN | channel 不收到消息 |
| 9 | `onlineChannel === null` 时 SHUTDOWN | 不崩，不发消息 |

### Manual Verification（Stage 6 做）

两个浏览器窗口，A/B 两个账号进入对局：

| 场景 | 操作 | 期望 |
|------|------|------|
| 1 | A 关标签 | B < 1s 结算，文案 "Opponent disconnected" |
| 2 | A F5 刷新 | B < 1s 结算 |
| 3 | A 点应用内「返回」按钮 | B < 1s 结算 |
| 4 | A DevTools Offline 再关标签 | B 收不到 → 30s 心跳兜底判负（回归） |
| 5 | 对局已结算后 A 关标签 | B 不崩，不收多余消息 |

## Acceptance Criteria

- [ ] 场景 1-3 在 Chrome / Edge / Firefox 桌面稳定 < 1s 结算
- [ ] 场景 4 验证 30s 兜底仍生效
- [ ] 场景 5 幂等
- [ ] `leaveReporter.test.ts` 5 个 case 全绿
- [ ] `PoolScene.online.test.ts` 新增 4 个 case 全绿
- [ ] `npm run build` 无 TS error
- [ ] 现有测试 0 回归

## Risks & Known Limitations

| 风险 | 描述 | 缓解 |
|------|------|------|
| 移动 Safari 不稳定 | pagehide / beforeunload 在 iOS 触发不一致 | 30s 心跳兜底，不劣化 |
| WS flush 竞态 | 浏览器 kill 太快 WS frame 丢 | 30s 心跳兜底 |
| 我方 losses 未记 | unload 中 fetch 被取消 | 接受，下版本考虑 Edge Function |
| 双方同时断 | 两边消息都发不出 | Non-Goal，留服务端 DB 兜底 |

## File Impact Summary

| 类型 | 路径 | 预估行数 |
|------|------|---------|
| 新增 | `src/online/leaveReporter.ts` | ~40 |
| 新增 | `src/online/leaveReporter.test.ts` | ~80 |
| 修改 | `src/game/PoolScene.ts` | +30 (新字段 + init + shutdown hook + `reportOnlineLeave`) |
| 修改 | `src/game/PoolScene.online.test.ts` | +60 (4 个新 case) |

**不改**：`src/main.ts` / `src/online/realtimeChannel.ts` / `src/online/onlineState.ts` / `src/online/types.ts` / DB / Edge Functions。
