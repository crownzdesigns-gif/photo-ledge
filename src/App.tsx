import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  PHOTOS,
  BOARD_W,
  BOARD_H,
  BOARD_W_MOBILE,
  BOARD_H_MOBILE,
} from "./photos";
import { EditCardDialog } from "./EditCardDialog";
import { OnboardingHint } from "./OnboardingHint";
import { AnimatedTitle } from "./AnimatedTitle";
import "./App.css";

interface Pos {
  cx: number;
  cy: number;
}
interface CardContent {
  src: string;
  caption: string;
}

const MARGIN = 70; // keep card centres this far from the board edge
const DBL_TAP_MS = 320;
const HINT_KEY = "photoledge_hint_seen";

// Below this viewport width the wide landscape board would scale down so far
// the cards become un-tappable, so we swap to the portrait (compact) layout.
const COMPACT_MAX = 700;

type Layout = "wide" | "compact";

const getLayout = (): Layout =>
  typeof window !== "undefined" && window.innerWidth <= COMPACT_MAX
    ? "compact"
    : "wide";

// Native design size of the board for a given layout. Cards keep their native
// pixel size in both — only the board's proportions and the card arrangement
// change — so the same physics constants (MARGIN, swing, momentum) hold.
const boardDims = (l: Layout): [number, number] =>
  l === "compact" ? [BOARD_W_MOBILE, BOARD_H_MOBILE] : [BOARD_W, BOARD_H];

const SUBTITLE: Record<Layout, string> = {
  wide: "Drag the photos and arrange them",
  compact: "Pinch to resize · tap a photo to pick it up",
};

// ---- Pinch-to-zoom bounds (compact layout) -------------------------------
// The clamp is expressed as the on-screen width of a card, not a raw zoom
// factor, so a card can never pinch smaller than MIN_CARD_PX (still tappable /
// readable) nor spread larger than MAX_CARD_PX — regardless of the base
// fit-to-width scale on any given phone.
const CARD_DESIGN_W = 206; // native polaroid width (design px)
const MIN_CARD_PX = 110; // smallest a card may shrink to on screen
const MAX_CARD_PX = 320; // largest a card may grow to on screen

// ---- Physics tuning (see photo-memory-board-prompt.md) -------------------
const FRICTION = 0.92; // momentum velocity decay per frame (§2)
const V_CUTOFF = 0.5; // px/frame — momentum stops below this (§2)
const WOBBLE_K = 0.15; // rotate(velocity.x * k) during momentum (§2)
const WOBBLE_MAX = 3; // clamp wobble to ±3° (§2)
const SWING_AMP = 2.5; // pendulum initial amplitude, deg (§3)
const SWING_DECAY = 3.0; // pendulum falloff (§3)
const SWING_FREQ = 4.0; // pendulum frequency, rad/s (§3)
const SWING_LIFE = 1.6; // seconds before the swing is considered done (§3)
const PARALLAX_MAX = 10; // px max board parallax shift (§4)
const PARALLAX_LERP = 0.08; // trailing follow for parallax (§4)
const SPOTLIGHT_LERP = 0.05; // trailing follow for the spotlight (§5)
const SPRING_K = 300; // release settle stiffness (§2)
const SPRING_D = 25; // release settle damping (§2)
const RESET_K = 180; // reset cascade stiffness (§10)
const RESET_D = 16; // reset cascade damping (§10)
const RESET_STAGGER = 80; // ms between cards in the reset cascade (§10)
const IDLE_DELAY = 12000; // ms of stillness before the board "breathes" (§11)
const IDLE_MOVE = 1200; // ms each leg of an idle gesture (§11)

const defaultPositions = (l: Layout): Pos[] =>
  l === "compact"
    ? PHOTOS.map((p) => ({ cx: p.mcx, cy: p.mcy }))
    : PHOTOS.map((p) => ({ cx: p.cx, cy: p.cy }));
const defaultRotations = (): number[] => PHOTOS.map((p) => p.rotation);
const defaultOrder = (): number[] => PHOTOS.map((_, i) => i);
const angleDeg = (cx: number, cy: number, px: number, py: number) =>
  (Math.atan2(py - cy, px - cx) * 180) / Math.PI;

// Per-card continuous-physics state. Lives in a ref — never in React state —
// so the rAF loop can mutate it 60×/sec without triggering re-renders.
interface Phys {
  // momentum / settle offset (design px) layered on top of the committed pos
  ox: number;
  oy: number;
  vx: number; // velocity, px per frame (momentum) or per spring step
  vy: number;
  mode: "rest" | "momentum" | "spring";
  springT: number; // seconds since the active spring started (drives lift)
  springLift: boolean; // reset cascade lifts; keyboard nudge does not
  delay: number; // ms still to wait before this card's spring engages (stagger)
  wobble: number; // current rotational wobble, deg
  // post-release pendulum
  swingActive: boolean;
  swingT: number;
  swingAmp: number;
  // board parallax (lerped current value)
  px: number;
  py: number;
  depth: number; // 0.3–1.0 — how strongly this card reacts to parallax
  // idle drift (applied additively, eased in/out by the idle scheduler)
  idleX: number;
  idleY: number;
  idleRot: number;
}

const createPhys = (): Phys => ({
  ox: 0,
  oy: 0,
  vx: 0,
  vy: 0,
  mode: "rest",
  springT: 0,
  springLift: false,
  delay: 0,
  wobble: 0,
  swingActive: false,
  swingT: 0,
  swingAmp: 0,
  px: 0,
  py: 0,
  depth: 0.3 + Math.random() * 0.7,
  idleX: 0,
  idleY: 0,
  idleRot: 0,
});

export default function App() {
  const [layout, setLayout] = useState<Layout>(getLayout);
  const [positions, setPositions] = useState<Pos[]>(() =>
    defaultPositions(getLayout())
  );
  const [rotations, setRotations] = useState<number[]>(defaultRotations);
  const [zOrder, setZOrder] = useState<number[]>(defaultOrder);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [rotatingId, setRotatingId] = useState<number | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [flipId, setFlipId] = useState<number | null>(null);
  const [cards, setCards] = useState<CardContent[]>(() =>
    PHOTOS.map((p) => ({ src: p.src, caption: p.caption }))
  );
  const [showHint, setShowHint] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(HINT_KEY) !== "1";
  });

  const dismissHint = useCallback(() => {
    setShowHint(false);
    try {
      window.localStorage.setItem(HINT_KEY, "1");
    } catch {
      /* ignore */
    }
  }, []);

  // board scale (design px -> screen px)
  const stageRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const scaleRef = useRef(1); // fit-to-width base scale
  const [scale, setScale] = useState(1);

  // User pinch-zoom multiplier layered on top of the fit scale (compact only).
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);

  // Native board size for the active layout. Kept in refs as well so the rAF
  // loop and the pointer handlers (which close over the initial render) always
  // clamp against the current board — not a stale one — after a layout swap.
  const [boardW, boardH] = boardDims(layout);
  const boardWRef = useRef(boardW);
  const boardHRef = useRef(boardH);
  boardWRef.current = boardW;
  boardHRef.current = boardH;

  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      const s = Math.min(1, el.clientWidth / boardWRef.current);
      scaleRef.current = s;
      setScale(s);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
    // re-measure whenever the board's native width changes (layout swap)
  }, [boardW]);

  // ---- Physics engine refs (no re-renders) ------------------------------
  const physRef = useRef<Phys[]>(PHOTOS.map(createPhys));
  const physEls = useRef<(HTMLDivElement | null)[]>([]);
  const swingEls = useRef<(HTMLDivElement | null)[]>([]);
  const spotlightRef = useRef<HTMLDivElement>(null);
  const posRef = useRef<Pos[]>(defaultPositions(getLayout())); // mirror of `positions`
  const foldPending = useRef<Set<number>>(new Set());
  const draggingIdRef = useRef<number | null>(null);
  const rotatingIdRef = useRef<number | null>(null);
  // pointer position in design coords + presence, for parallax/spotlight
  const mouse = useRef({
    x: boardW / 2,
    y: boardH / 2,
    inside: false,
    fine: false,
  });
  const spot = useRef({ x: boardW / 2, y: boardH / 2, on: false });
  const lastInteract = useRef(0); // set on mount inside the rAF effect
  const idle = useRef({
    active: false,
    card: -1,
    last: -1,
    t: 0,
    tx: 0,
    ty: 0,
    rot: 0,
    nextAt: 0,
  });
  const prefersReduce = useRef(false);

  // Compose and write both GPU layers for one card. Called from the rAF loop
  // and (crucially) from the layout effect after a momentum fold, so the
  // committed left/top jump and the transform reset land in the same paint.
  const writeCard = useCallback((i: number) => {
    const p = physRef.current[i];
    const phys = physEls.current[i];
    const swing = swingEls.current[i];
    if (phys) {
      const tx = p.ox + p.px + p.idleX;
      const ty = p.oy + p.py + p.idleY;
      phys.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
    }
    if (swing) {
      // reset-cascade lift: a brief rise that peaks mid-flight then settles
      let lift = 0;
      if (p.mode === "spring" && p.springLift && p.delay <= 0) {
        lift = Math.max(0, Math.sin(Math.PI * Math.min(p.springT / 0.5, 1)));
      }
      let swingDeg = 0;
      if (p.swingActive) {
        swingDeg =
          p.swingAmp *
          Math.exp(-SWING_DECAY * p.swingT) *
          Math.sin(SWING_FREQ * p.swingT);
      }
      const rot = swingDeg + p.wobble + p.idleRot;
      swing.style.transform = `translate3d(0, ${-6 * lift}px, 0) scale(${
        1 + 0.02 * lift
      }) rotate(${rot}deg)`;
    }
  }, []);

  // Commit a momentum slide into the real position. We mark the card pending so
  // the layout effect below can zero the transform offset in the SAME paint the
  // left/top updates — no one-frame flicker.
  const commitFold = useCallback((i: number) => {
    const p = physRef.current[i];
    const cx = clamp(posRef.current[i].cx + p.ox, MARGIN, boardWRef.current - MARGIN);
    const cy = clamp(posRef.current[i].cy + p.oy, MARGIN, boardHRef.current - MARGIN);
    foldPending.current.add(i);
    setPositions((prev) => {
      const next = prev.slice();
      next[i] = { cx, cy };
      return next;
    });
  }, []);

  const startSwing = useCallback((p: Phys, speed: number) => {
    p.swingActive = true;
    p.swingT = 0;
    // scale the hang amplitude a touch by release speed, capped at the spec max
    p.swingAmp = Math.min(SWING_AMP, 0.6 + speed * 0.3);
  }, []);

  // ---- The single requestAnimationFrame loop ----------------------------
  useEffect(() => {
    prefersReduce.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    mouse.current.fine = window.matchMedia("(hover: hover)").matches;
    lastInteract.current = performance.now();

    let raf = 0;
    let last = performance.now();

    const step = (now: number) => {
      const dt = Math.min(0.032, (now - last) / 1000);
      last = now;
      const list = physRef.current;

      // ---- Spotlight trailing (§5) ----
      if (spot.current.on && !prefersReduce.current) {
        spot.current.x += (mouse.current.x - spot.current.x) * SPOTLIGHT_LERP;
        spot.current.y += (mouse.current.y - spot.current.y) * SPOTLIGHT_LERP;
        const el = spotlightRef.current;
        if (el) {
          el.style.transform = `translate3d(${spot.current.x}px, ${spot.current.y}px, 0)`;
        }
      }

      // ---- Idle "living board" scheduler (§11) ----
      const id = idle.current;
      if (!prefersReduce.current) {
        const since = now - lastInteract.current;
        if (
          !id.active &&
          since > IDLE_DELAY &&
          now > id.nextAt &&
          draggingIdRef.current === null &&
          rotatingIdRef.current === null
        ) {
          // pick a fresh card, never the same one twice in a row
          let pick = id.last;
          if (list.length > 1) {
            while (pick === id.last) pick = Math.floor(Math.random() * list.length);
          } else {
            pick = 0;
          }
          id.active = true;
          id.card = pick;
          id.last = pick;
          id.t = 0;
          id.tx = (Math.random() < 0.5 ? -1 : 1) * 2;
          id.ty = (Math.random() < 0.5 ? -1 : 1) * 1;
          id.rot = (Math.random() < 0.5 ? -1 : 1) * 1;
        }
        if (id.active) {
          id.t += dt;
          const half = IDLE_MOVE / 1000;
          const p = list[id.card];
          const ease = (t: number) =>
            t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
          if (id.t <= half) {
            const k = ease(id.t / half);
            p.idleX = id.tx * k;
            p.idleY = id.ty * k;
            p.idleRot = id.rot * k;
          } else if (id.t <= half * 2) {
            const k = ease((id.t - half) / half);
            p.idleX = id.tx * (1 - k);
            p.idleY = id.ty * (1 - k);
            p.idleRot = id.rot * (1 - k);
          } else {
            p.idleX = p.idleY = p.idleRot = 0;
            id.active = false;
            id.nextAt = now + 10000 + Math.random() * 5000; // 10–15s gap
          }
        }
      }

      // ---- Per-card physics ----
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        const dragging = draggingIdRef.current === i;

        // Parallax target (§4): off on touch, while dragging this card, or
        // when the pointer has left the board.
        let tgx = 0;
        let tgy = 0;
        if (
          mouse.current.fine &&
          mouse.current.inside &&
          !dragging &&
          !prefersReduce.current
        ) {
          const bw = boardWRef.current;
          const bh = boardHRef.current;
          tgx = ((mouse.current.x - bw / 2) / bw) * PARALLAX_MAX * p.depth;
          tgy = ((mouse.current.y - bh / 2) / bh) * PARALLAX_MAX * p.depth;
        }
        p.px += (tgx - p.px) * PARALLAX_LERP;
        p.py += (tgy - p.py) * PARALLAX_LERP;

        if (p.mode === "momentum") {
          // friction-driven slide (§2)
          p.ox += p.vx;
          p.oy += p.vy;
          p.vx *= FRICTION;
          p.vy *= FRICTION;
          // keep the card on the board; kill velocity on the axis that hits
          const cx = posRef.current[i].cx + p.ox;
          const cy = posRef.current[i].cy + p.oy;
          const bw = boardWRef.current;
          const bh = boardHRef.current;
          if (cx < MARGIN || cx > bw - MARGIN) {
            p.ox = clamp(cx, MARGIN, bw - MARGIN) - posRef.current[i].cx;
            p.vx = 0;
          }
          if (cy < MARGIN || cy > bh - MARGIN) {
            p.oy = clamp(cy, MARGIN, bh - MARGIN) - posRef.current[i].cy;
            p.vy = 0;
          }
          // rotational wobble proportional to horizontal speed (§2)
          p.wobble = clamp(p.vx * WOBBLE_K, -WOBBLE_MAX, WOBBLE_MAX);
          if (Math.hypot(p.vx, p.vy) < V_CUTOFF) {
            // momentum done → hang & swing (§3), then commit the slid position
            startSwing(p, Math.hypot(p.vx, p.vy));
            p.mode = "rest";
            p.wobble = 0;
            commitFold(i);
          }
        } else if (p.mode === "spring") {
          // damped spring back toward the committed pos (§2 settle / §10 reset)
          if (p.delay > 0) {
            p.delay -= dt * 1000;
          } else {
            p.springT += dt;
            const k = p.springLift ? RESET_K : SPRING_K;
            const c = p.springLift ? RESET_D : SPRING_D;
            p.vx += (-k * p.ox - c * p.vx) * dt;
            p.vy += (-k * p.oy - c * p.vy) * dt;
            p.ox += p.vx * dt;
            p.oy += p.vy * dt;
            if (
              Math.abs(p.ox) < 0.3 &&
              Math.abs(p.oy) < 0.3 &&
              Math.hypot(p.vx, p.vy) < 0.6
            ) {
              p.ox = p.oy = p.vx = p.vy = 0;
              p.mode = "rest";
            }
          }
        } else if (p.wobble !== 0) {
          // ease any residual wobble back to zero at rest
          p.wobble += (0 - p.wobble) * 0.2;
          if (Math.abs(p.wobble) < 0.01) p.wobble = 0;
        }

        // pendulum decay (§3) — same loop, never a second rAF
        if (p.swingActive) {
          p.swingT += dt;
          if (p.swingT > SWING_LIFE) p.swingActive = false;
        }

        writeCard(i);
      }

      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [writeCard, commitFold, startSwing]);

  // Keep posRef in sync with React positions, and reconcile momentum folds
  // before the browser paints (so the card never jumps).
  useLayoutEffect(() => {
    for (let i = 0; i < positions.length; i++) {
      posRef.current[i] = positions[i];
      if (foldPending.current.has(i)) {
        const p = physRef.current[i];
        p.ox = 0;
        p.oy = 0;
        p.vx = 0;
        p.vy = 0;
        foldPending.current.delete(i);
        writeCard(i);
      }
    }
  }, [positions, writeCard]);

  // Spring a card's transform offset back to zero. Used by reset (lift+stagger)
  // and keyboard nudges (instant, no lift). The committed position is already
  // the target; we just animate the leftover offset away with GPU transforms.
  const springOffset = useCallback(
    (i: number, fromX: number, fromY: number, lift: boolean, delay: number) => {
      const p = physRef.current[i];
      p.ox = fromX;
      p.oy = fromY;
      p.vx = 0;
      p.vy = 0;
      p.mode = "spring";
      p.springT = 0;
      p.springLift = lift;
      p.delay = delay;
      p.swingActive = false;
    },
    []
  );

  const bringToFront = useCallback((index: number) => {
    setZOrder((order) => [...order.filter((i) => i !== index), index]);
  }, []);

  const setRotation = useCallback((index: number, deg: number) => {
    setRotations((prev) => {
      const next = prev.slice();
      next[index] = deg;
      return next;
    });
  }, []);

  const openEditor = useCallback(
    (index: number) => {
      bringToFront(index);
      setEditing(index);
      dismissHint();
    },
    [bringToFront, dismissHint]
  );

  // Reset cascade (§10): stagger top-left → bottom-right. We snap committed
  // positions home, seed each card's transform offset with its travel vector,
  // then let the spring (overshoot + lift) carry it back.
  const resetBoard = useCallback(() => {
    const defs = defaultPositions(layout);
    const order = defs
      .map((d, i) => ({ i, cx: d.cx, cy: d.cy }))
      .sort((a, b) => a.cy - b.cy || a.cx - b.cx);
    order.forEach(({ i }, rank) => {
      const fromX = posRef.current[i].cx - defs[i].cx;
      const fromY = posRef.current[i].cy - defs[i].cy;
      springOffset(i, fromX, fromY, true, rank * RESET_STAGGER);
    });
    setPositions(defs);
    setRotations(defaultRotations());
    setZOrder(defaultOrder());
    dismissHint();
    lastInteract.current = performance.now();
    if ("vibrate" in navigator) navigator.vibrate?.([10, 30, 10]);
  }, [dismissHint, springOffset, layout]);

  // ---- Responsive layout swap -------------------------------------------
  // Watch the viewport for crossings of the compact breakpoint. The wide board
  // (1440px) and portrait board (400px) live in different coordinate spaces, so
  // a cross can't be sprung between — we snap every card home to the incoming
  // layout's arrangement and clear any in-flight physics in one paint.
  useEffect(() => {
    const onResize = () => setLayout(getLayout());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const firstLayout = useRef(true);
  useLayoutEffect(() => {
    if (firstLayout.current) {
      firstLayout.current = false;
      return; // mount already rendered in the correct layout
    }
    physRef.current.forEach((p) => {
      p.mode = "rest";
      p.ox = p.oy = p.vx = p.vy = p.wobble = 0;
      p.swingActive = false;
      p.idleX = p.idleY = p.idleRot = 0;
      p.px = p.py = 0;
    });
    idle.current.active = false;
    // a fresh layout starts at its natural fit — drop any pinch zoom
    zoomRef.current = 1;
    setZoom(1);
    setPositions(defaultPositions(layout));
    setRotations(defaultRotations());
    setZOrder(defaultOrder());
    lastInteract.current = performance.now();
  }, [layout]);

  // ---- Pinch-to-zoom (compact layout) -----------------------------------
  // Two fingers resize the whole board: spread to enlarge the cards, pinch to
  // shrink. The zoom multiplies the fit scale and is clamped by on-screen card
  // width so a card always stays visible and tappable.
  const clampZoom = useCallback((z: number): number => {
    const base = scaleRef.current || 1;
    const effMin = MIN_CARD_PX / CARD_DESIGN_W;
    const effMax = MAX_CARD_PX / CARD_DESIGN_W;
    const eff = clamp(base * z, effMin, effMax);
    return eff / base;
  }, []);

  const applyZoom = useCallback((next: number) => {
    const z = clampZoom(next);
    zoomRef.current = z;
    setZoom(z);
  }, [clampZoom]);

  // Abort an in-progress card drag — called when a second finger lands and the
  // gesture becomes a pinch, so the card doesn't fly off under the first finger.
  const cancelActiveDrag = useCallback(() => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    setDraggingId(null);
    draggingIdRef.current = null;
    const p = physRef.current[d.index];
    p.mode = "rest";
    p.ox = p.oy = p.vx = p.vy = p.wobble = 0;
    p.swingActive = false;
  }, []);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const dist = (t: TouchList) =>
      Math.hypot(
        t[0].clientX - t[1].clientX,
        t[0].clientY - t[1].clientY
      );
    let startDist = 0;
    let startZoom = 1;
    let pinching = false;

    const onStart = (e: TouchEvent) => {
      if (layoutRef.current !== "compact" || e.touches.length !== 2) return;
      pinching = true;
      startDist = dist(e.touches);
      startZoom = zoomRef.current;
      cancelActiveDrag();
      lastInteract.current = performance.now();
    };
    const onMove = (e: TouchEvent) => {
      if (!pinching || e.touches.length < 2) return;
      e.preventDefault(); // suppress native page zoom / scroll during a pinch
      const d = dist(e.touches);
      if (startDist > 0) applyZoom((startZoom * d) / startDist);
      lastInteract.current = performance.now();
    };
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinching = false;
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [applyZoom, cancelActiveDrag]);

  // ---- card drag + double-tap -------------------------------------------
  const drag = useRef<{
    index: number;
    pointerId: number;
    startX: number;
    startY: number;
    startCx: number;
    startCy: number;
    moved: boolean;
    samples: { x: number; y: number; t: number }[];
  } | null>(null);
  const lastCardTap = useRef<{ index: number; time: number } | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent, index: number) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      e.stopPropagation(); // keep the board from treating this as a background tap
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      const s = scaleRef.current || 1;
      // interrupt any in-flight physics on this card for a clean grab (§11 guard)
      const p = physRef.current[index];
      p.mode = "rest";
      p.ox = p.oy = p.vx = p.vy = p.wobble = 0;
      p.swingActive = false;
      p.idleX = p.idleY = p.idleRot = 0;
      if (idle.current.active && idle.current.card === index) {
        idle.current.active = false;
      }
      drag.current = {
        index,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        startCx: positions[index].cx,
        startCy: positions[index].cy,
        moved: false,
        samples: [{ x: e.clientX / s, y: e.clientY / s, t: e.timeStamp }],
      };
      setDraggingId(index);
      draggingIdRef.current = index;
      bringToFront(index);
      lastInteract.current = performance.now();
      if ("vibrate" in navigator) navigator.vibrate?.(8);
    },
    [positions, bringToFront]
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    const s = scaleRef.current || 1;
    const dx = (e.clientX - d.startX) / s;
    const dy = (e.clientY - d.startY) / s;
    if (!d.moved && Math.hypot(dx, dy) > 3) d.moved = true;
    const cx = clamp(d.startCx + dx, MARGIN, boardWRef.current - MARGIN);
    const cy = clamp(d.startCy + dy, MARGIN, boardHRef.current - MARGIN);
    // keep a short velocity history for the release throw (§2)
    d.samples.push({ x: e.clientX / s, y: e.clientY / s, t: e.timeStamp });
    if (d.samples.length > 6) d.samples.shift();
    lastInteract.current = performance.now();
    setPositions((prev) => {
      const next = prev.slice();
      next[d.index] = { cx, cy };
      return next;
    });
  }, []);

  const endDrag = useCallback(
    (e: React.PointerEvent) => {
      const d = drag.current;
      if (!d || e.pointerId !== d.pointerId) return;
      drag.current = null;
      setDraggingId(null);
      draggingIdRef.current = null;
      lastInteract.current = performance.now();
      if (d.moved) {
        lastCardTap.current = null;
        // estimate release velocity from the recent samples (px/frame @60)
        const s = d.samples;
        const latest = s[s.length - 1];
        let ref = s[0];
        for (let k = s.length - 1; k >= 0; k--) {
          if (latest.t - s[k].t >= 35) {
            ref = s[k];
            break;
          }
        }
        const dtFrames = Math.max(1, (latest.t - ref.t) / 16.67);
        const vx = (latest.x - ref.x) / dtFrames;
        const vy = (latest.y - ref.y) / dtFrames;
        const speed = Math.hypot(vx, vy);
        const p = physRef.current[d.index];
        if (speed > 1) {
          p.mode = "momentum";
          p.ox = 0;
          p.oy = 0;
          p.vx = vx;
          p.vy = vy;
        } else {
          // a soft drop — no slide, just a gentle hang (§3)
          startSwing(p, speed);
        }
        return;
      }
      const now = Date.now();
      const prev = lastCardTap.current;
      if (prev && prev.index === d.index && now - prev.time < DBL_TAP_MS) {
        lastCardTap.current = null;
        openEditor(d.index);
      } else {
        lastCardTap.current = { index: d.index, time: now };
      }
    },
    [openEditor, startSwing]
  );

  // ---- rotate handle ----------------------------------------------------
  const rot = useRef<{
    index: number;
    pointerId: number;
    cx: number;
    cy: number;
    prevAngle: number;
    accum: number;
    startRot: number;
  } | null>(null);

  const onRotateDown = useCallback(
    (e: React.PointerEvent, index: number) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      e.stopPropagation();
      const rotor = (e.currentTarget as HTMLElement).closest(
        ".card-rotor"
      ) as HTMLElement | null;
      if (!rotor) return;
      const r = rotor.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      rot.current = {
        index,
        pointerId: e.pointerId,
        cx,
        cy,
        prevAngle: angleDeg(cx, cy, e.clientX, e.clientY),
        accum: 0,
        startRot: rotations[index],
      };
      setRotatingId(index);
      rotatingIdRef.current = index;
      bringToFront(index);
      lastInteract.current = performance.now();
      if ("vibrate" in navigator) navigator.vibrate?.(6);
    },
    [rotations, bringToFront]
  );

  const onRotateMove = useCallback(
    (e: React.PointerEvent) => {
      const d = rot.current;
      if (!d || e.pointerId !== d.pointerId) return;
      e.stopPropagation();
      const a = angleDeg(d.cx, d.cy, e.clientX, e.clientY);
      let diff = a - d.prevAngle;
      if (diff > 180) diff -= 360; // unwrap across the ±180 seam
      if (diff < -180) diff += 360;
      d.accum += diff;
      d.prevAngle = a;
      lastInteract.current = performance.now();
      setRotation(d.index, d.startRot + d.accum);
    },
    [setRotation]
  );

  const onRotateUp = useCallback((e: React.PointerEvent) => {
    const d = rot.current;
    if (!d || e.pointerId !== d.pointerId) return;
    e.stopPropagation();
    rot.current = null;
    setRotatingId(null);
    rotatingIdRef.current = null;
  }, []);

  // keyboard: arrows nudge, < > rotate, Enter/Space edits
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent, index: number) => {
      lastInteract.current = performance.now();
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openEditor(index);
        return;
      }
      if (e.key === "," || e.key === "<") {
        e.preventDefault();
        setRotation(index, rotations[index] - (e.shiftKey ? 45 : 15));
        return;
      }
      if (e.key === "." || e.key === ">") {
        e.preventDefault();
        setRotation(index, rotations[index] + (e.shiftKey ? 45 : 15));
        return;
      }
      const step = e.shiftKey ? 24 : 8;
      const moves: Record<string, [number, number]> = {
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
      };
      const m = moves[e.key];
      if (!m) return;
      e.preventDefault();
      bringToFront(index);
      setPositions((prev) => {
        const next = prev.slice();
        const cur = prev[index];
        const cx = clamp(cur.cx + m[0], MARGIN, boardWRef.current - MARGIN);
        const cy = clamp(cur.cy + m[1], MARGIN, boardHRef.current - MARGIN);
        next[index] = { cx, cy };
        // animate the step with a transform spring, not a left/top jump
        springOffset(index, cur.cx - cx, cur.cy - cy, false, 0);
        return next;
      });
    },
    [bringToFront, openEditor, setRotation, rotations, springOffset]
  );

  // ---- background double-tap (reset) ------------------------------------
  const lastBoardTap = useRef(0);
  const onBoardPointerUp = useCallback(() => {
    if (editing !== null) return;
    const now = Date.now();
    if (now - lastBoardTap.current < DBL_TAP_MS) {
      lastBoardTap.current = 0;
      resetBoard();
    } else {
      lastBoardTap.current = now;
    }
  }, [editing, resetBoard]);

  // ---- board pointer tracking (parallax + spotlight + idle reset) -------
  const onBoardPointerMove = useCallback((e: React.PointerEvent) => {
    lastInteract.current = performance.now();
    if (e.pointerType !== "mouse") return; // mobile: no parallax/spotlight
    const board = boardRef.current;
    if (!board) return;
    const r = board.getBoundingClientRect();
    const s = scaleRef.current || 1;
    mouse.current.x = (e.clientX - r.left) / s;
    mouse.current.y = (e.clientY - r.top) / s;
    mouse.current.inside = true;
    if (!spot.current.on) {
      spot.current.on = true;
      spotlightRef.current?.classList.add("is-on");
    }
  }, []);

  const onBoardPointerLeave = useCallback((e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    mouse.current.inside = false;
    spot.current.on = false;
    spotlightRef.current?.classList.remove("is-on");
  }, []);

  // ---- save → flip confirmation (§9) ------------------------------------
  const flipTimers = useRef<number[]>([]);
  useEffect(
    () => () => flipTimers.current.forEach((t) => window.clearTimeout(t)),
    []
  );

  const handleSave = useCallback(
    (index: number, next: { src: string; caption: string; rotation: number }) => {
      setEditing(null); // dialog has already played its close animation
      // §9: delay → flip → swap content at the peak → settle
      const t1 = window.setTimeout(() => {
        setFlipId(index);
        const t2 = window.setTimeout(() => {
          // swap image/caption + rotation at the forward peak of the flip
          setCards((prev) => {
            const copy = prev.slice();
            copy[index] = { src: next.src, caption: next.caption };
            return copy;
          });
          setRotation(index, next.rotation);
        }, 300);
        const t3 = window.setTimeout(() => setFlipId(null), 720);
        flipTimers.current.push(t2, t3);
      }, 100);
      flipTimers.current.push(t1);
      lastInteract.current = performance.now();
    },
    [setRotation]
  );

  return (
    <main className="page">
      <header className="masthead">
        <AnimatedTitle text="hang your Favorite photos" />
        <p className="subtitle">{SUBTITLE[layout]}</p>
      </header>

      <div className="stage" ref={stageRef} style={{ height: boardH * scale }}>
        <div
          className="board"
          ref={boardRef}
          style={{
            width: boardW,
            height: boardH,
            transform: `translateX(-50%) scale(${scale})`,
            // pinch zoom resizes only the cards, not the brown board — each
            // card reads this multiplier and scales around its own centre
            ["--zoom" as string]: zoom,
          }}
          onPointerUp={onBoardPointerUp}
          onPointerMove={onBoardPointerMove}
          onPointerLeave={onBoardPointerLeave}
        >
          <div className="board__surface" aria-hidden>
            <div className="board__texture" />
          </div>
          <div className="board__spotlight" ref={spotlightRef} aria-hidden />

          {PHOTOS.map((photo, index) => {
            const pos = positions[index];
            const content = cards[index];
            const z = zOrder.indexOf(index) + 1;
            const isDragging = draggingId === index;
            const isRotating = rotatingId === index;
            const isFlipping = flipId === index;
            const invite = showHint && index === 0;
            return (
              <div
                key={photo.id}
                className={`card-anchor${isDragging ? " is-dragging" : ""}${
                  isRotating ? " is-rotating" : ""
                }${isFlipping ? " is-flipping" : ""}`}
                style={{
                  left: pos.cx,
                  top: pos.cy,
                  zIndex: isDragging || isRotating ? 999 : z,
                  ["--enter-delay" as string]: `${index * 70}ms`,
                }}
                role="button"
                tabIndex={0}
                aria-label={`${content.caption}. Drag to move, press Enter to edit, arrow keys to nudge, comma and period to rotate.`}
                onPointerDown={(e) => onPointerDown(e, index)}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onKeyDown={(e) => onKeyDown(e, index)}
              >
                <div className="card-zoom">
                <div
                  className="card-phys"
                  ref={(el) => {
                    physEls.current[index] = el;
                  }}
                >
                  <div
                    className="card-swing"
                    ref={(el) => {
                      swingEls.current[index] = el;
                    }}
                  >
                    <div
                      className="card-rotor"
                      style={{ ["--rot" as string]: `${rotations[index]}deg` }}
                    >
                      <button
                        type="button"
                        className="rotate-handle"
                        aria-label={`Rotate ${content.caption}`}
                        tabIndex={-1}
                        onPointerDown={(e) => onRotateDown(e, index)}
                        onPointerMove={onRotateMove}
                        onPointerUp={onRotateUp}
                        onPointerCancel={onRotateUp}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden>
                          <path
                            d="M21 12a9 9 0 1 1-2.64-6.36M21 3v4h-4"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>

                      <figure
                        className={`polaroid${invite ? " is-invite" : ""}`}
                        style={{ background: photo.bg }}
                      >
                        <div className="polaroid__frame">
                          <img
                            className="polaroid__img"
                            src={content.src}
                            alt={content.caption}
                            draggable={false}
                            loading="lazy"
                          />
                        </div>
                        <figcaption
                          className="polaroid__caption"
                          style={{ color: photo.text }}
                        >
                          {content.caption}
                        </figcaption>
                      </figure>
                    </div>
                  </div>
                </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <OnboardingHint show={showHint} onDismiss={dismissHint} />

      {editing !== null && (
        <EditCardDialog
          caption={cards[editing].caption}
          src={cards[editing].src}
          rotation={rotations[editing]}
          accent={PHOTOS[editing].bg}
          onClose={() => setEditing(null)}
          onSave={(next) => handleSave(editing, next)}
        />
      )}
    </main>
  );
}

function clamp(v: number, min: number, max: number) {
  return v < min ? min : v > max ? max : v;
}
