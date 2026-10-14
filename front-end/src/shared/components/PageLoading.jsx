import { useEffect, useState } from "react";
import { theme as antdTheme } from "antd";
import embLogo from "../../assets/emblogo.svg";
import "./pageloading.css";

// ---------------------------------------------------------------------------
// The whole-page loading screen: signing in is being checked, the year is
// being chosen, the application shell is coming up.
//
// It used to be the word "Loading..." in the corner of a white page (or an
// empty overlay), which read as something broken. Now: the Bureau's seal in
// a turning ring of the theme's accent, the product's name, and a line that
// says what is happening — changing every couple of seconds, so a slow
// network still shows movement. Light or dark with the theme.
// ---------------------------------------------------------------------------

const STEPS = ["Checking your session", "Opening your workspace", "Loading your modules", "Almost there"];

const PageLoading = ({ tip, fullscreen = true }) => {
  const { token } = antdTheme.useToken();
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (tip) return undefined;
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 1800);
    return () => clearInterval(t);
  }, [tip]);

  return (
    <div
      className={`eu-page-loading${fullscreen ? " eu-page-loading--full" : ""}`}
      style={{ background: fullscreen ? token.colorBgLayout : "transparent", color: token.colorText }}
      role="status"
      aria-live="polite"
    >
      <div className="eu-page-loading__mark">
        <span className="eu-page-loading__ring" />
        <span className="eu-page-loading__ring eu-page-loading__ring--slow" />
        <img src={embLogo} alt="" className="eu-page-loading__seal" />
      </div>
      <div className="eu-page-loading__name">
        <span className="eu-page-loading__e">E</span>-Universe
      </div>
      <div className="eu-page-loading__sub" style={{ color: token.colorTextSecondary }}>
        Unified Information &amp; Records Management System
      </div>
      <div className="eu-page-loading__bar" style={{ background: token.colorFillSecondary }}>
        <span />
      </div>
      <div className="eu-page-loading__tip" style={{ color: token.colorTextTertiary }} key={tip || step}>
        {tip || STEPS[step]}…
      </div>
    </div>
  );
};

export default PageLoading;
