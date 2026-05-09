# Photorealistic Pool Table & Balls — Design Spec

**Date:** 2026-05-09
**Scope:** Enhance pool table, balls, cushions, and pockets with realistic textures and shading — top-down 2D view, procedural Canvas 2D only.

## Ball Rendering

### Ball texture layers (inside-out)

1. **Drop shadow** — soft dark ellipse offset down-right from ball center
2. **Base fill** — solid ball color
3. **3D body gradient** — radial gradient offset toward upper-left (light source), darkening toward lower-right, creating spherical volume
4. **Stripe band** (balls 9-15 only) — white equatorial band wrapped around ball center, with shading that follows ball curvature (darker at band edges)
5. **Main highlight** — large soft radial gradient highlight in upper-left quadrant
6. **Specular highlight** — smaller sharper white highlight near the main highlight center
7. **Rim light** — subtle lighter band along the bottom-right edge (bounce light from table surface)
8. **Number circle** — white circle centered on ball, with subtle drop shadow
9. **Number text** — bold serif digit in dark brown
10. **Outline** — thin semi-transparent dark stroke on ball perimeter

### Stripe ball specifics

- White band spans ~40% of ball diameter at equator
- Band edges follow ball curvature — narrower at left/right edges
- Band shading: brighter at top center, darker at bottom due to body shadow

## Table Felt (Playing Surface)

- **Base color:** warm pool-table green (#1a5c32)
- **Light gradient:** subtle radial lightening toward center (overhead lamp hot spot)
- **Nap texture:** scattered clusters of slightly lighter/darker green dots simulating felt fiber variance
- **Directional nap:** faint vertical banding at very low opacity to simulate brushed felt

## Wooden Rails

- **Base:** deep walnut brown (#3d1b10 → #6b321d gradient)
- **Grain:** multi-frequency sine wave overlay:
  - Low freq: wide sweeping curves (primary grain)
  - Mid freq: tighter waves (secondary grain lines)
  - High freq: subtle micro-variation
- **Bevel highlight:** inner edge of rail frame gets lighter wood tone strip
- **Finish:** subtle glossy sheen near the rail top edge

## Cushions

- **Color:** dark green-black (#0a1a0f), distinct from felt
- **Nose line:** thin pale line along cushion nose where rubber meets felt
- **Cushion face:** subtle gradient top-to-bottom

## Pockets

6 pockets (4 corners + 2 sides)

### Corner pockets
- **Outer ring:** dark brown leather tone (#3d2214) with radial gradient
- **Inner ring:** transitional brown-to-black gradient simulating depth
- **Pocket center:** near-black (#080807)
- **Mouth opening:** wider visual opening (~116px)

### Side pockets
- Same color treatment as corners
- **Mouth opening:** narrower (~60px total)
- Slightly smaller outer ring diameter

### Pocket shading
- Subtle shadow cast slightly downward suggesting receding hole

## Rail Pearls (Diamond Markers)

- **Count:** 6 per long rail, 3 per short rail (18 total)
- **Appearance:** mother-of-pearl / ivory
  - Base: warm off-white to cream gradient
  - Center highlight: bright white dot
  - Outer ring: thin darker outline (metal setting)
  - Subtle drop shadow

## Table Markings

- Head string and center string with subtle glow
- Foot spot refined center dot with ring

## Color Palette Reference

| Element | Colors |
|---------|--------|
| Felt base | #1a5c32 |
| Felt highlight | #237a42 |
| Rail wood dark | #3d1b10 |
| Rail wood mid | #6b321d |
| Rail wood light | #8f4a29 |
| Wood grain dark | #2a1209 |
| Wood grain light | #d28a53 |
| Cushion rubber | #0a1a0f |
| Pocket leather | #3d2214 |
| Pocket inner | #1a0f0a |
| Pearl base | #f5eed8 |
| Pearl highlight | #ffffff |
| Ball shadow | rgba(0,0,0,0.28) |
| Ball number bg | #f8f0dd |
| Ball number text | #20160f |
| Table marking | #dfe8c9 |

## Implementation Order

1. Ball texture rewrite (`createBallTexture`)
2. Felt/playing surface rewrite (nap texture + light gradient)
3. Wood rail rewrite (multi-frequency grain + bevel)
4. Cushion rewrite (color + nose line)
5. Pocket rewrite (leather rings + depth + shadows)
6. Rail pearls refinement
7. Table markings refinement
8. Polish pass

## Files Affected

- `src/game/rendering.ts` — all rendering functions
- `src/game/constants.ts` — may need new pocket size/shape constants
