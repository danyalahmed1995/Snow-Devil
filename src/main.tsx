import React from "react";
import ReactDOM from "react-dom/client";
import App from "./app/App";
import { Providers } from "./app/providers";
import "./styles/globals.css";
import { useThemeStore } from "./stores/theme-store";
import { applyTheme } from "./theme/theme-registry";

applyTheme(useThemeStore.getState().themeId);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Providers>
      <App />
    </Providers>
  </React.StrictMode>,
);
