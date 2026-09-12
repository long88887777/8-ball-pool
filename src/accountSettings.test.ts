import { describe, expect, it } from 'vitest';

import { validatePasswordChange } from './accountSettings';

describe('password settings', () => {
  it('rejects passwords shorter than the registration minimum', () => {
    expect(validatePasswordChange('12345', '12345')).toEqual({
      valid: false,
      message: '新密码至少需要 6 位字符。',
      field: 'password',
    });
  });

  it('rejects mismatched confirmation values', () => {
    expect(validatePasswordChange('quiet-room-8', 'quiet-room-9')).toEqual({
      valid: false,
      message: '两次输入的密码不一致。',
      field: 'confirmation',
    });
  });

  it('accepts a matching password that meets the minimum', () => {
    expect(validatePasswordChange('quiet-room-8', 'quiet-room-8')).toEqual({ valid: true });
  });
});
