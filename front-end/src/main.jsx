import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { installSessionTransport } from "./shared/sessionTransport";
import { installSameAccountTabs } from "./shared/sameAccountTabs";
import "./index.css";

// Before anything can make a request: each tab sends its own sign-in.
installSessionTransport();
// Links opened in a new tab from inside the application keep this tab's account.
installSameAccountTabs();

const queryClient = new QueryClient();

// No ConfigProvider here. Theming lives in ThemeProvider inside App, so there
// is one provider for the whole application; a bare outer ConfigProvider only
// supplied Ant Design defaults for anything the inner one did not set, which
// is how the login and year-selection screens ended up unthemed.
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);
