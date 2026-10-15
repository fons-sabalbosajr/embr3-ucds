import { Suspense, lazy, useEffect, useRef } from "react";

// ---------------------------------------------------------------------------
// React wrappers for VERA's two canvas animations: the dotted flame
// (engine/veraFlame.js) and the border beam (engine/veraBeam.js).
//
// The engines and their outline data are loaded on first use, in their own
// chunk, so a page that never shows VERA does not download them. Until the
// chunk arrives the canvas is simply empty, at its final size, so nothing
// shifts when it starts drawing.
//
// `theme` should be the app's mode ("dark" | "light"); "auto" falls back to
// the nearest [data-theme], which ThemeProvider keeps on <body>.
// ---------------------------------------------------------------------------

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

let flameEngine = null;
const loadFlame = () => (flameEngine ||= import("./engine/veraFlame"));
let beamEngine = null;
const loadBeam = () => (beamEngine ||= import("./engine/veraBeam"));

/** Mounts an engine on the canvas once, then forwards prop changes through `sync`. */
function useEngine(load, mountName, initial, sync, deps) {
  const canvasRef = useRef(null);
  const handleRef = useRef(null);
  const latest = useRef(initial);
  latest.current = initial;

  useEffect(() => {
    let cancelled = false;
    load().then((mod) => {
      if (cancelled || !canvasRef.current) return;
      handleRef.current = mod[mountName](canvasRef.current, { ...latest.current, paused: prefersReducedMotion() });
    });
    return () => {
      cancelled = true;
      handleRef.current?.destroy();
      handleRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (handleRef.current) sync(handleRef.current, latest.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return canvasRef;
}

/**
 * The animated dotted flame.
 * state: burning | thinking | working | searching | listening | breathing | igniting
 */
export function VeraFlame({ size = 32, state = "burning", theme = "auto", colored = true, glow = true, label = "VERA", className = "", style }) {
  const ref = useEngine(
    loadFlame,
    "mountFlame",
    { state, theme, colored, glow, label, size },
    (h, o) => {
      h.setState(o.state);
      h.setTheme(o.theme);
      h.setColored(o.colored);
    },
    [state, theme, colored]
  );
  return (
    <canvas
      ref={ref}
      className={["vera-mark", className].filter(Boolean).join(" ")}
      style={{ width: size, height: size, ...style }}
      width={size}
      height={size}
    />
  );
}

/**
 * A border beam running round the rounded edge of its parent — the launcher
 * pill, a card. Place it as the first child of an element with
 * position: relative (or fixed); it overlays that element, reaching `pad`
 * pixels beyond it so the bloom has room, and never takes a click.
 * radius: the parent's corner radius in pixels, or "pill".
 * type: rotate | line | pulse-inner | pulse-outside
 * color: a named palette ("vera") or a hex colour, usually the app's accent.
 */
export function VeraEdgeBeam({ radius = "pill", pad = 10, type = "rotate", color = "vera", active = true, theme = "auto", strength = 1, speed = 1 }) {
  const ref = useEngine(
    loadBeam,
    "mountBeam",
    { shape: "rect", rect: { inset: pad, radius }, type, color, active, theme, strength, speed },
    (h, o) => h.set(o),
    [radius, pad, type, color, active, theme, strength, speed]
  );
  // A canvas does not stretch between its offsets the way a div does, so the
  // size is given outright: the parent's plus the pad on each side.
  const grow = `calc(100% + ${pad * 2}px)`;
  return <canvas ref={ref} className="vera-edge-beam" style={{ top: -pad, left: -pad, width: grow, height: grow }} />;
}

// ---------------------------------------------------------------------------
// VERA's orb (thinking-orbs, libraries.dev/orbs): the animated mark on her
// launcher, in her "thinking" bubble and on the settings page, in place of
// the border beam. Her states map onto the orb's own hand-tuned ones:
//
//   burning (at rest)  → breathing     a face-on ring, slowly morphing
//   listening (typing) → listening     a waveform through latitude rings
//   thinking           → working       particles on tilted orbits
//   searching          → searching     a scan sweeping a dotted globe
//   working            → composing     an undulating multi-band sash
//
// Loaded on first use, in its own chunk; until then an empty box of the
// final size holds its place, so nothing shifts.
// ---------------------------------------------------------------------------

const ThinkingOrb = lazy(() => import("thinking-orbs").then((m) => ({ default: m.ThinkingOrb })));

const ORB_STATE = { burning: "breathing", listening: "listening", thinking: "working", searching: "searching", working: "composing" };
const ORB_SIZES = [20, 32, 64];

export function VeraOrb({ state = "burning", size = 32, theme = "auto", color, speed = 1, label = "VERA", className = "", style }) {
  const tuned = ORB_SIZES.includes(size) ? size : 32;
  const holder = <span className={`vera-orb ${className}`.trim()} style={{ width: tuned, height: tuned, display: "inline-block", flex: "none", ...style }} aria-hidden={!label} />;
  return (
    <Suspense fallback={holder}>
      <span className={`vera-orb ${className}`.trim()} style={{ width: tuned, height: tuned, display: "inline-flex", flex: "none", ...style }}>
        <ThinkingOrb
          state={ORB_STATE[state] || state}
          size={tuned}
          theme={theme === "dark" || theme === "light" ? theme : "auto"}
          color={color}
          speed={speed}
          aria-label={label || undefined}
          aria-hidden={label ? undefined : true}
        />
      </span>
    </Suspense>
  );
}
