import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRealtime = vi.hoisted(() => {
  let subscribeCallback: ((status: string) => void | Promise<void>) | null = null;
  const channel = {
    on: vi.fn(() => channel),
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
      channel.on.mockClear();
      channel.subscribe.mockClear();
      channel.track.mockClear();
      channel.send.mockClear();
      channel.presenceState.mockClear();
      supabase.channel.mockClear();
      supabase.removeChannel.mockClear();
    },
  };
});

vi.mock('../lib/supabase', () => ({
  supabase: mockRealtime.supabase,
}));

import { GameChannel } from './realtimeChannel';

describe('GameChannel', () => {
  beforeEach(() => {
    mockRealtime.reset();
    vi.useRealTimers();
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
});
