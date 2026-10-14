import { useEffect, useRef } from "react";
import { Button } from "antd";
import { BellOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { getSocket, initializeSocket } from "../../api/socketService";
import { getSessionToken } from "../sessionToken";
import { notification } from "../feedback";
import { isPushOn } from "./devicePush";

// ---------------------------------------------------------------------------
// Notices as they happen (server/services/notifier.js).
//
// The server sends a notice to the account's room the moment something needs
// this person — a document request to decide, a message, a decision on their
// own request. This shows it in the corner of the screen with a button to the
// right page, and tells the caller so the bell's counts refresh at once
// instead of on the next two-minute poll.
//
// With the tab in the background and no push subscription on this device,
// the browser's own notification is used instead, if the person allowed it;
// with a subscription, the service worker shows it (public/sw.js), so a
// notice never appears twice.
// ---------------------------------------------------------------------------

export default function useRealtimeNotices({ enabled, username, onNotice }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const onNoticeRef = useRef(onNotice);
  onNoticeRef.current = onNotice;

  useEffect(() => {
    if (!enabled || !username) return undefined;
    const socket = getSocket() || initializeSocket();
    // Say who this tab is: the socket may have connected before sign-in, or
    // while the tab was another account.
    const identify = () => socket.emit("notify:identify", { token: getSessionToken() });
    if (socket.connected) identify();
    socket.on("connect", identify);

    const handle = async (notice) => {
      // This tab's account only — a socket that has not yet re-identified
      // after a sign-in must not show the previous account's notice.
      if (notice.to && notice.to !== username) return;
      onNoticeRef.current?.(notice);
      // The screens showing counts and lists (a dashboard's "requests
      // waiting", the inbox) refresh too, not only the bell.
      for (const area of ["dashboard", "messages"]) queryClient.invalidateQueries({ queryKey: ["erms", area] });
      if (String(notice.kind || "").startsWith("portal-")) queryClient.invalidateQueries({ queryKey: ["portal"] });
      const open = () => navigate(notice.url || "/universe");
      if (document.visibilityState === "hidden" && "Notification" in window && Notification.permission === "granted" && !(await isPushOn())) {
        try {
          const n = new Notification(notice.title, { body: notice.body, tag: notice.tag, icon: "/notice-icon.png" });
          n.onclick = () => {
            window.focus();
            open();
            n.close();
          };
        } catch {
          /* some browsers only allow notifications from the service worker */
        }
      }
      const key = `notice-${notice.tag || notice.at}`;
      notification.open({
        key,
        message: notice.title,
        description: notice.body,
        icon: <BellOutlined style={{ color: "var(--ant-color-primary, #1677ff)" }} />,
        placement: "topRight",
        // Something to act on stays until dismissed: a request to decide, or
        // an approval to open before its time runs.
        duration: ["portal-request", "portal-chat", "portal-decision", "portal-seated"].includes(notice.kind) ? 0 : 8,
        actions: (
          <Button
            type="primary"
            size="small"
            onClick={() => {
              notification.destroy(key);
              open();
            }}
          >
            Open
          </Button>
        ),
      });
    };
    socket.on("notify", handle);

    // The service worker asks each tab which account it is, to show a device
    // notice only when that account's own tab is not in front, and to bring
    // the right tab forward when it is clicked (public/sw.js).
    const whoami = (event) => {
      if (event.data?.type === "eu:whoami" && event.ports?.[0]) event.ports[0].postMessage({ username });
    };
    navigator.serviceWorker?.addEventListener("message", whoami);
    // addEventListener alone does not start the queue of messages from the worker.
    navigator.serviceWorker?.startMessages?.();
    return () => {
      socket.off("connect", identify);
      socket.off("notify", handle);
      navigator.serviceWorker?.removeEventListener("message", whoami);
    };
  }, [enabled, username, navigate, queryClient]);
}
