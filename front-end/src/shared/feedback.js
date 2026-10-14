import { isValidElement } from "react";
import { message as staticMessage, notification as staticNotification, Modal as StaticModal } from "antd";
import SwalBase from "sweetalert2";
import withReactContent from "sweetalert2-react-content";

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

const antdMessage = proxy("message", staticMessage);
const antdModal = proxy("modal", StaticModal);
export const notification = proxy("notification", staticNotification);

// ---------------------------------------------------------------------------
// SweetAlert2 for the application's prompts and results.
//
// Every confirmation (modal.confirm), every alert (modal.info / success /
// warning / error) and every result (message.success / info / warning /
// error) goes through SweetAlert2 from here, so all 150-odd call sites
// changed at once and keep their antd-shaped calls. Successes and notes are
// small toasts in the corner that close themselves; errors and warnings are
// dialogs that wait for OK; confirmations wait for a choice and run `onOk`
// with the button spinning, staying open with the reason if it fails.
//
// SweetAlert2 shows one popup at a time: a toast that would replace an open
// confirmation (or the reverse) goes to antd's message instead, so nothing a
// person is answering is ever closed under them. message.loading, .open and
// .destroy stay antd's — progress is not a result.
// ---------------------------------------------------------------------------

const Swal = withReactContent(SwalBase);

/** The theme's look for each popup: dark or light, the accent on the main button. */
const look = () => {
  const dark = document.body?.getAttribute("data-theme") === "dark";
  const accent = getComputedStyle(document.documentElement).getPropertyValue("--eu-accent").trim() || "#2f7ecb";
  return {
    background: dark ? "#1f1f1f" : "#ffffff",
    color: dark ? "rgba(255,255,255,0.88)" : "rgba(0,0,0,0.88)",
    confirmButtonColor: accent,
    cancelButtonColor: dark ? "#434343" : "#8c8c8c",
  };
};

/** antd's (content, duration, onClose) or ({ content, duration, onClose }). */
const argsOf = (a, duration, onClose) =>
  a && typeof a === "object" && !isValidElement(a) && "content" in a ? { content: a.content, duration: a.duration, onClose: a.onClose } : { content: a, duration, onClose };

const busyWithDialog = () => SwalBase.isVisible() && !SwalBase.getPopup()?.classList.contains("swal2-toast");

function toast(icon, ...args) {
  const { content, duration, onClose } = argsOf(...args);
  if (busyWithDialog()) return antdMessage[icon](content, duration, onClose);
  const seconds = typeof duration === "number" ? duration : icon === "success" ? 2.5 : 3.5;
  const shown = Swal.fire({
    ...look(),
    toast: true,
    position: "top-end",
    icon,
    title: content,
    showConfirmButton: false,
    showCloseButton: true,
    timer: seconds > 0 ? seconds * 1000 : undefined,
    timerProgressBar: seconds > 0,
    didClose: onClose,
  });
  // antd's message returns a closer that is also a promise.
  const close = () => SwalBase.close();
  close.then = (r, j) => shown.then(r, j);
  return close;
}

function dialog(icon, ...args) {
  const { content, onClose } = argsOf(...args);
  if (busyWithDialog()) return antdMessage[icon](content);
  const shown = Swal.fire({ ...look(), icon, title: icon === "error" ? "Something went wrong" : "Please note", html: content, confirmButtonText: "OK" }).then(() => onClose?.());
  const close = () => SwalBase.close();
  close.then = (r, j) => shown.then(r, j);
  return close;
}

export const message = {
  success: (...a) => toast("success", ...a),
  info: (...a) => toast("info", ...a),
  warning: (...a) => dialog("warning", ...a),
  warn: (...a) => dialog("warning", ...a),
  error: (...a) => dialog("error", ...a),
  loading: (...a) => antdMessage.loading(...a),
  open: (...a) => antdMessage.open(...a),
  destroy: (...a) => antdMessage.destroy(...a),
};

const ICON_OF = { confirm: "question", info: "info", success: "success", warning: "warning", warn: "warning", error: "error" };

/** One of antd's modal methods, in SweetAlert2. Returns { destroy, update } like antd's. */
function prompt(kind, cfg = {}) {
  const danger = cfg.okType === "danger" || cfg.okButtonProps?.danger;
  // A "please wait" dialog: antd's with its OK disabled, closed by the caller.
  const waiting = Boolean(cfg.okButtonProps?.disabled);
  const handle = {
    destroy: () => SwalBase.close(),
    update: (next = {}) => SwalBase.update({ ...(next.title !== undefined ? { title: next.title } : {}), ...(next.content !== undefined && typeof next.content === "string" ? { html: next.content } : {}) }),
  };
  Swal.fire({
    ...look(),
    icon: cfg.icon === null ? undefined : danger ? "warning" : ICON_OF[kind] || "info",
    title: cfg.title,
    html: cfg.content,
    showCancelButton: kind === "confirm",
    showConfirmButton: !waiting,
    confirmButtonText: cfg.okText || (kind === "confirm" ? "Yes, continue" : "OK"),
    cancelButtonText: cfg.cancelText || "Cancel",
    ...(danger ? { confirmButtonColor: "#d4380d" } : {}),
    reverseButtons: true,
    focusCancel: Boolean(danger),
    allowOutsideClick: () => !waiting && !SwalBase.isLoading() && cfg.maskClosable !== false,
    allowEscapeKey: () => !waiting && !SwalBase.isLoading(),
    didOpen: waiting ? () => SwalBase.showLoading() : undefined,
    showLoaderOnConfirm: true,
    preConfirm: async () => {
      if (!cfg.onOk) return true;
      try {
        // antd passes a closer to onOk; the dialog closes itself here.
        await cfg.onOk(() => {});
        return true;
      } catch (e) {
        SwalBase.showValidationMessage(e?.message || "That could not be done. Please try again.");
        return false;
      }
    },
  }).then((r) => {
    if (r.isDismissed) cfg.onCancel?.();
    cfg.afterClose?.();
  });
  return handle;
}

export const modal = new Proxy(
  {},
  {
    get(_t, prop) {
      if (prop in ICON_OF) return (cfg) => prompt(prop, cfg);
      return antdModal[prop];
    },
  }
);
