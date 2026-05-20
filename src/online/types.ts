import type { GameRuleset } from '../game/gameRules';

export interface MatchResult {
  status: 'matched';
  roomId: string;
  opponentId: string;
  ruleset?: GameRuleset;
}

export interface WaitingResult {
  status: 'waiting';
  queueId: string;
}

export type MatchResponse = MatchResult | WaitingResult;

export interface RoomInfo {
  roomId: string;
  opponentId: string;
  isHost: boolean;
  myNickname: string;
  opponentNickname: string;
  myUserId: string;
  ruleset: GameRuleset;
}

export interface QueueRecord {
  id: string;
  user_id: string;
  status: 'waiting' | 'matched';
  matched_with: string | null;
  room_id: string | null;
  game_ruleset?: GameRuleset;
  created_at: string;
}

export interface RoomRecord {
  id: string;
  host_id: string;
  guest_id: string | null;
  status: 'waiting' | 'playing' | 'finished';
  game_ruleset?: GameRuleset;
  created_at: string;
}

export type OnlinePhase =
  | 'waiting_opponent'
  | 'my_turn'
  | 'watching_my_shot'
  | 'opponent_turn'
  | 'watching_opponent_shot'
  | 'game_over';

export type RealtimeConnectionStatus = 'connecting' | 'stable' | 'reconnecting' | 'disconnected';

export type NetworkHealthStatus =
  | 'connecting'
  | 'stable'
  | 'high_latency'
  | 'opponent_protected'
  | 'disconnected';

export type MatchAuditEventType =
  | 'network_status'
  | 'presence_lost'
  | 'disconnect_protection_started'
  | 'disconnect_forfeit'
  | 'surrender_sent'
  | 'surrender_received'
  | 'game_over_received'
  | 'shot_sent'
  | 'shot_received'
  | 'snapshot_ignored'
  | 'sync_anomaly'
  | 'turn_end_sent'
  | 'turn_end_received'
  | 'result_sent'
  | 'result_received';

type MessageBase = { ts: number };

export type NetworkBallSnapshot = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  pocketed: boolean;
};

export type ShotMessage = MessageBase & {
  type: 'shot';
  direction: { x: number; y: number };
  power: number;
  contactOffset: { x: number; y: number };
  cueBallPos: { x: number; y: number };
  pushOut?: boolean;
  ballsSnapshot?: NetworkBallSnapshot[];
};

export type SnapshotMessage = MessageBase & {
  type: 'snapshot';
  balls: NetworkBallSnapshot[];
};

export type ResultMessage = MessageBase & {
  type: 'result';
  balls: Array<{ id: number; x: number; y: number; pocketed: boolean; pocketIndex?: number }>;
};

export type TurnEndMessage = MessageBase & {
  type: 'turn_end';
  foul: boolean;
  cueBallInHand: boolean;
  nextPlayer: 0 | 1;
  pocketedBallIds: number[];
  gameOver: boolean;
  winner: 0 | 1 | null;
};

export type HeartbeatMessage = MessageBase & { type: 'heartbeat' };

export type GameOverMessage = MessageBase & {
  type: 'game_over';
  reason: 'disconnect' | 'surrender';
  winner: 0 | 1;
};

export type RematchRequestMessage = MessageBase & {
  type: 'rematch_request';
};

export type RematchResponseMessage = MessageBase & {
  type: 'rematch_response';
  accepted: boolean;
};

export type RematchStartMessage = MessageBase & {
  type: 'rematch_start';
  startAt: number;
  breaker: 0 | 1;
};

export type ChatMessage = MessageBase & {
  type: 'chat';
  senderNickname: string;
  text: string;
};

export type PushOutChoiceMessage = MessageBase & {
  type: 'push_out_choice';
  accepted: boolean;
  nextPlayer: 0 | 1;
};

export type OnlineMessage =
  | ShotMessage
  | ResultMessage
  | TurnEndMessage
  | HeartbeatMessage
  | GameOverMessage
  | RematchRequestMessage
  | RematchResponseMessage
  | RematchStartMessage
  | ChatMessage
  | PushOutChoiceMessage
  | SnapshotMessage;
