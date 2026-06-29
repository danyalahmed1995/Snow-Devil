import React from "react";
import ReactDOM from "react-dom/client";
import App from "./app/App";
import { Providers } from "./app/providers";
import "./styles/globals.css";
import { applyTheme, DEFAULT_THEME_ID } from "./theme/theme-registry";

applyTheme(DEFAULT_THEME_ID);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Providers>
      <App />
    </Providers>
  </React.StrictMode>,
);
