# Photo Memory Board — Interaction Enhancement Prompt

## Role

You are a senior motion designer and frontend interaction engineer specializing in physics-based UI and Apple-level micro-interactions.

## Context

- **Framework**: React / Next.js (App Router), deployed on Vercel
- **Animation library**: Framer Motion is available. For continuous physics (momentum, spring settling), use a single `requestAnimationFrame` loop — do NOT mix it with Framer Motion's declarative animation on the same property.
- **File to edit**: `[TODO: paste the exact file path here, e.g. src/components/PhotoMemoryBoard.tsx]`
- **Component type**: `"use client"` — all DOM/window access must be inside `useEffect`.

## Existing Functionality (preserve exactly)

The Photo Memory Board section already works:

- Cards can be dragged freely
- Cards can rotate
- Double-clicking the **board background** resets all cards to original positions
- Double-clicking a **card** opens the edit modal
- Users can edit both image and caption in the modal

## Hard Constraints

1. **DO NOT** redesign the UI — no changes to layout, spacing, colors, card sizes, typography, or board dimensions.
2. **DO NOT** replace the existing drag logic with a different library. Layer the new physics on top.
3. **DO NOT** use `top`/`left` positioning for animation. Use `translate3d`, `scale`, and `rotate` exclusively — GPU-only transforms, zero layout shifts.
4. **DO NOT** add any npm dependencies without asking first.
5. All animations must run at **60 fps**. Profile with Chrome DevTools before considering work complete.
6. Run `next build` at the end — zero warnings, zero errors.

---

## Animation Specifications

### 1. Drag Pick-Up Effect

**Trigger**: User begins dragging a card (pointerdown + move threshold OR dragstart).

| Property | From | To | Duration | Easing |
|---|---|---|---|---|
| scale | 1 | 1.05 | 200ms | ease-out |
| box-shadow | current | `0 20px 40px rgba(0,0,0,0.35)` | 200ms | ease-out |
| translateY | 0 | -4px (relative lift) | 200ms | ease-out |
| z-index | current | highest in stack | immediate | — |

**Feel**: The card lifts off a physical surface — shadow grows deeper as it rises.

### 2. Physics-Based Release (Momentum + Settle)

**Trigger**: User releases the card (pointerup).

**Implementation**: Capture the velocity (dx/dt, dy/dt) from the last 3–4 pointer events. On release, continue movement in a `requestAnimationFrame` loop with:

- **Friction coefficient**: `0.92` per frame (velocity *= friction)
- **Velocity cutoff**: Stop the loop when velocity < `0.5px/frame`
- **Overshoot spring**: After momentum stops, apply a critically-damped spring back toward the final position (stiffness: `300`, damping: `25`)
- **Rotational wobble**: During momentum, apply `rotate(velocity.x * 0.15deg)` — proportional to horizontal velocity, clamped to ±3°

**Anti-pattern**: No exaggerated bouncing. The card should overshoot by 3–6px maximum, then settle in one smooth correction.

### 3. Post-Release Swing (Polaroid Pendulum)

**Trigger**: Immediately after the momentum phase ends.

**Animation**: Damped sinusoidal rotation around the card's top-center (set `transform-origin: top center`).

```
rotation(t) = A * e^(-decay * t) * sin(frequency * t)
```

- **Initial amplitude (A)**: `2.5°`
- **Decay**: `3.0` (fast falloff — settles within ~1.5 seconds)
- **Frequency**: `4.0` rad/s (~0.6 Hz, natural pendulum feel)

Run this in the same rAF loop as the momentum phase. Do NOT start a separate loop.

### 4. Board Parallax (Depth Shift)

**Trigger**: Mousemove over the board container (not individual cards).

**Implementation**: Each card gets a `depth` value (assign `0.3` to `1.0` randomly on mount, store in a ref). On mousemove:

```
offsetX = (mouseX - boardCenterX) / boardWidth * maxShift * card.depth
offsetY = (mouseY - boardCenterY) / boardHeight * maxShift * card.depth
```

- **maxShift**: `10px`
- **Interpolation**: Lerp toward target at `0.08` per frame (smooth trailing)
- Apply via `translate3d(offsetX, offsetY, 0)` — additive to any existing drag offset

**Critical**: This must NOT interfere with drag transforms. When a card is being dragged, pause parallax for that card only.

### 5. Spotlight Cursor Effect

**Trigger**: Mousemove inside the board container.

**Implementation**: A single `div` positioned absolutely inside the board with:

```css
width: 350px;
height: 350px;
background: radial-gradient(circle, rgba(255,255,220,0.06) 0%, transparent 70%);
border-radius: 50%;
pointer-events: none;
filter: blur(40px);
```

- **Position**: Lerp toward cursor at `0.05` per frame (slow, cinematic trailing)
- **z-index**: Below cards, above board background

The user should NOT consciously notice this. If someone says "there's a light following my cursor" it's too strong — reduce opacity.

### 6. Hover Focus Mode

**Trigger**: Pointer enters a card.

**Hovered card**:
| Property | To | Duration | Easing |
|---|---|---|---|
| scale | 1.03 | 250ms | ease-out |
| filter: brightness | 1.08 | 250ms | ease-out |
| z-index | top - 1 (below actively dragged) | immediate | — |

**All other cards**:
| Property | To | Duration | Easing |
|---|---|---|---|
| opacity | 0.85 | 300ms | ease-out |
| scale | 0.98 | 300ms | ease-out |

**On pointer leave**: Reverse all values over 300ms.

**Guard**: If a card is currently being dragged, skip all hover logic entirely.

### 7. Modal Open Animation

**Trigger**: Double-click on a card.

**Background overlay**: Animate from `opacity: 0` to `opacity: 1` over `350ms`. Apply `backdrop-filter: blur(8px)` — fade the blur in (not instant).

**Modal container**:
| Property | From | To | Duration | Easing |
|---|---|---|---|---|
| opacity | 0 | 1 | 350ms | spring(stiffness: 260, damping: 20) |
| scale | 0.92 | 1 | 350ms | spring |
| translateY | 12px | 0 | 350ms | spring |

No harsh pop-in. The modal should feel like it rises gently into focus.

### 8. Modal Close Animation

**Trigger**: Close button OR clicking outside the modal.

| Property | From | To | Duration | Easing |
|---|---|---|---|---|
| opacity | 1 | 0 | 250ms | ease-in |
| scale | 1 | 0.95 | 250ms | ease-in |
| backdrop-filter blur | 8px | 0px | 250ms | ease-in |

Wait for the animation to complete before unmounting the modal DOM node (use `onAnimationComplete` or `transitionend`).

### 9. Save Confirmation Animation

**Trigger**: User clicks "Save Changes" in the modal.

**Sequence** (chained, not simultaneous):

1. **Modal closes** (same as §8) — `250ms`
2. **Delay**: `100ms`
3. **Card flip**: The edited card rotates `rotateX(8deg)` over `300ms` with spring easing
4. **Content swap**: Update the image/caption at the peak of the flip (when rotated forward)
5. **Card settle**: Spring back to `rotateX(0)` over `400ms` (stiffness: `200`, damping: `18`)

### 10. Reset Board Animation (Cascade)

**Trigger**: Double-click on the board background (NOT on a card).

**Sequence per card** (stagger: `80ms` between each card):

1. **Lift**: `translateY(-6px)`, `scale(1.02)` over `150ms`
2. **Move**: Animate `translate3d` and `rotate` from current position back to the original mount position. Duration: `500ms`, easing: spring (stiffness: `180`, damping: `16`)
3. **Overshoot**: The spring naturally overshoots by 2–4px, then settles — do NOT clamp it.

**Card order**: Stagger from left-to-right, top-to-bottom (sort by original grid index).

### 11. Idle Living Board

**Trigger**: No user interaction for `12 seconds` (reset the timer on any pointerdown, pointermove, or keydown on the board).

**Behavior**:

1. Select one card at random (never the same card twice in a row)
2. Over `1200ms` with ease-in-out: apply `rotate(±1deg)` and `translate(±2px, ±1px)` (randomized signs)
3. Over `1200ms`: return to original transform
4. Wait `10–15 seconds` (randomized) before the next idle animation

**Guard**: If the user interacts at any point during an idle animation, cancel it immediately and snap the card back.

---

## Mobile / Touch Considerations

- Drag pick-up and release physics should work identically with touch events
- Disable the parallax effect on touch devices (no persistent cursor)
- Disable the spotlight effect on touch devices
- Hover focus mode → skip on touch (no hover state)
- Ensure `touch-action: none` is set on draggable cards to prevent scroll hijacking

## Architecture Notes

- Use a **single** `requestAnimationFrame` loop for all continuous physics (momentum, parallax lerp, spotlight lerp, idle animation). Do NOT spin up separate rAF loops per card.
- Store all per-card physics state (velocity, position offset, depth, idle timer) in a `useRef` — not in React state. React state re-renders kill animation performance.
- Framer Motion is fine for **declarative** transitions (hover scale, modal open/close, save flip). The rAF loop handles **continuous** physics. These two systems must never animate the same CSS property on the same element simultaneously.

## Definition of Done

- [ ] All 11 animation specs implemented
- [ ] 60 fps confirmed in Chrome DevTools Performance panel during drag + release
- [ ] `next build` passes with zero errors and zero warnings
- [ ] No visible jank or stutter on a mid-range device (throttle CPU 4x in DevTools to test)
- [ ] Board feels like a real physical surface with real photographs — not a UI with animations bolted on
