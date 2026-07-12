import React from "react";
import ReactDOM from "react-dom/client";
import App from "./app/App";
import { Providers } from "./app/providers";
import "./styles/globals.css";
import { applyTheme, DEFAULT_THEME_ID } from "./theme/theme-registry";

applyTheme(DEFAULT_THEME_ID);

if (import.meta.env.PROD || true) {
  document.addEventListener("contextmenu", (e) => {
    // Only prevent default if it hasn't been prevented by a custom context menu handler
    if (!e.defaultPrevented) {
      e.preventDefault();
    }
  });
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Providers>
      <App />
    </Providers>
  </React.StrictMode>,
);
