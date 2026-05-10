export interface MatchResult {
  status: 'matched';
  roomId: string;
  opponentId: string;
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
}

export interface QueueRecord {
  id: string;
  user_id: string;
  status: 'waiting' | 'matched';
  matched_with: string | null;
  room_id: string | null;
  created_at: string;
}

export interface RoomRecord {
  id: string;
  host_id: string;
  guest_id: string | null;
  status: 'waiting' | 'playing' | 'finished';
  created_at: string;
}
