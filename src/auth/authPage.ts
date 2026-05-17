import { supabase } from '../lib/supabase';

export function initAuthPage(onSuccess: () => void, onGuest?: () => void): void {
  const authPage = document.getElementById('auth-page')!;
  const loginCard = document.getElementById('auth-login-card')!;
  const registerCard = document.getElementById('auth-register-card')!;
  const loginForm = document.getElementById('login-form') as HTMLFormElement;
  const registerForm = document.getElementById('register-form') as HTMLFormElement;
  const loginError = document.getElementById('login-error') as HTMLParagraphElement;
  const registerError = document.getElementById('register-error') as HTMLParagraphElement;

  document.getElementById('goto-register')!.addEventListener('click', () => {
    loginCard.hidden = true;
    registerCard.hidden = false;
    registerCard.style.animation = 'none';
    registerCard.offsetHeight;
    registerCard.style.animation = '';
    loginError.hidden = true;
  });

  document.getElementById('goto-login')!.addEventListener('click', () => {
    registerCard.hidden = true;
    loginCard.hidden = false;
    loginCard.style.animation = 'none';
    loginCard.offsetHeight;
    loginCard.style.animation = '';
    registerError.hidden = true;
  });

  document.getElementById('guest-play')?.addEventListener('click', () => {
    authPage.hidden = true;
    onGuest?.();
  });

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.hidden = true;

    const email = (document.getElementById('login-email') as HTMLInputElement).value;
    const password = (document.getElementById('login-password') as HTMLInputElement).value;
    const submitBtn = loginForm.querySelector('button[type="submit"]') as HTMLButtonElement;
    submitBtn.disabled = true;

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    submitBtn.disabled = false;
    if (error) {
      loginError.textContent = error.message;
      loginError.hidden = false;
      return;
    }
    authPage.hidden = true;
    onSuccess();
  });

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    registerError.hidden = true;

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
      return;
    }

    authPage.hidden = true;
    onSuccess();
  });
}

export function showAuthPage(): void {
  const authPage = document.getElementById('auth-page');
  if (authPage) authPage.hidden = false;
}

export function hideAuthPage(): void {
  const authPage = document.getElementById('auth-page');
  if (authPage) authPage.hidden = true;
}
