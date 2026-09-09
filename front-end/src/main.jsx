import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./index.css";

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
