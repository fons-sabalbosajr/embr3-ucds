import React from "react";
import embLogo from "../assets/emblogo.svg";
import bagongPilipinas from "../assets/bagongpilipinas.png";
import "./authbrand.css";

/**
 * The official seal pairing used across the public pages: the EMB Region III
 * logo alongside the Bagong Pilipinas seal.
 *
 * `size` — "sm" for compact headers, "md" (default) for auth cards,
 * "lg" for the landing hero.
 */
// Written out whole, never as `auth-brand--${size}`: PurgeCSS keeps a rule
// only if it finds the class name literally in the source, so the assembled
// form lost every size rule in production and the seals rendered at their
// natural sizes (the EMB seal is 1500 px square).
const SIZE_CLASS = { sm: "auth-brand--sm", md: "auth-brand--md", lg: "auth-brand--lg" };

const AuthBrand = ({ size = "md", showText = true, className = "" }) => (
  <div className={`auth-brand ${SIZE_CLASS[size] || SIZE_CLASS.md} ${className}`.trim()}>
    <div className="auth-brand-marks">
      <img src={embLogo} alt="Environmental Management Bureau" className="auth-brand-emb" />
      <span className="auth-brand-divider" aria-hidden="true" />
      <img src={bagongPilipinas} alt="Bagong Pilipinas" className="auth-brand-bp" />
    </div>
    {showText && (
      <div className="auth-brand-text">
        <span className="auth-brand-agency">Environmental Management Bureau</span>
        <span className="auth-brand-region">Regional Office III</span>
      </div>
    )}
  </div>
);

export default AuthBrand;
