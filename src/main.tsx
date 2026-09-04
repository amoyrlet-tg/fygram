import React from "react";
import ReactDOM from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./app/App";
import { DocsWindow } from "./features/docs/DocsWindow";
import { keepTypingVisible } from "./shared/lib/keyboardInsets";

const savedTheme = localStorage.getItem("theme");
if (savedTheme === "light" || savedTheme === "dark") {
  document.documentElement.dataset.theme = savedTheme;
}

const isEditable = (el: EventTarget | null) =>
  el instanceof HTMLElement &&
  (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);

window.addEventListener("contextmenu", (e) => {
  if (import.meta.env.DEV) return;
  if (!isEditable(e.target)) e.preventDefault();
});

window.addEventListener("dragstart", (e) => e.preventDefault());

window.addEventListener(
  "wheel",
  (e) => {
    if (e.ctrlKey) e.preventDefault();
  },
  { passive: false },
);
for (const gestureEvent of ["gesturestart", "gesturechange", "gestureend"]) {
  window.addEventListener(gestureEvent, (e) => e.preventDefault());
}

window.addEventListener("keydown", (e) => {
  const key = e.key.toLowerCase();
  const reload = key === "f5" || ((e.ctrlKey || e.metaKey) && (key === "r" || key === "f5"));
  if (reload && !import.meta.env.DEV) e.preventDefault();

  if ((e.ctrlKey || e.metaKey) && key === "q") {
    e.preventDefault();
    void getCurrentWindow().close();
  }

  if (key === "f11") {
    e.preventDefault();
    invoke("toggle_fullscreen").catch(console.error);
  }
});

keepTypingVisible();

const isDocs = window.location.hash.startsWith("#/docs");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>{isDocs ? <DocsWindow /> : <App />}</React.StrictMode>,
);
