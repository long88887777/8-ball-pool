import { supabase } from '../lib/supabase';
import type { OnlineMessage, RealtimeConnectionStatus, ShotMessage, ResultMessage, TurnEndMessage, HeartbeatMessage, GameOverMessage, RematchRequestMessage, RematchResponseMessage, RematchStartMessage, ChatMessage, PushOutChoiceMessage, SnapshotMessage } from './types';

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
  | Omit<PushOutChoiceMessage, 'ts'>
  | Omit<SnapshotMessage, 'ts'>;

export interface ChannelCallbacks {
  onMessage: (msg: OnlineMessage) => void;
  onPresence: (event: 'join' | 'leave', userId: string) => void;
  onStatus?: (status: RealtimeConnectionStatus) => void;
}

export interface ChannelOptions {
  roomId: string;
  userId: string;
  opponentId?: string;
  isHost?: boolean;
  callbacks: ChannelCallbacks;
}

export type GameChannelTransport = 'broadcast' | 'p2p_connecting' | 'p2p' | 'fallback';

export interface GameChannelConfig {
  webRtcConnectTimeoutMs?: number;
  iceServers?: RTCIceServer[];
}

type WebRtcSignal =
  | {
      type: 'offer' | 'answer';
      from: string;
      to: string;
      description: RTCSessionDescriptionInit;
    }
  | {
      type: 'ice';
      from: string;
      to: string;
      candidate: RTCIceCandidateInit;
    };

const DEFAULT_WEBRTC_TIMEOUT_MS = 5000;
const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
];

export class GameChannel {
  private channel: ReturnType<typeof supabase.channel> | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private webRtcTimeout: ReturnType<typeof setTimeout> | null = null;
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private options: ChannelOptions | null = null;
  private userId = '';
  private opponentId: string | null = null;
  private isHost = false;
  private transport: GameChannelTransport = 'broadcast';
  private leaving = false;
  private offerInFlight = false;
  private pendingIceCandidates: RTCIceCandidateInit[] = [];

  constructor(private readonly config: GameChannelConfig = {}) {}

  join(options: ChannelOptions): void {
    this.userId = options.userId;
    this.opponentId = options.opponentId ?? null;
    this.isHost = options.isHost ?? false;
    this.options = options;
    this.transport = 'broadcast';
    this.leaving = false;
    this.offerInFlight = false;
    const channelName = `room:${options.roomId}`;
    options.callbacks.onStatus?.('connecting');

    this.channel = supabase.channel(channelName, {
      config: { broadcast: { self: false } },
    });

    this.channel
      .on('broadcast', { event: 'game_msg' }, (payload) => {
        const msg = payload.payload as OnlineMessage;
        options.callbacks.onMessage(msg);
      })
      .on('broadcast', { event: 'webrtc_signal' }, (payload) => {
        void this.handleSignal(payload.payload as WebRtcSignal);
      })
      .on('presence', { event: 'sync' }, () => {
        if (!this.channel) return;
        const state = this.channel.presenceState() as Record<string, Array<{ user_id?: string }>>;
        for (const key of Object.keys(state)) {
          const entries = state[key];
          for (const entry of entries) {
            if (entry.user_id && entry.user_id !== this.userId) {
              options.callbacks.onPresence('join', entry.user_id);
              this.handlePeerPresence(entry.user_id);
            }
          }
        }
      })
      .on('presence', { event: 'join' }, ({ newPresences }) => {
        for (const presence of newPresences) {
          if (presence.user_id !== this.userId) {
            options.callbacks.onPresence('join', presence.user_id as string);
            this.handlePeerPresence(presence.user_id as string);
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
          options.callbacks.onStatus?.('stable');
          await this.channel!.track({ user_id: this.userId });
          this.maybeStartWebRtc();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          options.callbacks.onStatus?.('reconnecting');
        } else if (status === 'CLOSED') {
          options.callbacks.onStatus?.('disconnected');
        }
      });

    this.startHeartbeat();
  }

  send(msg: MessageWithoutTs): void {
    const fullMsg = { ...msg, ts: Date.now() } as OnlineMessage;
    if (this.canUseDataChannel()) {
      try {
        this.dataChannel!.send(JSON.stringify(fullMsg));
        return;
      } catch {
        this.fallbackToBroadcast();
      }
    }
    this.sendBroadcast(fullMsg);
  }

  getTransport(): GameChannelTransport {
    return this.transport;
  }

  private sendBroadcast(msg: OnlineMessage): void {
    if (!this.channel) return;
    this.channel.send({
      type: 'broadcast',
      event: 'game_msg',
      payload: msg,
    });
  }

  leave(): void {
    this.leaving = true;
    this.stopHeartbeat();
    this.closeWebRtc();
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

  private handlePeerPresence(userId: string): void {
    if (this.opponentId && userId !== this.opponentId) return;
    if (!this.opponentId) {
      this.opponentId = userId;
    }
    this.maybeStartWebRtc();
  }

  private maybeStartWebRtc(): void {
    if (!this.shouldUseWebRtc()) return;
    if (this.isHost) {
      void this.startHostOffer();
    }
  }

  private shouldUseWebRtc(): boolean {
    return (
      Boolean(this.channel) &&
      Boolean(this.opponentId) &&
      this.transport !== 'fallback' &&
      this.transport !== 'p2p' &&
      typeof globalThis.RTCPeerConnection !== 'undefined'
    );
  }

  private async startHostOffer(): Promise<void> {
    if (!this.shouldUseWebRtc()) return;
    if (this.offerInFlight) return;
    const peerConnection = this.ensurePeerConnection();
    if (!peerConnection) return;

    if (!this.dataChannel) {
      this.bindDataChannel(peerConnection.createDataChannel('game_msg', { ordered: true }));
    }

    if (peerConnection.localDescription?.type === 'offer') {
      this.sendSignal({
        type: 'offer',
        from: this.userId,
        to: this.opponentId!,
        description: {
          type: peerConnection.localDescription.type,
          sdp: peerConnection.localDescription.sdp,
        },
      });
      return;
    }

    this.transport = 'p2p_connecting';
    this.offerInFlight = true;
    this.startWebRtcTimeout();
    try {
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      this.sendSignal({
        type: 'offer',
        from: this.userId,
        to: this.opponentId!,
        description: offer,
      });
    } catch {
      this.fallbackToBroadcast();
    } finally {
      this.offerInFlight = false;
    }
  }

  private async handleSignal(signal: WebRtcSignal): Promise<void> {
    if (!this.isSignalForMe(signal)) return;
    if (!this.shouldAcceptSignal()) return;
    if (!this.opponentId) {
      this.opponentId = signal.from;
    }

    try {
      if (signal.type === 'offer') {
        await this.handleOffer(signal.description);
        return;
      }
      if (signal.type === 'answer') {
        await this.handleAnswer(signal.description);
        return;
      }
      if (signal.type === 'ice') {
        await this.handleIceCandidate(signal.candidate);
      }
    } catch {
      this.fallbackToBroadcast();
    }
  }

  private isSignalForMe(signal: WebRtcSignal): boolean {
    return signal.to === this.userId && (!this.opponentId || signal.from === this.opponentId);
  }

  private shouldAcceptSignal(): boolean {
    return (
      this.transport !== 'fallback' &&
      this.transport !== 'p2p' &&
      typeof globalThis.RTCPeerConnection !== 'undefined'
    );
  }

  private async handleOffer(description: RTCSessionDescriptionInit): Promise<void> {
    if (this.isHost) return;
    const peerConnection = this.ensurePeerConnection();
    if (!peerConnection) return;
    this.transport = 'p2p_connecting';
    this.startWebRtcTimeout();
    await peerConnection.setRemoteDescription(description);
    await this.flushPendingIceCandidates();
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    this.sendSignal({
      type: 'answer',
      from: this.userId,
      to: this.opponentId!,
      description: answer,
    });
  }

  private async handleAnswer(description: RTCSessionDescriptionInit): Promise<void> {
    if (!this.peerConnection || !this.isHost) return;
    await this.peerConnection.setRemoteDescription(description);
    await this.flushPendingIceCandidates();
  }

  private async handleIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.peerConnection) {
      this.pendingIceCandidates.push(candidate);
      return;
    }
    if (!this.peerConnection.remoteDescription) {
      this.pendingIceCandidates.push(candidate);
      return;
    }
    await this.peerConnection.addIceCandidate(candidate);
  }

  private ensurePeerConnection(): RTCPeerConnection | null {
    if (this.peerConnection) return this.peerConnection;
    if (typeof globalThis.RTCPeerConnection === 'undefined') {
      this.fallbackToBroadcast();
      return null;
    }

    const peerConnection = new RTCPeerConnection({
      iceServers: this.config.iceServers ?? DEFAULT_ICE_SERVERS,
    });
    this.peerConnection = peerConnection;
    peerConnection.onicecandidate = (event) => {
      if (!event.candidate || !this.opponentId) return;
      this.sendSignal({
        type: 'ice',
        from: this.userId,
        to: this.opponentId,
        candidate: event.candidate.toJSON(),
      });
    };
    peerConnection.ondatachannel = (event) => {
      this.bindDataChannel(event.channel);
    };
    peerConnection.onconnectionstatechange = () => {
      this.handlePeerConnectionState(peerConnection.connectionState);
    };
    peerConnection.oniceconnectionstatechange = () => {
      const state = peerConnection.iceConnectionState;
      if (state === 'failed' || state === 'disconnected' || state === 'closed') {
        this.fallbackToBroadcast();
      }
    };
    return peerConnection;
  }

  private bindDataChannel(dataChannel: RTCDataChannel): void {
    this.dataChannel = dataChannel;
    dataChannel.onopen = () => {
      if (this.leaving) return;
      this.stopWebRtcTimeout();
      this.transport = 'p2p';
    };
    dataChannel.onmessage = (event) => {
      this.handleDataChannelMessage(event.data);
    };
    dataChannel.onclose = () => {
      if (!this.leaving) {
        this.fallbackToBroadcast();
      }
    };
    dataChannel.onerror = () => {
      this.fallbackToBroadcast();
    };
  }

  private handleDataChannelMessage(data: string): void {
    if (!this.options) return;
    try {
      this.options.callbacks.onMessage(JSON.parse(data) as OnlineMessage);
    } catch {
      this.fallbackToBroadcast();
    }
  }

  private handlePeerConnectionState(state: RTCPeerConnectionState): void {
    if (state === 'connected') {
      return;
    }
    if (state === 'failed' || state === 'disconnected' || state === 'closed') {
      this.fallbackToBroadcast();
    }
  }

  private sendSignal(signal: WebRtcSignal): void {
    if (!this.channel) return;
    this.channel.send({
      type: 'broadcast',
      event: 'webrtc_signal',
      payload: signal,
    });
  }

  private canUseDataChannel(): boolean {
    return this.transport === 'p2p' && this.dataChannel?.readyState === 'open';
  }

  private startWebRtcTimeout(): void {
    if (this.webRtcTimeout) return;
    this.webRtcTimeout = setTimeout(() => {
      if (!this.canUseDataChannel()) {
        this.fallbackToBroadcast();
      }
    }, this.config.webRtcConnectTimeoutMs ?? DEFAULT_WEBRTC_TIMEOUT_MS);
  }

  private stopWebRtcTimeout(): void {
    if (!this.webRtcTimeout) return;
    clearTimeout(this.webRtcTimeout);
    this.webRtcTimeout = null;
  }

  private async flushPendingIceCandidates(): Promise<void> {
    if (!this.peerConnection || !this.peerConnection.remoteDescription) return;
    const candidates = this.pendingIceCandidates.splice(0);
    for (const candidate of candidates) {
      await this.peerConnection.addIceCandidate(candidate);
    }
  }

  private fallbackToBroadcast(): void {
    if (this.leaving) return;
    this.transport = 'fallback';
    this.closeWebRtc();
  }

  private closeWebRtc(): void {
    this.stopWebRtcTimeout();
    this.offerInFlight = false;
    this.pendingIceCandidates = [];
    if (this.dataChannel) {
      this.dataChannel.onopen = null;
      this.dataChannel.onmessage = null;
      this.dataChannel.onclose = null;
      this.dataChannel.onerror = null;
      if (this.dataChannel.readyState === 'open' || this.dataChannel.readyState === 'connecting') {
        this.dataChannel.close();
      }
      this.dataChannel = null;
    }
    if (this.peerConnection) {
      this.peerConnection.onicecandidate = null;
      this.peerConnection.ondatachannel = null;
      this.peerConnection.onconnectionstatechange = null;
      this.peerConnection.oniceconnectionstatechange = null;
      this.peerConnection.close();
      this.peerConnection = null;
    }
  }
}
