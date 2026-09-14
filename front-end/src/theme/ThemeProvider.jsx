import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ConfigProvider, theme as antdTheme } from "antd";
import { getPreference, setPreference } from "../shared/preferences";

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
  { key: "green", label: "Green", color: "#3f8f4f" },
  { key: "teal", label: "Teal", color: "#177f83" },
  { key: "indigo", label: "Indigo", color: "#4f56c4" },
  { key: "plum", label: "Plum", color: "#8b4a9c" },
  { key: "amber", label: "Amber", color: "#a8710f" },
];

export const DENSITIES = [
  // Ant Design's own 14px / 32px scale, the same one ESWMP runs on; the
  // other two step one notch either side of it.
  { key: "comfortable", label: "Comfortable", fontSize: 14, controlHeight: 32 },
  { key: "compact", label: "Compact", fontSize: 13, controlHeight: 28 },
  { key: "relaxed", label: "Relaxed", fontSize: 15, controlHeight: 36 },
];

const DEFAULTS = { accent: "blue", density: "comfortable", tintedSider: true };

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

function navigationSurfaces(accent, tinted) {
  if (!tinted) {
    // Neutral navigation for anyone who does not want the tint. Still fixed
    // across themes, for the same reason.
    return { sider: "#161a20", header: "#1f242c", text: "#e8ecf2" };
  }
  return {
    // Far enough apart to read as two surfaces at a glance. At 0.78/0.62 the
    // step was there but too subtle to see without looking for it.
    sider: mix(accent, NAVY, 0.82),
    header: mix(accent, NAVY, 0.52),
    text: "#eef2f8",
  };
}

const ThemeContext = createContext(null);

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
};

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

  const isDark = mode === "dark";
  const accent = (ACCENTS.find((a) => a.key === appearance.accent) || ACCENTS[0]).color;
  const density = DENSITIES.find((d) => d.key === appearance.density) || DENSITIES[0];
  const nav = useMemo(
    () => navigationSurfaces(accent, appearance.tintedSider !== false),
    [accent, appearance.tintedSider]
  );

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
    root.style.setProperty("--highlight-color", accent);
  }, [nav, accent]);

  const themeConfig = useMemo(
    () => ({
      algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
      token: {
        // Only what the algorithm cannot decide for us.
        colorPrimary: accent,
        colorInfo: accent,
        borderRadius: 8,
        fontSize: density.fontSize,
        controlHeight: density.controlHeight,
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
          itemBorderRadius: 6,
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
        Button: { borderRadius: 6, paddingInline: 14, fontWeight: 500 },
        Card: { borderRadiusLG: 12 },
        Modal: { borderRadiusLG: 12 },
        Table: { borderRadius: 8 },
      },
    }),
    [isDark, accent, density, nav]
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
    }),
    [mode, isDark, setMode, toggleMode, appearance, setAppearance, resetAppearance, accent]
  );

  return (
    <ThemeContext.Provider value={value}>
      <ConfigProvider theme={themeConfig}>{children}</ConfigProvider>
    </ThemeContext.Provider>
  );
};

export default ThemeProvider;
