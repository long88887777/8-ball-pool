import { supabase } from '../lib/supabase';
import type { OnlineMessage, ShotMessage, ResultMessage, TurnEndMessage, HeartbeatMessage, GameOverMessage, RematchRequestMessage, RematchResponseMessage, RematchStartMessage, ChatMessage, SnapshotMessage } from './types';

type MessageWithoutTs =
  | Omit<ShotMessage, 'ts'>
  | Omit<ResultMessage, 'ts'>
  | Omit<TurnEndMessage, 'ts'>
  | Omit<HeartbeatMessage, 'ts'>
  | Omit<GameOverMessage, 'ts'>
  | Omit<RematchRequestMessage, 'ts'>
  | Omit<RematchResponseMessage, 'ts'>
  | Omit<RematchStartMessage, 'ts'>
  | Omit<ChatMessage, 'ts'>
  | Omit<SnapshotMessage, 'ts'>;

export interface ChannelCallbacks {
  onMessage: (msg: OnlineMessage) => void;
  onPresence: (event: 'join' | 'leave', userId: string) => void;
}

export interface ChannelOptions {
  roomId: string;
  userId: string;
  callbacks: ChannelCallbacks;
}

export class GameChannel {
  private channel: ReturnType<typeof supabase.channel> | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private userId = '';

  join(options: ChannelOptions): void {
    this.userId = options.userId;
    const channelName = `room:${options.roomId}`;

    this.channel = supabase.channel(channelName, {
      config: { broadcast: { self: false } },
    });

    this.channel
      .on('broadcast', { event: 'game_msg' }, (payload) => {
        const msg = payload.payload as OnlineMessage;
        options.callbacks.onMessage(msg);
      })
      .on('presence', { event: 'sync' }, () => {
        if (!this.channel) return;
        const state = this.channel.presenceState() as Record<string, Array<{ user_id?: string }>>;
        for (const key of Object.keys(state)) {
          const entries = state[key];
          for (const entry of entries) {
            if (entry.user_id && entry.user_id !== this.userId) {
              options.callbacks.onPresence('join', entry.user_id);
            }
          }
        }
      })
      .on('presence', { event: 'join' }, ({ newPresences }) => {
        for (const presence of newPresences) {
          if (presence.user_id !== this.userId) {
            options.callbacks.onPresence('join', presence.user_id as string);
          }
        }
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        for (const presence of leftPresences) {
          if (presence.user_id !== this.userId) {
            options.callbacks.onPresence('leave', presence.user_id as string);
          }
        }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await this.channel!.track({ user_id: this.userId });
        }
      });

    this.startHeartbeat();
  }

  send(msg: MessageWithoutTs): void {
    if (!this.channel) return;
    const fullMsg = { ...msg, ts: Date.now() } as OnlineMessage;
    this.channel.send({
      type: 'broadcast',
      event: 'game_msg',
      payload: fullMsg,
    });
  }

  leave(): void {
    this.stopHeartbeat();
    if (this.channel) {
      supabase.removeChannel(this.channel);
      this.channel = null;
    }
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.send({ type: 'heartbeat' });
    }, 5000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }
}
