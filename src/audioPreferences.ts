export type AudioPreferences = {
  musicVolume: number;
  soundVolume: number;
};

export type AudioPreferenceStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export const AUDIO_PREFERENCES_KEY = 'pool.audioPreferences.v1';

export const DEFAULT_AUDIO_PREFERENCES: AudioPreferences = {
  musicVolume: 34,
  soundVolume: 58,
};

export function sanitizeAudioPreferences(value: unknown): AudioPreferences {
  if (!value || typeof value !== 'object') {
    return { ...DEFAULT_AUDIO_PREFERENCES };
  }

  const candidate = value as Partial<AudioPreferences>;
  return {
    musicVolume: normalizeVolume(candidate.musicVolume, DEFAULT_AUDIO_PREFERENCES.musicVolume),
    soundVolume: normalizeVolume(candidate.soundVolume, DEFAULT_AUDIO_PREFERENCES.soundVolume),
  };
}

export function readAudioPreferences(
  storage: Pick<AudioPreferenceStorage, 'getItem'>,
): AudioPreferences {
  try {
    const raw = storage.getItem(AUDIO_PREFERENCES_KEY);
    return raw ? sanitizeAudioPreferences(JSON.parse(raw) as unknown) : { ...DEFAULT_AUDIO_PREFERENCES };
  } catch {
    return { ...DEFAULT_AUDIO_PREFERENCES };
  }
}

export function writeAudioPreferences(
  storage: AudioPreferenceStorage,
  value: AudioPreferences,
): AudioPreferences {
  const preferences = sanitizeAudioPreferences(value);
  try {
    storage.setItem(AUDIO_PREFERENCES_KEY, JSON.stringify(preferences));
  } catch {
    // Keep the preference active for this session when device storage is unavailable.
  }
  return preferences;
}

function normalizeVolume(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.round(Math.min(100, Math.max(0, value)))
    : fallback;
}
