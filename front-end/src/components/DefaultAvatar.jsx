import React from "react";
import { Avatar } from "antd";

// ---------------------------------------------------------------------------
// The avatar for an account with no photo.
//
// It used to be one of two random things: <NiceAvatar /> with no props, which
// draws a new cartoon face on every render, or a ui-avatars.com URL with
// `background=random`, which fetched a differently coloured tile on every
// load. Either way the same person looked different from one screen to the
// next, and the second one sent every name to a third-party service.
//
// This is initials on a colour chosen by hashing the name, so the same
// account always gets the same tile, offline, with nothing left to chance.
// ---------------------------------------------------------------------------

// Muted, distinguishable, legible under white initials in both themes.
const PALETTE = [
  "#2f7ecb", "#3f8f4f", "#177f83", "#4f56c4", "#8b4a9c", "#a8710f",
  "#b3542f", "#2a6f97", "#5c7a29", "#7a3b5e", "#38707a", "#6d5b2a",
];

const hash = (s) => {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};

/** The tile colour for a name. Exported for places that draw their own. */
export const avatarColor = (name) => PALETTE[hash(String(name || "?")) % PALETTE.length];

/** "Alfonso C. Sabalbosa Jr." -> "AS"; "pemu_pampanga" -> "PP"; "" -> "?". */
export const initialsOf = (name) => {
  const words = String(name || "")
    .replace(/[_.-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((w) => w && !/^(jr|sr|ii|iii|iv)\.?$/i.test(w));
  if (!words.length) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
};

/**
 * @param {string} name       what the initials and colour come from
 * @param {number|string} size  Ant Design Avatar size (number of px, or a
 *                             CSS length string)
 */
const DefaultAvatar = ({ name, size = 32, className, style, title }) => {
  const px = typeof size === "number" ? size : parseInt(size, 10) || 32;
  return (
    <Avatar
      className={className}
      title={title ?? (name || undefined)}
      size={px}
      style={{
        backgroundColor: avatarColor(name),
        color: "#fff",
        fontWeight: 600,
        fontSize: Math.max(11, Math.round(px * 0.4)),
        flex: "none",
        ...style,
      }}
    >
      {initialsOf(name)}
    </Avatar>
  );
};

export default DefaultAvatar;
