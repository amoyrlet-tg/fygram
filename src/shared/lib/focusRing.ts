const ATTRIBUTE = "data-keyboard-nav";

const NAVIGATION_KEYS = new Set([
  "Tab",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
  "PageUp",
  "PageDown",
]);

export function trackKeyboardFocus() {
  window.addEventListener(
    "keydown",
    (event) => {
      if (NAVIGATION_KEYS.has(event.key)) {
        document.documentElement.setAttribute(ATTRIBUTE, "");
      }
    },
    true,
  );

  for (const event of ["mousedown", "pointerdown", "touchstart"] as const) {
    window.addEventListener(event, () => document.documentElement.removeAttribute(ATTRIBUTE), true);
  }
}
