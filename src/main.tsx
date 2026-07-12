import React from "react";
import ReactDOM from "react-dom/client";
import App from "./app/App";
import { Providers } from "./app/providers";
import "./styles/globals.css";
import { installLeakDiagnostics } from './diagnostics/leak-diagnostics';

installLeakDiagnostics();
import { applyTheme, DEFAULT_THEME_ID } from "./theme/theme-registry";

applyTheme(DEFAULT_THEME_ID);

document.addEventListener("contextmenu", (e) => {
  // Only prevent default if it hasn't been prevented by a custom context menu handler
  if (!e.defaultPrevented) {
    e.preventDefault();
  }
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Providers>
      <App />
    </Providers>
  </React.StrictMode>,
);
