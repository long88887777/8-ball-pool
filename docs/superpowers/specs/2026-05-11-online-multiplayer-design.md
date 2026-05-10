# Online Multiplayer Design

## Overview

Add online multiplayer to the 8-ball pool game using Supabase (Auth + PostgreSQL + Realtime Broadcast) for backend and Vercel for frontend hosting. Players register with email/password, then can play against others via random matchmaking or room invites.

## Architecture

```
Vercel (frontend static) ──► Supabase
                              ├── Auth (email/password)
                              ├── PostgreSQL (profiles, matches, matchmaking, rooms)
                              ├── Realtime Broadcast (game communication)
                              └── Edge Functions (match-players)
```

Frontend dependency: `@supabase/supabase-js`

## Page Flow

1. Auth page (standalone fullscreen) → login/register
2. Main menu (existing, add "Online Battle" button + user info)
3. "Online Battle" → Matchmaking page (random match / create room / join room)
4. Match found → Enter game (reuse PoolScene with online turn state machine)
5. Game over → Result display → Back to menu

## Database Schema

### profiles

| Column     | Type        | Notes                          |
|-----------|-------------|--------------------------------|
| id        | uuid PK     | FK → auth.users.id             |
| nickname  | text UNIQUE | Set during registration        |
| wins      | integer     | Default 0                      |
| losses    | integer     | Default 0                      |
| created_at| timestamptz | Auto                           |

### matchmaking_queue

| Column      | Type        | Notes                        |
|------------|-------------|------------------------------|
| id         | uuid PK     | Auto-generated               |
| user_id    | uuid        | FK → profiles.id             |
| status     | text        | 'waiting' or 'matched'       |
| matched_with| uuid       | Nullable, matched opponent   |
| room_id    | text        | Nullable, assigned on match  |
| created_at | timestamptz | Auto                         |

### rooms

| Column    | Type        | Notes                          |
|----------|-------------|--------------------------------|
| id       | text PK     | 6-digit random room code       |
| host_id  | uuid        | FK → profiles.id               |
| guest_id | uuid        | Nullable                       |
| status   | text        | 'waiting', 'playing', 'finished'|
| created_at| timestamptz | Auto                          |

### matches

| Column     | Type        | Notes                          |
|-----------|-------------|--------------------------------|
| id        | uuid PK     | Auto-generated                 |
| room_id   | text        |                                |
| player1_id| uuid        | FK → profiles.id               |
| player2_id| uuid        | FK → profiles.id               |
| winner_id | uuid        | Nullable                       |
| reason    | text        | 'normal', 'timeout', 'disconnect'|
| started_at| timestamptz |                                |
| finished_at| timestamptz| Nullable                       |

### RLS Policies

- `profiles`: all authenticated can read; update own only
- `matchmaking_queue`: CRUD own records only
- `rooms`: all authenticated can read; host creates; guest can update guest_id
- `matches`: read own participated matches only

### Trigger

- `on auth.users INSERT` → insert into profiles (id from auth user, nickname from raw_user_meta_data)

## Authentication

### Auth Page (standalone fullscreen `#auth-page`)

- Two tabs: Login / Register
- Login: email + password + submit
- Register: email + password + nickname + submit
- Registration auto-logs in, trigger creates profile row
- Error display: email taken, password too short, nickname taken

### Session Management

- Page load: check `supabase.auth.getSession()`
- Valid session → show main menu
- No session → show auth page
- Main menu shows nickname + win rate + logout button

## Matchmaking

### Random Match

1. Player clicks "Random Match" → insert into `matchmaking_queue` (status: 'waiting')
2. Frontend subscribes to own queue record changes
3. Edge Function `match-players`: finds two 'waiting' records, generates room_id, updates both to 'matched'
4. Frontend detects status='matched' → gets room_id → joins Realtime Channel → enters game
5. Cancel: delete own queue record

### Room System

1. Create room: generate 6-char code, insert into `rooms` (status: 'waiting')
2. Creator sees room code, waits for opponent
3. Join room: input code, update `rooms.guest_id`, status → 'playing'
4. Both join Realtime Channel (name = room_id)
5. Room not found or full → error message

### Matchmaking UI

- Three options: Random Match | Create Room | Join Room
- Random: "Matching..." animation + cancel button
- Create: display room code + "Waiting for opponent..."
- Join: input field + join button

## Realtime Communication

### Channel

- Name: `room:{room_id}`
- Both players join same channel, use Broadcast

### Message Types

```typescript
{ type: 'ready', playerId: string }
{ type: 'shot', playerId: string, direction: {x: number, y: number}, power: number, contactOffset: {x: number, y: number} }
{ type: 'result', playerId: string, balls: Array<{id: number, x: number, y: number, pocketed: boolean}> }
{ type: 'turn_end', playerId: string, foul: boolean, nextPlayer: string }
{ type: 'game_over', winnerId: string, reason: 'normal' | 'timeout' | 'disconnect' }
{ type: 'heartbeat', playerId: string, timestamp: number }
```

### Sync Strategy

1. My turn → I shoot → send `shot` → both simulate physics
2. Balls settle → shooter sends `result` (final positions) → opponent snaps to correct positions
3. Shooter evaluates rules (foul/turn change) → sends `turn_end`
4. Opponent receives `turn_end` → switches turn

### Timeout

- Client-side 30-second timer per turn
- Timeout → send `turn_end` (foul: true), opponent gets free ball

### Disconnect Detection

- Send heartbeat every 5 seconds
- 30 seconds without opponent heartbeat → send `game_over` (reason: 'disconnect')

## PoolScene Changes

### Online Mode State Machine

- New flag: `onlineMode: boolean`
- States: `'my_turn' | 'opponent_turn' | 'watching_opponent_shot'`
- `my_turn`: normal controls (aim, shoot, spin)
- `opponent_turn`: disable all input, show "Opponent's turn", wait for `shot` message
- `watching_opponent_shot`: received shot, playing physics animation

### Input Control

- `opponent_turn`: disable drag aim, shooting, spin pad
- Keep pause and back buttons active

### Opponent Shot Replay

- Receive `shot` → call `strikeCueBall(shot)` → physics plays normally
- Balls settle → receive `result` → snap correct positions

### Game Over

- Reuse `victory-overlay` with win/loss result
- Replace "New Rack" with "Back to Lobby" in online mode
- Write to `matches` table, update `profiles` wins/losses

### Exit Handling

- Click "Back to menu" during online game → confirm dialog "Leaving will count as a loss. Continue?"
- Confirm → send `game_over` (reason: 'disconnect'), opponent wins

## File Structure

### New Files

```
src/lib/supabase.ts              -- Supabase client init
src/auth/authPage.ts             -- Login/register page logic
src/online/matchmaking.ts        -- Matchmaking (random + room)
src/online/realtimeChannel.ts    -- Realtime communication wrapper
src/online/onlineState.ts        -- Online game state machine
```

### Modified Files

```
src/main.ts                      -- Auth check, matchmaking page routing
src/game/PoolScene.ts            -- onlineMode branch, turn state machine
index.html                       -- Add #auth-page, #matchmaking-page sections
package.json                     -- Add @supabase/supabase-js
```

### Supabase Side

```
-- Migrations
Tables: profiles, matchmaking_queue, rooms, matches (with RLS)
Trigger: auth.users INSERT → profiles INSERT

-- Edge Function
supabase/functions/match-players/index.ts
```

### Environment Variables (Vercel)

```
VITE_SUPABASE_URL=https://auymwlpzwtpsnaaemnut.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable key>
```

## Development Order

1. Auth (login/register page + Supabase Auth + profiles table)
2. Database tables + player profile display
3. Matchmaking system (random + room)
4. Realtime communication + turn state machine
5. Game result recording
6. Disconnect handling
