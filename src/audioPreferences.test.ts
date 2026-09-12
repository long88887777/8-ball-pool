import { describe, expect, it } from 'vitest';

import {
  AUDIO_PREFERENCES_KEY,
  DEFAULT_AUDIO_PREFERENCES,
  readAudioPreferences,
  sanitizeAudioPreferences,
  writeAudioPreferences,
} from './audioPreferences';

describe('audio preferences', () => {
  it('uses quiet defaults when nothing has been saved', () => {
    const storage = { getItem: () => null };

    expect(readAudioPreferences(storage)).toEqual(DEFAULT_AUDIO_PREFERENCES);
  });

  it('rounds and clamps saved volume levels', () => {
    expect(sanitizeAudioPreferences({ musicVolume: 115, soundVolume: -4.8 })).toEqual({
      musicVolume: 100,
      soundVolume: 0,
    });
  });

  it('persists sanitized values and recovers from malformed storage', () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
    };

    const saved = writeAudioPreferences(storage, { musicVolume: 42.4, soundVolume: 71.7 });

    expect(saved).toEqual({ musicVolume: 42, soundVolume: 72 });
    expect(readAudioPreferences(storage)).toEqual(saved);

    data.set(AUDIO_PREFERENCES_KEY, '{broken');
    expect(readAudioPreferences(storage)).toEqual(DEFAULT_AUDIO_PREFERENCES);
  });
});
