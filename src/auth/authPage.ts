import { supabase } from '../lib/supabase';

type CaptchaState = {
  code: string;
  canvas: HTMLCanvasElement;
};

function generateCaptchaCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function drawCaptcha(canvas: HTMLCanvasElement, code: string): void {
  const ctx = canvas.getContext('2d')!;
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  const gradient = ctx.createLinearGradient(0, 0, w, h);
  gradient.addColorStop(0, '#0d0d18');
  gradient.addColorStop(1, '#14141f');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);

  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(Math.random() * w, Math.random() * h);
    ctx.bezierCurveTo(
      Math.random() * w, Math.random() * h,
      Math.random() * w, Math.random() * h,
      Math.random() * w, Math.random() * h,
    );
    ctx.strokeStyle = `rgba(91, 141, 239, ${0.1 + Math.random() * 0.15})`;
    ctx.lineWidth = 0.5 + Math.random();
    ctx.stroke();
  }

  for (let i = 0; i < 30; i++) {
    ctx.fillStyle = `rgba(255, 255, 255, ${0.05 + Math.random() * 0.1})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 1, 1);
  }

  const fontSize = 20 + Math.random() * 4;
  ctx.font = `bold ${fontSize}px 'DM Sans', monospace`;
  ctx.textBaseline = 'middle';

  for (let i = 0; i < code.length; i++) {
    const x = 16 + i * 26;
    const y = h / 2 + (Math.random() - 0.5) * 8;
    const angle = (Math.random() - 0.5) * 0.3;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    const colors = ['#f5f5f7', '#a8c4f7', '#d4e0fa', '#e8e8ed'];
    ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)];
    ctx.fillText(code[i], 0, 0);
    ctx.restore();
  }
}

function createCaptcha(canvasId: string): CaptchaState {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
  const code = generateCaptchaCode();
  drawCaptcha(canvas, code);

  canvas.addEventListener('click', () => {
    const newCode = generateCaptchaCode();
    drawCaptcha(canvas, newCode);
    captchaStates.set(canvasId, { code: newCode, canvas });
  });

  return { code, canvas };
}

const captchaStates = new Map<string, CaptchaState>();

function refreshCaptcha(canvasId: string): void {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
  const newCode = generateCaptchaCode();
  drawCaptcha(canvas, newCode);
  captchaStates.set(canvasId, { code: newCode, canvas });
}

function validateCaptcha(canvasId: string, input: string): boolean {
  const state = captchaStates.get(canvasId);
  if (!state) return false;
  return state.code.toLowerCase() === input.trim().toLowerCase();
}

export function initAuthPage(onSuccess: () => void): void {
  const authPage = document.getElementById('auth-page')!;
  const loginCard = document.getElementById('auth-login-card')!;
  const registerCard = document.getElementById('auth-register-card')!;
  const loginForm = document.getElementById('login-form') as HTMLFormElement;
  const registerForm = document.getElementById('register-form') as HTMLFormElement;
  const loginError = document.getElementById('login-error') as HTMLParagraphElement;
  const registerError = document.getElementById('register-error') as HTMLParagraphElement;

  const loginCaptcha = createCaptcha('login-captcha-canvas');
  captchaStates.set('login-captcha-canvas', loginCaptcha);
  const registerCaptcha = createCaptcha('register-captcha-canvas');
  captchaStates.set('register-captcha-canvas', registerCaptcha);

  document.getElementById('goto-register')!.addEventListener('click', () => {
    loginCard.hidden = true;
    registerCard.hidden = false;
    registerCard.style.animation = 'none';
    registerCard.offsetHeight;
    registerCard.style.animation = '';
    loginError.hidden = true;
    refreshCaptcha('register-captcha-canvas');
  });

  document.getElementById('goto-login')!.addEventListener('click', () => {
    registerCard.hidden = true;
    loginCard.hidden = false;
    loginCard.style.animation = 'none';
    loginCard.offsetHeight;
    loginCard.style.animation = '';
    registerError.hidden = true;
    refreshCaptcha('login-captcha-canvas');
  });

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.hidden = true;

    const captchaInput = (document.getElementById('login-captcha') as HTMLInputElement).value;
    if (!validateCaptcha('login-captcha-canvas', captchaInput)) {
      loginError.textContent = '验证码错误，请重新输入';
      loginError.hidden = false;
      refreshCaptcha('login-captcha-canvas');
      (document.getElementById('login-captcha') as HTMLInputElement).value = '';
      return;
    }

    const email = (document.getElementById('login-email') as HTMLInputElement).value;
    const password = (document.getElementById('login-password') as HTMLInputElement).value;
    const submitBtn = loginForm.querySelector('button[type="submit"]') as HTMLButtonElement;
    submitBtn.disabled = true;

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    submitBtn.disabled = false;
    if (error) {
      loginError.textContent = error.message;
      loginError.hidden = false;
      refreshCaptcha('login-captcha-canvas');
      (document.getElementById('login-captcha') as HTMLInputElement).value = '';
      return;
    }
    authPage.hidden = true;
    onSuccess();
  });

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    registerError.hidden = true;

    const captchaInput = (document.getElementById('register-captcha') as HTMLInputElement).value;
    if (!validateCaptcha('register-captcha-canvas', captchaInput)) {
      registerError.textContent = '验证码错误，请重新输入';
      registerError.hidden = false;
      refreshCaptcha('register-captcha-canvas');
      (document.getElementById('register-captcha') as HTMLInputElement).value = '';
      return;
    }

    const email = (document.getElementById('register-email') as HTMLInputElement).value;
    const nickname = (document.getElementById('register-nickname') as HTMLInputElement).value;
    const password = (document.getElementById('register-password') as HTMLInputElement).value;
    const submitBtn = registerForm.querySelector('button[type="submit"]') as HTMLButtonElement;
    submitBtn.disabled = true;

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { nickname } },
    });

    submitBtn.disabled = false;
    if (error) {
      registerError.textContent = error.message;
      registerError.hidden = false;
      refreshCaptcha('register-captcha-canvas');
      (document.getElementById('register-captcha') as HTMLInputElement).value = '';
      return;
    }
    authPage.hidden = true;
    onSuccess();
  });
}

export function showAuthPage(): void {
  const authPage = document.getElementById('auth-page');
  if (authPage) {
    authPage.hidden = false;
    refreshCaptcha('login-captcha-canvas');
  }
}

export function hideAuthPage(): void {
  const authPage = document.getElementById('auth-page');
  if (authPage) authPage.hidden = true;
}
