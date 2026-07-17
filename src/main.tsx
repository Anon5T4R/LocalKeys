import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { useLocale } from "./lib/i18n";
import { initTheme } from "./lib/theme";
import "./App.css";

// Aplica o tema salvo antes de renderizar (evita flash do tema do sistema).
initTheme();

// Remonta a árvore ao trocar de idioma → todo t() reavalia.
function Root() {
  const locale = useLocale();
  return <App key={locale} />;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
