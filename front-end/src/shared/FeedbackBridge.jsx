import { useEffect } from "react";
import { App as AntdApp } from "antd";
import { setFeedbackInstances } from "./feedback";

/**
 * Hands the context-aware message/notification/modal instances to
 * shared/feedback.js, so code outside a component can use them.
 *
 * Must render inside <App>. Renders nothing.
 */
const FeedbackBridge = () => {
  const { message, notification, modal } = AntdApp.useApp();

  useEffect(() => {
    setFeedbackInstances({ message, notification, modal });
  }, [message, notification, modal]);

  return null;
};

export default FeedbackBridge;
