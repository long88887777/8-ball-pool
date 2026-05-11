import { supabase } from '../lib/supabase';
import type { MatchResponse, RoomInfo, QueueRecord, RoomRecord } from './types';

type MatchCallback = (info: RoomInfo) => void;

let currentSubscription: ReturnType<typeof supabase.channel> | null = null;
let roomTimeout: ReturnType<typeof setTimeout> | null = null;
let pollInterval: ReturnType<typeof setInterval> | null = null;
let matchResolved = false;

function showPanel(panelId: string): void {
  const panels = document.querySelectorAll<HTMLElement>('.mm-panel');
  panels.forEach((p) => (p.hidden = true));
  const target = document.getElementById(panelId);
  if (target) target.hidden = false;
}

function generateRoomCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function cleanup(): Promise<void> {
  if (currentSubscription) {
    supabase.removeChannel(currentSubscription);
    currentSubscription = null;
  }
  if (roomTimeout) {
    clearTimeout(roomTimeout);
    roomTimeout = null;
  }
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

async function cancelSearch(): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    await supabase.from('matchmaking_queue').delete().eq('user_id', user.id);
  }
  await cleanup();
}

async function cancelRoom(roomId: string): Promise<void> {
  await supabase.from('rooms').delete().eq('id', roomId);
  await cleanup();
}

async function startQuickMatch(onMatch: MatchCallback): Promise<void> {
  matchResolved = false;
  showPanel('mm-searching');

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  const res = await supabase.functions.invoke('match-players', {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  if (res.error) return;

  const data = res.data as MatchResponse;

  if (data.status === 'matched') {
    onMatchSuccess(onMatch, {
      roomId: data.roomId,
      opponentId: data.opponentId,
      isHost: false,
    });
    return;
  }

  const userId = session.user.id;

  const handleQueueMatch = (roomId: string, opponentId: string) => {
    onMatchSuccess(onMatch, {
      roomId,
      opponentId,
      isHost: true,
    });
  };

  pollInterval = setInterval(async () => {
    const { data } = await supabase
      .from('matchmaking_queue')
      .select('status, room_id, matched_with')
      .eq('user_id', userId)
      .single();
    if (data && data.status === 'matched' && data.room_id && data.matched_with) {
      handleQueueMatch(data.room_id, data.matched_with);
    }
  }, 2000);

  currentSubscription = supabase
    .channel('queue-watch')
    .on<QueueRecord>(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'matchmaking_queue',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        const record = payload.new;
        if (record.status === 'matched' && record.room_id && record.matched_with) {
          handleQueueMatch(record.room_id, record.matched_with);
        }
      }
    )
    .subscribe();
}

async function startCreateRoom(onMatch: MatchCallback): Promise<void> {
  matchResolved = false;
  showPanel('mm-hosting');

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  let roomId = '';
  let attempts = 0;

  while (attempts < 3) {
    const code = generateRoomCode();
    const { error } = await supabase.from('rooms').insert({
      id: code,
      host_id: user.id,
      status: 'waiting',
    });
    if (!error) {
      roomId = code;
      break;
    }
    attempts++;
  }

  if (!roomId) return;

  const codeEl = document.getElementById('mm-room-code');
  if (codeEl) codeEl.textContent = roomId;

  roomTimeout = setTimeout(() => {
    cancelRoom(roomId);
    showPanel('mm-menu');
  }, 10 * 60 * 1000);

  const handleGuestJoined = (guestId: string) => {
    onMatchSuccess(onMatch, {
      roomId,
      opponentId: guestId,
      isHost: true,
    });
  };

  pollInterval = setInterval(async () => {
    const { data } = await supabase
      .from('rooms')
      .select('guest_id, status')
      .eq('id', roomId)
      .single();
    if (data && data.guest_id && data.status === 'playing') {
      handleGuestJoined(data.guest_id);
    }
  }, 2000);

  currentSubscription = supabase
    .channel(`room-${roomId}`)
    .on<RoomRecord>(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'rooms',
      },
      (payload) => {
        const record = payload.new;
        if (record.id === roomId && record.guest_id && record.status === 'playing') {
          handleGuestJoined(record.guest_id);
        }
      }
    )
    .subscribe();

  const cancelBtn = document.getElementById('mm-cancel-host');
  if (cancelBtn) {
    cancelBtn.onclick = async () => {
      await cancelRoom(roomId);
      showPanel('mm-menu');
    };
  }
}

async function startJoinRoom(code: string, onMatch: MatchCallback): Promise<void> {
  const errorEl = document.getElementById('mm-join-error') as HTMLElement;
  errorEl.hidden = true;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data: room } = await supabase
    .from('rooms')
    .select('*')
    .eq('id', code)
    .eq('status', 'waiting')
    .single();

  if (!room) {
    errorEl.textContent = '房间不存在或已满';
    errorEl.hidden = false;
    return;
  }

  const { error } = await supabase
    .from('rooms')
    .update({ guest_id: user.id, status: 'playing' })
    .eq('id', code)
    .is('guest_id', null);

  if (error) {
    errorEl.textContent = '房间已满';
    errorEl.hidden = false;
    return;
  }

  onMatchSuccess(onMatch, {
    roomId: code,
    opponentId: room.host_id,
    isHost: false,
  });
}

function onMatchSuccess(callback: MatchCallback, info: RoomInfo): void {
  if (matchResolved) return;
  matchResolved = true;
  cleanup();
  showPanel('mm-success');
  setTimeout(() => {
    closeModal();
    callback(info);
  }, 500);
}

function closeModal(): void {
  const modal = document.getElementById('matchmaking-modal');
  if (modal) modal.hidden = true;
  showPanel('mm-menu');
}

export function initMatchmaking(onMatch: MatchCallback): void {
  const modal = document.getElementById('matchmaking-modal')!;
  const backdrop = modal.querySelector('.mm-backdrop')!;

  document.getElementById('mm-quick')!.addEventListener('click', () => {
    startQuickMatch(onMatch);
  });

  document.getElementById('mm-create')!.addEventListener('click', () => {
    startCreateRoom(onMatch);
  });

  document.getElementById('mm-join')!.addEventListener('click', () => {
    showPanel('mm-joining');
  });

  document.getElementById('mm-do-join')!.addEventListener('click', () => {
    const input = document.getElementById('mm-code-input') as HTMLInputElement;
    const code = input.value.trim();
    if (code.length === 6) {
      startJoinRoom(code, onMatch);
    }
  });

  document.getElementById('mm-back-join')!.addEventListener('click', () => {
    showPanel('mm-menu');
  });

  document.getElementById('mm-cancel-search')!.addEventListener('click', async () => {
    await cancelSearch();
    showPanel('mm-menu');
  });

  document.getElementById('mm-close')!.addEventListener('click', async () => {
    await cleanup();
    await cancelSearch();
    closeModal();
  });

  backdrop.addEventListener('click', async () => {
    await cleanup();
    await cancelSearch();
    closeModal();
  });
}

export function openMatchModal(): void {
  const modal = document.getElementById('matchmaking-modal');
  if (modal) {
    modal.hidden = false;
    showPanel('mm-menu');
  }
}
