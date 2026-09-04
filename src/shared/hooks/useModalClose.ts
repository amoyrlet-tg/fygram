import { useState } from "react";

const CLOSE_ANIMATION_MS = 170;

export function useModalClose(onClose: () => void) {
  const [closing, setClosing] = useState(false);

  const requestClose = () => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(onClose, CLOSE_ANIMATION_MS);
  };

  return { closing, requestClose };
}
