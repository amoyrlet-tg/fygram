const SETTLE_MS = 250;

function scrollFocusedIntoView() {
  const focused = document.activeElement;
  if (!(focused instanceof HTMLElement)) return;
  if (!focused.matches("input, textarea, [contenteditable]")) return;
  focused.scrollIntoView({ block: "center", behavior: "smooth" });
}

export function keepTypingVisible() {
  document.addEventListener("focusin", () => {
    window.setTimeout(scrollFocusedIntoView, SETTLE_MS);
  });
  window.visualViewport?.addEventListener("resize", scrollFocusedIntoView);
}
