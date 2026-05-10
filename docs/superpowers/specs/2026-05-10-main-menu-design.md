# Main Menu Interface Design

## Overview

Add a main menu screen to the 8-ball pool game. The menu appears on launch before any game content loads. Players select one of three modes, then the game initializes with the chosen mode.

## Visual Design

### Style Direction

Apple-inspired light premium aesthetic with billiard theme elements.

### Background

- Warm cream gradient: `linear-gradient(160deg, #faf9f7 0%, #f0ede8 50%, #e8e4dd 100%)`
- Full viewport coverage, centered content

### Decorative Elements

Large 3D-style billiard balls scattered across the background at various positions:
- Different sizes (20px–44px diameter)
- Different opacity levels (0.55–0.85) for depth
- Realistic radial gradients with highlight at top-left
- Colored drop shadows matching each ball's hue
- Colors: gold (#d8b33f), red (#e25761), blue (#2469b3), purple (#5b2a83), green (#1d7f5f), orange (#d46b2c)

### Title Area (centered)

- Eyebrow text: "8-BALL" — 10px, weight 600, letter-spacing 0.2em, uppercase, color #a09080
- Main title: "Pool Hall" — 32px, weight 700, color #1d1d1f, letter-spacing -0.03em
- Font: system SF Pro stack (`-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif`)

### Mode Buttons (vertical list, centered below title)

Each button is a card with:
- Width: 220px (fixed, centered)
- Background: `rgba(255,255,255,0.92)`
- Left border: 3px solid, color varies by mode
- Border-radius: 10px
- Padding: 13px 16px
- Box-shadow: `0 2px 8px rgba(0,0,0,0.05), 0 4px 20px rgba(0,0,0,0.03)`
- Layout: flex row — emoji icon | text block (title + subtitle) | right chevron

Mode-specific colors:
| Mode | Left border | Icon |
|------|-------------|------|
| 人机对战 (VS AI) | #6c5ce7 (purple) | 🎯 |
| 双人对战 (Two Players) | #00cec9 (teal) | 👥 |
| 台球闯关 (Challenge) | #e4b74f (gold) | ⭐ |

Text within each button:
- Title: 14px, weight 600, color #1d1d1f (Chinese name)
- Subtitle: 10px, color #86868b (English name)
- Right chevron: "›", color #c7c7cc

### Hover/Active States

- Hover: `transform: translateY(-1px)`, shadow deepens slightly, border-left widens to 4px
- Active: `transform: translateY(0)`, subtle press-down feel
- Transition: 0.2s ease on all properties

## Technical Architecture

### Implementation: HTML/CSS Overlay

The menu is a `<section>` element in `index.html`, positioned fixed over the entire viewport. It exists in the DOM from page load. The game container and all game UI sections start hidden.

### Flow

```
Page loads → Menu visible, Phaser NOT initialized
User clicks mode → Menu hides, game UI shows, Phaser initializes with selected mode
```

### File Changes

1. **index.html** — Add menu `<section id="main-menu">` before `.game-shell`. Add `hidden` attribute to `.game-shell` initially.

2. **src/styles.css** — Add menu styles (`.main-menu`, `.menu-ball`, `.menu-btn`, etc.)

3. **src/main.ts** — Remove immediate Phaser initialization. Add click handlers on menu buttons that:
   - Hide menu overlay
   - Show `.game-shell`
   - Initialize Phaser Game with mode passed via scene data
   - For challenge mode: show challenge level select after game init

4. **src/game/PoolScene.ts** — Accept initial mode from scene `init()` data instead of defaulting to 'ai'. Remove the mode-toggle button from HUD (mode is chosen at menu).

### Mode Mapping

| Menu button | `gameMode` value | Behavior |
|-------------|-----------------|----------|
| 人机对战 | `'ai'` | Current AI opponent mode |
| 双人对战 | `'pvp'` | Current two-player mode |
| 台球闯关 | `'challenge'` | Opens challenge level select, then starts challenge |

### Animations

- On page load: menu fades in (opacity 0→1, 0.4s ease)
- Decorative balls have subtle floating animation (translateY ±4px, 3-5s infinite, different delays)
- Button list staggers in from below (translateY 12px→0, opacity 0→1, stagger 80ms per button)

### Responsive Behavior

- Menu content stays centered at all viewport sizes
- Button width: `min(220px, 80vw)` on small screens
- Decorative balls reposition/hide on very small viewports (<400px)
- Title scales down on mobile: `clamp(24px, 6vw, 32px)`

### Accessibility

- Menu buttons are `<button>` elements with descriptive `aria-label`
- Focus visible styles on buttons
- Reduced motion: skip floating ball animation and fade-in when `prefers-reduced-motion: reduce`

## Out of Scope

- Settings/options screen
- Difficulty selection for AI mode (uses existing AI)
- Online multiplayer
- Sound toggle on menu (handled in-game)
