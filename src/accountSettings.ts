export type PasswordChangeValidation =
  | { valid: true }
  | { valid: false; message: string; field: 'password' | 'confirmation' };

export function validatePasswordChange(password: string, confirmation: string): PasswordChangeValidation {
  if (password.length < 6) {
    return { valid: false, message: '新密码至少需要 6 位字符。', field: 'password' };
  }
  if (password !== confirmation) {
    return { valid: false, message: '两次输入的密码不一致。', field: 'confirmation' };
  }
  return { valid: true };
}
