/**
 * Keeps the focused field above the on-screen keyboard.
 *
 * `interactive-widget=resizes-content` shrinks the viewport rather than
 * covering it, but the browser only scrolls the field back some of the time.
 */
const SETTLE_MS = 250;

function scrollFocusedIntoView() {
  const focused = document.activeElement;
  if (!(focused instanceof HTMLElement)) return;
  if (!focused.matches("input, textarea, [contenteditable]")) return;
  focused.scrollIntoView({ block: "center", behavior: "smooth" });
}

export function keepTypingVisible() {
  // The keyboard animates in, so the useful geometry only exists a moment later.
  document.addEventListener("focusin", () => {
    window.setTimeout(scrollFocusedIntoView, SETTLE_MS);
  });
  // Rotation, a keyboard swap, a suggestion strip appearing: same problem.
  window.visualViewport?.addEventListener("resize", scrollFocusedIntoView);
}
