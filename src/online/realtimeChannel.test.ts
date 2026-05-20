import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRealtime = vi.hoisted(() => {
  let subscribeCallback: ((status: string) => void | Promise<void>) | null = null;
  const broadcastHandlers = new Map<string, (payload: { payload: unknown }) => void>();
  const presenceHandlers = new Map<string, (payload: unknown) => void>();
  const channel = {
    on: vi.fn((type: string, filter: { event?: string }, handler: (payload: { payload: unknown }) => void) => {
      if (type === 'broadcast' && filter.event) {
        broadcastHandlers.set(filter.event, handler);
      }
      if (type === 'presence' && filter.event) {
        presenceHandlers.set(filter.event, handler as (payload: unknown) => void);
      }
      return channel;
    }),
    subscribe: vi.fn((callback: (status: string) => void | Promise<void>) => {
      subscribeCallback = callback;
      return channel;
    }),
    track: vi.fn(),
    send: vi.fn(),
    presenceState: vi.fn(() => ({})),
  };
  const supabase = {
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(),
  };
  return {
    channel,
    supabase,
    emitStatus: async (status: string) => {
      await subscribeCallback?.(status);
    },
    reset: () => {
      subscribeCallback = null;
      broadcastHandlers.clear();
      presenceHandlers.clear();
      channel.on.mockClear();
      channel.subscribe.mockClear();
      channel.track.mockClear();
      channel.send.mockClear();
      channel.presenceState.mockClear();
      supabase.channel.mockClear();
      supabase.removeChannel.mockClear();
    },
    emitBroadcast: (event: string, payload: unknown) => {
      broadcastHandlers.get(event)?.({ payload });
    },
    emitPresence: (event: string, payload: unknown) => {
      presenceHandlers.get(event)?.(payload);
    },
  };
});

vi.mock('../lib/supabase', () => ({
  supabase: mockRealtime.supabase,
}));

import { GameChannel } from './realtimeChannel';

type FakeDataChannelEvent = { data: string };

class FakeDataChannel {
  readyState: RTCDataChannelState = 'connecting';
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: FakeDataChannelEvent) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  send(data: string): void {
    this.sent.push(data);
  }

  open(): void {
    this.readyState = 'open';
    this.onopen?.();
  }

  close(): void {
    this.readyState = 'closed';
    this.onclose?.();
  }

  emitMessage(data: string): void {
    this.onmessage?.({ data });
  }
}

class FakePeerConnection {
  static instances: FakePeerConnection[] = [];
  readonly dataChannel = new FakeDataChannel();
  localDescription: RTCSessionDescriptionInit | null = null;
  remoteDescription: RTCSessionDescriptionInit | null = null;
  connectionState: RTCPeerConnectionState = 'new';
  iceConnectionState: RTCIceConnectionState = 'new';
  onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  oniceconnectionstatechange: (() => void) | null = null;
  ondatachannel: ((event: RTCDataChannelEvent) => void) | null = null;
  addIceCandidate = vi.fn(async () => undefined);
  createOffer = vi.fn(async () => ({ type: 'offer', sdp: 'fake-offer' }) as RTCSessionDescriptionInit);
  close = vi.fn(() => {
    this.connectionState = 'closed';
  });

  constructor(public readonly configuration?: RTCConfiguration) {
    FakePeerConnection.instances.push(this);
  }

  createDataChannel(): RTCDataChannel {
    return this.dataChannel as unknown as RTCDataChannel;
  }

  async createAnswer(): Promise<RTCSessionDescriptionInit> {
    return { type: 'answer', sdp: 'fake-answer' };
  }

  async setLocalDescription(description: RTCSessionDescriptionInit): Promise<void> {
    this.localDescription = description;
  }

  async setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void> {
    this.remoteDescription = description;
  }

  disconnect(): void {
    this.connectionState = 'disconnected';
    this.onconnectionstatechange?.();
  }
}

function installFakePeerConnection(): void {
  FakePeerConnection.instances = [];
  vi.stubGlobal('RTCPeerConnection', FakePeerConnection);
}

function sentPayloads(): Array<{ type: string; event: string; payload: unknown }> {
  return mockRealtime.channel.send.mock.calls.map((call) => call[0]);
}

function gameBroadcasts(): Array<{ type: string; event: string; payload: unknown }> {
  return sentPayloads().filter((payload) => payload.event === 'game_msg');
}

describe('GameChannel', () => {
  beforeEach(() => {
    mockRealtime.reset();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('reports connecting immediately and stable after subscription', async () => {
    const onStatus = vi.fn();
    const channel = new GameChannel();

    channel.join({
      roomId: 'room-1',
      userId: 'self-1',
      callbacks: {
        onMessage: vi.fn(),
        onPresence: vi.fn(),
        onStatus,
      },
    });
    await mockRealtime.emitStatus('SUBSCRIBED');

    expect(onStatus).toHaveBeenNthCalledWith(1, 'connecting');
    expect(onStatus).toHaveBeenNthCalledWith(2, 'stable');
    expect(mockRealtime.channel.track).toHaveBeenCalledWith({ user_id: 'self-1' });
  });

  it('maps realtime interruptions to reconnecting and closed to disconnected', async () => {
    const onStatus = vi.fn();
    const channel = new GameChannel();

    channel.join({
      roomId: 'room-1',
      userId: 'self-1',
      callbacks: {
        onMessage: vi.fn(),
        onPresence: vi.fn(),
        onStatus,
      },
    });
    await mockRealtime.emitStatus('CHANNEL_ERROR');
    await mockRealtime.emitStatus('TIMED_OUT');
    await mockRealtime.emitStatus('CLOSED');

    expect(onStatus).toHaveBeenCalledWith('reconnecting');
    expect(onStatus).toHaveBeenCalledWith('disconnected');
  });

  it('uses an open WebRTC DataChannel for game messages and receives peer messages', async () => {
    installFakePeerConnection();
    const onMessage = vi.fn();
    const channel = new GameChannel({ webRtcConnectTimeoutMs: 1000 });

    channel.join({
      roomId: 'room-1',
      userId: 'self-1',
      opponentId: 'opponent-1',
      isHost: true,
      callbacks: {
        onMessage,
        onPresence: vi.fn(),
        onStatus: vi.fn(),
      },
    });
    await mockRealtime.emitStatus('SUBSCRIBED');

    const peer = FakePeerConnection.instances[0];
    expect(peer.configuration?.iceServers?.[0]?.urls).toBe('stun:stun.l.google.com:19302');
    peer.dataChannel.open();

    channel.send({ type: 'heartbeat' });
    expect(gameBroadcasts()).toHaveLength(0);
    expect(JSON.parse(peer.dataChannel.sent[0])).toMatchObject({ type: 'heartbeat' });

    peer.dataChannel.emitMessage(JSON.stringify({ type: 'chat', ts: 123, senderNickname: '小明', text: 'hi' }));
    expect(onMessage).toHaveBeenCalledWith({ type: 'chat', ts: 123, senderNickname: '小明', text: 'hi' });
  });

  it('answers WebRTC offers over the Supabase signaling broadcast', async () => {
    installFakePeerConnection();
    const channel = new GameChannel({ webRtcConnectTimeoutMs: 1000 });

    channel.join({
      roomId: 'room-1',
      userId: 'guest-1',
      opponentId: 'host-1',
      isHost: false,
      callbacks: {
        onMessage: vi.fn(),
        onPresence: vi.fn(),
        onStatus: vi.fn(),
      },
    });
    await mockRealtime.emitStatus('SUBSCRIBED');
    mockRealtime.emitBroadcast('webrtc_signal', {
      type: 'offer',
      from: 'host-1',
      to: 'guest-1',
      description: { type: 'offer', sdp: 'fake-offer' },
    });
    await vi.waitFor(() => {
      const answers = sentPayloads().filter((payload) => payload.event === 'webrtc_signal');
      expect(answers).toHaveLength(1);
    });

    const peer = FakePeerConnection.instances[0];
    expect(peer.remoteDescription).toEqual({ type: 'offer', sdp: 'fake-offer' });
    const answers = sentPayloads().filter((payload) => payload.event === 'webrtc_signal');
    expect(answers.at(-1)?.payload).toMatchObject({
      type: 'answer',
      from: 'guest-1',
      to: 'host-1',
      description: { type: 'answer', sdp: 'fake-answer' },
    });
  });

  it('does not create duplicate host offers when presence arrives during startup', async () => {
    installFakePeerConnection();
    const channel = new GameChannel({ webRtcConnectTimeoutMs: 1000 });

    channel.join({
      roomId: 'room-1',
      userId: 'host-1',
      opponentId: 'guest-1',
      isHost: true,
      callbacks: {
        onMessage: vi.fn(),
        onPresence: vi.fn(),
        onStatus: vi.fn(),
      },
    });
    const subscribePromise = mockRealtime.emitStatus('SUBSCRIBED');
    mockRealtime.emitPresence('join', { newPresences: [{ user_id: 'guest-1' }] });
    await subscribePromise;
    const peer = FakePeerConnection.instances[0];

    expect(peer.createOffer).toHaveBeenCalledTimes(1);
  });

  it('falls back to Supabase Broadcast when WebRTC connection times out', async () => {
    installFakePeerConnection();
    vi.useFakeTimers();
    const channel = new GameChannel({ webRtcConnectTimeoutMs: 1000 });

    channel.join({
      roomId: 'room-1',
      userId: 'self-1',
      opponentId: 'opponent-1',
      isHost: true,
      callbacks: {
        onMessage: vi.fn(),
        onPresence: vi.fn(),
        onStatus: vi.fn(),
      },
    });
    await mockRealtime.emitStatus('SUBSCRIBED');
    vi.advanceTimersByTime(1001);

    channel.send({ type: 'heartbeat' });

    expect(gameBroadcasts()).toHaveLength(1);
    expect(gameBroadcasts()[0].payload).toMatchObject({ type: 'heartbeat' });
  });

  it('falls back to Supabase Broadcast after a WebRTC disconnect', async () => {
    installFakePeerConnection();
    const channel = new GameChannel({ webRtcConnectTimeoutMs: 1000 });

    channel.join({
      roomId: 'room-1',
      userId: 'self-1',
      opponentId: 'opponent-1',
      isHost: true,
      callbacks: {
        onMessage: vi.fn(),
        onPresence: vi.fn(),
        onStatus: vi.fn(),
      },
    });
    await mockRealtime.emitStatus('SUBSCRIBED');

    const peer = FakePeerConnection.instances[0];
    peer.dataChannel.open();
    peer.disconnect();
    channel.send({ type: 'heartbeat' });

    expect(gameBroadcasts()).toHaveLength(1);
    expect(gameBroadcasts()[0].payload).toMatchObject({ type: 'heartbeat' });
  });

  it('preserves send order on the WebRTC DataChannel', async () => {
    installFakePeerConnection();
    const channel = new GameChannel({ webRtcConnectTimeoutMs: 1000 });

    channel.join({
      roomId: 'room-1',
      userId: 'self-1',
      opponentId: 'opponent-1',
      isHost: true,
      callbacks: {
        onMessage: vi.fn(),
        onPresence: vi.fn(),
        onStatus: vi.fn(),
      },
    });
    await mockRealtime.emitStatus('SUBSCRIBED');

    const peer = FakePeerConnection.instances[0];
    peer.dataChannel.open();
    channel.send({ type: 'snapshot', balls: [] });
    channel.send({ type: 'turn_end', foul: false, cueBallInHand: false, nextPlayer: 1, pocketedBallIds: [], gameOver: false, winner: null });

    expect(peer.dataChannel.sent.map((raw) => JSON.parse(raw).type)).toEqual(['snapshot', 'turn_end']);
  });
});
