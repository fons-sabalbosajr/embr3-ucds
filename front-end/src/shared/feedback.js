import { message as staticMessage, notification as staticNotification, Modal as StaticModal } from "antd";

// ---------------------------------------------------------------------------
// Context-aware message, notification and modal.
//
// Ant Design v5's static `message.success(...)` cannot read the dynamic theme,
// which is what produces:
//
//   Warning: [antd: message] Static function can not consume context like
//   dynamic theme. Please use 'App' component instead.
//
// The documented fix is App.useApp(), but that is a hook: it only works inside
// a component, and this application calls message from 60 places including
// plain async handlers. Rewriting all of them into hooks would be a large,
// risky change for a warning.
//
// So the instances are captured once from App.useApp() by FeedbackBridge,
// which renders inside <App>, and handed out through these objects. Call sites
// change one import line and nothing else.
//
// Before the bridge mounts — and in a test that renders a component in
// isolation — the static API is used instead. That is exactly the current
// behaviour, so nothing is worse than it was while the app boots.
// ---------------------------------------------------------------------------

const instances = {
  message: null,
  notification: null,
  modal: null,
};

export function setFeedbackInstances(next) {
  instances.message = next.message || null;
  instances.notification = next.notification || null;
  instances.modal = next.modal || null;
}

const proxy = (key, fallback) =>
  new Proxy(
    {},
    {
      get(_target, prop) {
        const live = instances[key];
        const source = live && typeof live[prop] === "function" ? live : fallback;
        const value = source[prop];
        return typeof value === "function" ? value.bind(source) : value;
      },
    }
  );

export const message = proxy("message", staticMessage);
export const notification = proxy("notification", staticNotification);
export const modal = proxy("modal", StaticModal);
