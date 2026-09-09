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
  { key: "comfortable", label: "Comfortable", fontSize: 14, controlHeight: 36 },
  { key: "compact", label: "Compact", fontSize: 13, controlHeight: 32 },
  { key: "relaxed", label: "Relaxed", fontSize: 15, controlHeight: 40 },
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
        fontFamily:
          "Poppins, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      },
      components: {
        // Structural choices only. Colours come from the algorithm so light
        // and dark stay in step without two hand-maintained palettes.
        Menu: { itemBorderRadius: 6, ...(appearance.tintedSider ? {} : { darkItemBg: "transparent" }) },
        Button: { borderRadius: 6, paddingInline: 14, fontWeight: 500 },
        Card: { borderRadiusLG: 12 },
        Modal: { borderRadiusLG: 12 },
        Table: { borderRadius: 8 },
      },
    }),
    [isDark, accent, density, appearance.tintedSider]
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
