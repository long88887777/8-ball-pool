# Phase 1: Auth + Database + Profile — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add email/password authentication with Supabase Auth, a profiles table, and user info display on the main menu.

**Architecture:** Supabase handles auth and database. Frontend checks session on load — no session shows auth page, valid session shows main menu with user nickname/stats. Registration triggers a DB function that auto-creates a profile row.

**Tech Stack:** TypeScript, Supabase JS client v2, Vite (env vars via `import.meta.env`)

---

## File Structure

```
src/lib/supabase.ts          -- Supabase client singleton (createClient with env vars)
src/auth/authPage.ts         -- Auth page DOM logic (login/register tabs, form submit, errors)
index.html                   -- Add #auth-page section before #main-menu
src/main.ts                  -- Add auth gate: check session → show auth or menu
```

---

### Task 1: Install Supabase JS and Create Client

**Files:**
- Modify: `package.json`
- Create: `src/lib/supabase.ts`
- Create: `.env.local`
- Modify: `.gitignore`

- [ ] **Step 1: Install @supabase/supabase-js**

Run:
```bash
npm install @supabase/supabase-js
```

- [ ] **Step 2: Create Supabase client module**

Create `src/lib/supabase.ts`:

```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

- [ ] **Step 3: Create .env.local with credentials**

Create `.env.local`:

```
VITE_SUPABASE_URL=https://auymwlpzwtpsnaaemnut.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1eW13bHB6d3Rwc25hYWVtbnV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxNjg5OTksImV4cCI6MjA5Mzc0NDk5OX0.u8Vvm2FN1JU5q0geUffs8Jl33JOW_-OFyQ_7F4RbMIM
```

- [ ] **Step 4: Add .env.local to .gitignore**

Append to `.gitignore`:
```
.env.local
```

- [ ] **Step 5: Verify build still passes**

Run:
```bash
npm run build
```
Expected: Build succeeds with no errors.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/supabase.ts .gitignore
git commit -m "feat(online): add supabase client setup"
```

---

### Task 2: Create Profiles Table with RLS and Trigger

**Files:**
- Supabase migration (applied via MCP)

- [ ] **Step 1: Apply migration to create profiles table**

SQL migration `create_profiles`:

```sql
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text unique not null,
  wins integer not null default 0,
  losses integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Anyone can read profiles"
  on public.profiles for select
  to authenticated
  using (true);

create policy "Users can update own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);
```

- [ ] **Step 2: Apply migration to create trigger function**

SQL migration `create_profile_trigger`:

```sql
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, nickname)
  values (new.id, new.raw_user_meta_data ->> 'nickname');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

- [ ] **Step 3: Verify tables exist**

Run SQL:
```sql
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'profiles';
```
Expected: id (uuid), nickname (text), wins (integer), losses (integer), created_at (timestamp with time zone)

---

### Task 3: Add Auth Page HTML

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add #auth-page section before #main-menu**

Insert at the beginning of `<body>`, before the `<section id="main-menu">`:

```html
<section id="auth-page" class="auth-page">
  <div class="auth-container">
    <div class="auth-header">
      <span class="auth-eyebrow">8-BALL</span>
      <h1 class="auth-heading">Pool Hall</h1>
    </div>
    <div class="auth-tabs">
      <button class="auth-tab is-active" data-tab="login">登录</button>
      <button class="auth-tab" data-tab="register">注册</button>
    </div>
    <form id="login-form" class="auth-form">
      <input type="email" id="login-email" placeholder="邮箱" required autocomplete="email" />
      <input type="password" id="login-password" placeholder="密码" required autocomplete="current-password" />
      <button type="submit" class="auth-submit">登录</button>
      <p id="login-error" class="auth-error" hidden></p>
    </form>
    <form id="register-form" class="auth-form" hidden>
      <input type="email" id="register-email" placeholder="邮箱" required autocomplete="email" />
      <input type="text" id="register-nickname" placeholder="昵称" required minlength="2" maxlength="16" />
      <input type="password" id="register-password" placeholder="密码 (至少6位)" required minlength="6" autocomplete="new-password" />
      <button type="submit" class="auth-submit">注册</button>
      <p id="register-error" class="auth-error" hidden></p>
    </form>
  </div>
</section>
```

- [ ] **Step 2: Commit**

```bash
git add index.html
git commit -m "feat(auth): add login/register page HTML"
```

---

### Task 4: Add Auth Page Styles

**Files:**
- Modify: `src/styles.css`

- [ ] **Step 1: Add auth page CSS**

Append to `src/styles.css`:

```css
.auth-page {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0a0a0f;
  z-index: 9999;
}

.auth-container {
  width: 100%;
  max-width: 380px;
  padding: 2.5rem 2rem;
  background: #16161d;
  border-radius: 16px;
  border: 1px solid #2a2a35;
}

.auth-header {
  text-align: center;
  margin-bottom: 2rem;
}

.auth-eyebrow {
  font-size: 0.75rem;
  letter-spacing: 0.2em;
  color: #8b8b9a;
  text-transform: uppercase;
}

.auth-heading {
  font-size: 1.75rem;
  color: #f0f0f5;
  margin: 0.25rem 0 0;
}

.auth-tabs {
  display: flex;
  gap: 0;
  margin-bottom: 1.5rem;
  border-bottom: 1px solid #2a2a35;
}

.auth-tab {
  flex: 1;
  padding: 0.75rem;
  background: none;
  border: none;
  color: #8b8b9a;
  font-size: 0.95rem;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: color 0.2s, border-color 0.2s;
}

.auth-tab.is-active {
  color: #f0f0f5;
  border-bottom-color: #5b8def;
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
}

.auth-form input {
  padding: 0.75rem 1rem;
  background: #0f0f14;
  border: 1px solid #2a2a35;
  border-radius: 8px;
  color: #f0f0f5;
  font-size: 0.95rem;
  outline: none;
  transition: border-color 0.2s;
}

.auth-form input:focus {
  border-color: #5b8def;
}

.auth-submit {
  padding: 0.75rem;
  background: #5b8def;
  border: none;
  border-radius: 8px;
  color: #fff;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.auth-submit:hover {
  background: #4a7de0;
}

.auth-submit:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.auth-error {
  color: #e55;
  font-size: 0.85rem;
  margin: 0;
  text-align: center;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/styles.css
git commit -m "feat(auth): add auth page styles"
```

---

### Task 5: Implement Auth Page Logic

**Files:**
- Create: `src/auth/authPage.ts`

- [ ] **Step 1: Create authPage.ts**

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add src/auth/authPage.ts
git commit -m "feat(auth): implement login/register page logic"
```

---

### Task 6: Add Auth Gate to main.ts

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Add imports at top**

```typescript
import { supabase } from './lib/supabase';
import { initAuthPage, showAuthPage, hideAuthPage } from './auth/authPage';
```

- [ ] **Step 2: Add init function and profile loader**

Add after existing code, replacing the direct button listener setup:

```typescript
async function loadUserProfile(): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data: profile } = await supabase
    .from('profiles')
    .select('nickname, wins, losses')
    .eq('id', user.id)
    .single();

  if (profile) {
    const infoEl = document.getElementById('user-info');
    if (infoEl) {
      const total = profile.wins + profile.losses;
      const winRate = total > 0 ? Math.round((profile.wins / total) * 100) : 0;
      infoEl.textContent = `${profile.nickname} | ${profile.wins}胜 ${profile.losses}负 (${winRate}%)`;
      infoEl.hidden = false;
    }
  }
}

async function init(): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();

  if (session) {
    hideAuthPage();
    const menu = document.getElementById('main-menu');
    if (menu) menu.hidden = false;
    loadUserProfile();
  } else {
    showAuthPage();
    const menu = document.getElementById('main-menu');
    if (menu) menu.hidden = true;
    initAuthPage(() => {
      const menu = document.getElementById('main-menu');
      if (menu) menu.hidden = false;
      loadUserProfile();
    });
  }

  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      backToMenu();
      const menu = document.getElementById('main-menu');
      if (menu) menu.hidden = true;
      showAuthPage();
    }
  });

  document.getElementById('btn-logout')?.addEventListener('click', async () => {
    await supabase.auth.signOut();
  });
}

init();
```

- [ ] **Step 3: Make main menu hidden by default**

In `index.html`, change:
```html
<section id="main-menu" class="main-menu" aria-label="Game mode selection">
```
To:
```html
<section id="main-menu" class="main-menu" hidden aria-label="Game mode selection">
```

- [ ] **Step 4: Commit**

```bash
git add src/main.ts index.html
git commit -m "feat(auth): add auth gate and profile loading to main"
```

---

### Task 7: Add User Info and Logout to Main Menu

**Files:**
- Modify: `index.html`
- Modify: `src/styles.css`

- [ ] **Step 1: Add user info bar to menu HTML**

Inside `<div class="menu-content">`, after `<div class="menu-title">...</div>` and before `<div class="menu-buttons">`, add:

```html
<div class="menu-user-bar">
  <span id="user-info" class="user-info" hidden></span>
  <button id="btn-logout" class="menu-logout-btn" type="button">退出登录</button>
</div>
```

- [ ] **Step 2: Add styles for user bar**

Append to `src/styles.css`:

```css
.menu-user-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.user-info {
  color: #c0c0cc;
  font-size: 0.85rem;
}

.menu-logout-btn {
  padding: 0.4rem 0.75rem;
  background: none;
  border: 1px solid #3a3a45;
  border-radius: 6px;
  color: #8b8b9a;
  font-size: 0.8rem;
  cursor: pointer;
  transition: border-color 0.2s, color 0.2s;
}

.menu-logout-btn:hover {
  border-color: #e55;
  color: #e55;
}
```

- [ ] **Step 3: Commit**

```bash
git add index.html src/styles.css
git commit -m "feat(auth): add user info display and logout button"
```

---

### Task 8: Add "Online Battle" Button to Menu

**Files:**
- Modify: `index.html`
- Modify: `src/main.ts`

- [ ] **Step 1: Add online battle button**

In `index.html`, inside `<div class="menu-buttons">`, add after the challenge button:

```html
<button class="menu-btn" data-mode="online" aria-label="Online multiplayer mode">
  <span class="menu-btn-icon">🌐</span>
  <span class="menu-btn-text">
    <strong>联网对战</strong>
    <small>Online Battle</small>
  </span>
  <span class="menu-btn-chevron" aria-hidden="true">›</span>
</button>
```

- [ ] **Step 2: Update GameMode type in main.ts**

Change:
```typescript
type GameMode = 'pvp' | 'ai' | 'challenge';
```
To:
```typescript
type GameMode = 'pvp' | 'ai' | 'challenge' | 'online';
```

Update the click handler to skip 'online' for now:

```typescript
document.querySelectorAll<HTMLButtonElement>('.menu-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const mode = btn.dataset.mode as GameMode;
    if (mode === 'online') {
      return;
    }
    startGame(mode);
  });
});
```

- [ ] **Step 3: Commit**

```bash
git add index.html src/main.ts
git commit -m "feat(online): add online battle button to menu (placeholder)"
```

---

### Task 9: End-to-End Verification

- [ ] **Step 1: Run build**

```bash
npm run build
```
Expected: No TypeScript errors, build succeeds.

- [ ] **Step 2: Run tests**

```bash
npm test
```
Expected: All existing tests still pass.

- [ ] **Step 3: Manual test in browser**

1. Run `npm run dev`
2. Open browser → should see auth page (dark fullscreen with login form)
3. Switch to register tab → fill email + nickname + password → submit
4. Should auto-login → main menu appears with nickname and stats
5. Click "退出登录" → returns to auth page
6. Login with same credentials → main menu with user info
7. "联网对战" button visible but does nothing yet
8. Other modes (人机对战, 双人对战, 台球闯关) still work normally
