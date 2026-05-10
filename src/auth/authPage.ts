import { supabase } from '../lib/supabase';

export function initAuthPage(onSuccess: () => void): void {
  const authPage = document.getElementById('auth-page')!;
  const loginForm = document.getElementById('login-form') as HTMLFormElement;
  const registerForm = document.getElementById('register-form') as HTMLFormElement;
  const loginError = document.getElementById('login-error') as HTMLParagraphElement;
  const registerError = document.getElementById('register-error') as HTMLParagraphElement;
  const tabs = authPage.querySelectorAll<HTMLButtonElement>('.auth-tab');

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('is-active'));
      tab.classList.add('is-active');
      const isLogin = tab.dataset.tab === 'login';
      loginForm.hidden = !isLogin;
      registerForm.hidden = isLogin;
      loginError.hidden = true;
      registerError.hidden = true;
    });
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
