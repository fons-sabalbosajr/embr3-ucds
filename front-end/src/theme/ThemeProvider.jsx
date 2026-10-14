import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ConfigProvider, theme as antdTheme } from "antd";
import { API_BASE_URL } from "../config/api";
import { getPreference, setPreference } from "../shared/preferences";
import useScreen from "../shared/useScreen";

// ---------------------------------------------------------------------------
// One theme for the whole application.
//
// Theming used to live inside Universe.jsx, so the login, landing and
// year-selection screens were unthemed — they rendered in Ant Design's
// defaults regardless of what the user had chosen, which is why signing in
// felt like crossing between two applications.
//
// It also pinned every colour token by hand: colorBgBase, colorText,
// colorBorder, colorSuccess and so on, for both modes. That is Ant Design's
// job. Its algorithm derives a consistent, accessible palette from the base
// colours, and overriding each token individually means every new component
// has to be corrected by hand and dark mode drifts out of step. Only the
// accent, the radius and the type scale are set here; everything else is
// derived.
//
// The mode and accent are per-device preferences and survive sign-out. They
// identify nobody and grant nothing.
// ---------------------------------------------------------------------------

const THEME_KEY = "ucds-theme";
const APPEARANCE_KEY = "eu-appearance";

/** Accents chosen to stay legible against both algorithms. */
export const ACCENTS = [
  { key: "blue", label: "Blue", color: "#2f7ecb" },
  { key: "ocean", label: "Ocean", color: "#1d6fa5" },
  { key: "teal", label: "Teal", color: "#177f83" },
  { key: "green", label: "Green", color: "#3f8f4f" },
  { key: "forest", label: "Forest", color: "#2f6b3a" },
  { key: "indigo", label: "Indigo", color: "#4f56c4" },
  { key: "violet", label: "Violet", color: "#6d4bc7" },
  { key: "plum", label: "Plum", color: "#8b4a9c" },
  { key: "rose", label: "Rose", color: "#b8386b" },
  { key: "crimson", label: "Crimson", color: "#b3261e" },
  { key: "ember", label: "Ember", color: "#c2531b" },
  { key: "amber", label: "Amber", color: "#a8710f" },
  { key: "slate", label: "Slate", color: "#4d6275" },
  { key: "graphite", label: "Graphite", color: "#3c4148" },
];

export const DENSITIES = [
  // Ant Design's own 14px / 32px scale, the same one ESWMP runs on; the
  // other two step one notch either side of it.
  { key: "comfortable", label: "Comfortable", fontSize: 14, controlHeight: 32 },
  { key: "compact", label: "Compact", fontSize: 13, controlHeight: 28 },
  { key: "relaxed", label: "Relaxed", fontSize: 15, controlHeight: 36 },
];

/** How the sidebar and header take the accent. */
export const NAV_STYLES = [
  { key: "tinted", label: "Tinted", description: "Deep navy washed with the accent — the default." },
  { key: "deep", label: "Deep", description: "Near-black with a hint of the accent; the quietest." },
  { key: "vivid", label: "Vivid", description: "The accent itself, darkened just enough to read on." },
  { key: "neutral", label: "Neutral", description: "Plain charcoal, no tint." },
  { key: "graphite", label: "Graphite", description: "Warm dark grey with a soft accent line." },
];

/** Corner rounding across buttons, cards, inputs and tables. */
export const RADII = [
  { key: "sharp", label: "Sharp", radius: 4 },
  { key: "rounded", label: "Rounded", radius: 8 },
  { key: "round", label: "Round", radius: 12 },
];

/** The content background behind cards and tables. */
export const SURFACES = [
  { key: "plain", label: "Plain", description: "Neutral grey (light) or near-black (dark)." },
  { key: "soft", label: "Soft", description: "A faint wash of the accent." },
  { key: "warm", label: "Warm", description: "Slightly warm paper tone." },
  { key: "cool", label: "Cool", description: "Slightly cool, bluish tone." },
];

const DEFAULTS = {
  accent: "blue",
  // A custom accent, as a hex colour, wins over `accent` when set.
  accentHex: null,
  density: "comfortable",
  tintedSider: true,
  navStyle: "tinted",
  radius: "rounded",
  surface: "plain",
};

const HEX = /^#[0-9a-f]{6}$/i;

const readAppearance = () => {
  try {
    const raw = getPreference(APPEARANCE_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
};

/** Mix two hex colours. `amount` is how much of `b` to take. */
function mix(a, b, amount) {
  const parse = (hex) => {
    const h = hex.replace("#", "");
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  };
  const [r1, g1, b1] = parse(a);
  const [r2, g2, b2] = parse(b);
  const to = (x, y) => Math.round(x + (y - x) * amount);
  return `#${[to(r1, r2), to(g1, g2), to(b1, b2)]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")}`;
}

/**
 * The navigation surfaces, derived from the accent.
 *
 * These deliberately do not follow the light/dark switch. The sidebar and
 * header are the application's identity: having them invert with the content
 * theme meant the product looked like two different systems depending on a
 * setting that is really about reading comfort. The content area still follows
 * the theme, which is what the theme is for.
 *
 * The header is the lighter of the two so the hierarchy reads correctly —
 * the sidebar is the deeper, quieter surface and the header sits above it.
 */
const NAVY = "#0d1522";

function navigationSurfaces(accent, style) {
  switch (style) {
    case "neutral":
      // Plain navigation for anyone who does not want the tint. Still fixed
      // across themes, for the same reason.
      return { sider: "#161a20", header: "#1f242c", text: "#e8ecf2" };
    case "deep":
      return { sider: mix(accent, "#07090d", 0.9), header: mix(accent, "#07090d", 0.72), text: "#eef2f8" };
    case "vivid":
      // The accent itself, darkened so white type and the selected item (in
      // the pure accent) still stand out from it.
      return { sider: mix(accent, "#000000", 0.42), header: mix(accent, "#000000", 0.22), text: "#ffffff" };
    case "graphite":
      return { sider: "#24262b", header: mix(accent, "#2c2f35", 0.7), text: "#eceef2" };
    default:
      return {
        // Far enough apart to read as two surfaces at a glance. At 0.78/0.62
        // the step was there but too subtle to see without looking for it.
        sider: mix(accent, NAVY, 0.82),
        header: mix(accent, NAVY, 0.52),
        text: "#eef2f8",
      };
  }
}

/** The content background for a surface choice, per mode. */
function contentSurface(accent, surface, isDark) {
  const base = isDark ? "#0f1115" : "#f3f5f8";
  switch (surface) {
    case "soft":
      return mix(base, accent, isDark ? 0.08 : 0.06);
    case "warm":
      return mix(base, isDark ? "#3a2f22" : "#f7efe3", isDark ? 0.35 : 0.6);
    case "cool":
      return mix(base, isDark ? "#1d2838" : "#e7eef8", isDark ? 0.4 : 0.6);
    default:
      return null; // the algorithm's own
  }
}

const ThemeContext = createContext(null);

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
};

// ---------------------------------------------------------------------------
// The look follows the person, not the device. Once signed in, the account's
// stored theme is applied here and every later change is written back
// (PUT /api/profile/theme). The browser copy in localStorage is what the
// sign-in pages use, where there is no account to ask yet, and what a
// returning person sees for the instant before /api/auth/me answers.
// ---------------------------------------------------------------------------

export const ThemeProvider = ({ children }) => {
  const [mode, setModeState] = useState(() => {
    const saved = getPreference(THEME_KEY);
    return saved === "light" || saved === "dark" ? saved : "dark";
  });
  const [appearance, setAppearanceState] = useState(readAppearance);

  // Kept on the document so plain CSS can respond to the mode without every
  // component threading a prop down to it.
  useEffect(() => {
    document.body.setAttribute("data-theme", mode);
    document.body.classList.toggle("dark-theme", mode === "dark");
    document.body.classList.toggle("light-theme", mode === "light");
  }, [mode]);

  const setMode = useCallback((next) => {
    const value = next === "light" || next === "dark" ? next : "dark";
    setModeState(value);
    setPreference(THEME_KEY, value);
  }, []);

  const toggleMode = useCallback(() => {
    setModeState((current) => {
      const next = current === "dark" ? "light" : "dark";
      setPreference(THEME_KEY, next);
      return next;
    });
  }, []);

  const setAppearance = useCallback((patch) => {
    setAppearanceState((current) => {
      const next = { ...current, ...patch };
      setPreference(APPEARANCE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const resetAppearance = useCallback(() => {
    setAppearanceState(DEFAULTS);
    setPreference(APPEARANCE_KEY, JSON.stringify(DEFAULTS));
  }, []);

  // Account sync. `bound` is set once /api/auth/me has answered for a signed-in
  // person; until then nothing is written back, so the sign-in pages' toggle
  // stays a device preference.
  const bound = useRef(false);
  const saveTimer = useRef(null);
  const skipNextSave = useRef(false);

  const bindAccount = useCallback((theme) => {
    bound.current = true;
    if (theme && typeof theme === "object") {
      skipNextSave.current = true;
      if (theme.mode === "light" || theme.mode === "dark") {
        setModeState(theme.mode);
        setPreference(THEME_KEY, theme.mode);
      }
      const patch = {};
      if (typeof theme.accent === "string") patch.accent = theme.accent;
      if (theme.accentHex === null || (typeof theme.accentHex === "string" && HEX.test(theme.accentHex))) patch.accentHex = theme.accentHex;
      if (typeof theme.density === "string") patch.density = theme.density;
      if (typeof theme.tintedSider === "boolean") patch.tintedSider = theme.tintedSider;
      if (typeof theme.navStyle === "string") patch.navStyle = theme.navStyle;
      if (typeof theme.radius === "string") patch.radius = theme.radius;
      if (typeof theme.surface === "string") patch.surface = theme.surface;
      if (Object.keys(patch).length) {
        setAppearanceState((current) => {
          const next = { ...current, ...patch };
          setPreference(APPEARANCE_KEY, JSON.stringify(next));
          return next;
        });
      }
    }
  }, []);

  const unbindAccount = useCallback(() => {
    bound.current = false;
  }, []);

  useEffect(() => {
    if (!bound.current) return undefined;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return undefined;
    }
    // A short debounce: the accent picker fires on every click.
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      fetch(`${API_BASE_URL}/api/profile/theme`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          theme: {
            mode,
            accent: appearance.accent,
            accentHex: HEX.test(appearance.accentHex || "") ? appearance.accentHex : null,
            density: appearance.density,
            tintedSider: appearance.tintedSider !== false,
            navStyle: appearance.navStyle,
            radius: appearance.radius,
            surface: appearance.surface,
          },
        }),
      }).catch(() => {});
    }, 600);
    return () => clearTimeout(saveTimer.current);
  }, [mode, appearance]);

  const isDark = mode === "dark";
  const accent = HEX.test(appearance.accentHex || "")
    ? appearance.accentHex.toLowerCase()
    : (ACCENTS.find((a) => a.key === appearance.accent) || ACCENTS[0]).color;
  const density = DENSITIES.find((d) => d.key === appearance.density) || DENSITIES[0];
  // `navStyle` supersedes the older tintedSider switch; an account that only
  // saved the switch still gets what it chose.
  const navStyle = NAV_STYLES.some((s) => s.key === appearance.navStyle)
    ? appearance.navStyle
    : appearance.tintedSider === false ? "neutral" : "tinted";
  const radius = (RADII.find((r) => r.key === appearance.radius) || RADII[1]).radius;
  const surfaceBg = useMemo(() => contentSurface(accent, appearance.surface, isDark), [accent, appearance.surface, isDark]);
  const nav = useMemo(() => navigationSurfaces(accent, navStyle), [accent, navStyle]);

  // Published as CSS variables so stylesheets follow the accent instead of
  // pinning their own colours — which is what made the header and sider ignore
  // the theme in the first place. Declared after `nav` on purpose: referencing
  // it from a dependency array above its declaration is a temporal-dead-zone
  // error, not a hoisting convenience.
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--eu-sider-bg", nav.sider);
    root.style.setProperty("--eu-header-bg", nav.header);
    root.style.setProperty("--eu-nav-text", nav.text);
    root.style.setProperty("--eu-accent", accent);
    // The accent lifted towards white: for type on the dark navigation (the
    // "E" of E-Universe), where the accent itself is too dark to read.
    root.style.setProperty("--eu-accent-light", mix(accent, "#ffffff", 0.5));
    root.style.setProperty("--highlight-color", accent);
    root.style.setProperty("--eu-radius", `${radius}px`);
    if (surfaceBg) root.style.setProperty("--eu-surface-bg", surfaceBg);
    else root.style.removeProperty("--eu-surface-bg");
  }, [nav, accent, radius, surfaceBg]);

  // Smaller on a small screen: the person's density, but never larger than
  // what fits a phone (or a tablet) — type, controls, headings, the figures
  // on the dashboards and the room inside a card all come down together, so
  // nothing has to scroll sideways and a card is not mostly padding.
  const screen = useScreen();
  const sized = useMemo(() => {
    if (screen.phone) return { fontSize: Math.min(density.fontSize, 13), controlHeight: Math.min(density.controlHeight, 30), heading4: 17, heading5: 15, figure: 20, cardPad: 12, cardHead: 40 };
    if (screen.tablet) return { fontSize: Math.min(density.fontSize, 14), controlHeight: density.controlHeight, heading4: 18, heading5: 15, figure: 22, cardPad: 16, cardHead: 46 };
    return { fontSize: density.fontSize, controlHeight: density.controlHeight, heading4: 20, heading5: 16, figure: 24, cardPad: 24, cardHead: 56 };
  }, [screen.phone, screen.tablet, density]);

  const themeConfig = useMemo(
    () => ({
      algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
      token: {
        // Only what the algorithm cannot decide for us.
        colorPrimary: accent,
        colorInfo: accent,
        borderRadius: radius,
        fontSize: sized.fontSize,
        controlHeight: sized.controlHeight,
        fontSizeHeading4: sized.heading4,
        fontSizeHeading5: sized.heading5,
        ...(surfaceBg ? { colorBgLayout: surfaceBg } : {}),
        // Ant Design's own stack: the system face on every platform, no web
        // font to download and no Poppins to fall back from.
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji'",
      },
      components: {
        // Content colours come from the algorithm so light and dark stay in
        // step without two hand-maintained palettes. The navigation is the
        // exception: it is fixed, and derived from the accent.
        Layout: {
          siderBg: nav.sider,
          headerBg: nav.header,
          triggerBg: nav.header,
          triggerColor: nav.text,
        },
        Menu: {
          itemBorderRadius: Math.max(radius - 2, 2),
          darkItemBg: "transparent",
          // Expanded submenu panels sit a shade below the sider so the
          // hierarchy (section > year > dataset) reads at a glance.
          darkSubMenuItemBg: mix(nav.sider, "#000000", 0.28),
          darkItemColor: "rgba(238, 242, 248, 0.78)",
          darkItemHoverColor: nav.text,
          darkItemHoverBg: "rgba(255, 255, 255, 0.08)",
          darkItemSelectedBg: accent,
          darkItemSelectedColor: "#ffffff",
          // The sider is the deeper surface, so its type needs a little more
          // room to stay legible against it.
          itemHeight: density.controlHeight + 4,
        },
        Button: { borderRadius: Math.max(radius - 2, 2), paddingInline: 14, fontWeight: 500 },
        Card: {
          borderRadiusLG: radius + 4,
          bodyPadding: sized.cardPad,
          bodyPaddingSM: Math.min(12, sized.cardPad),
          headerPadding: sized.cardPad,
          headerHeight: sized.cardHead,
        },
        Modal: { borderRadiusLG: radius + 4 },
        Table: { borderRadius: radius, ...(screen.phone ? { cellPaddingInlineSM: 6, cellPaddingBlockSM: 6 } : {}) },
        Statistic: { contentFontSize: sized.figure },
        Tabs: screen.phone ? { horizontalItemGutter: 16 } : {},
      },
    }),
    [isDark, accent, density, nav, radius, surfaceBg, sized, screen.phone]
  );

  const value = useMemo(
    () => ({
      mode,
      isDark,
      setMode,
      toggleMode,
      appearance,
      setAppearance,
      resetAppearance,
      accentColor: accent,
      accents: ACCENTS,
      densities: DENSITIES,
      navStyles: NAV_STYLES,
      navStyle,
      radii: RADII,
      surfaces: SURFACES,
      bindAccount,
      unbindAccount,
    }),
    [mode, isDark, setMode, toggleMode, appearance, setAppearance, resetAppearance, accent, navStyle, bindAccount, unbindAccount]
  );

  return (
    <ThemeContext.Provider value={value}>
      <ConfigProvider theme={themeConfig}>{children}</ConfigProvider>
    </ThemeContext.Provider>
  );
};

export default ThemeProvider;
