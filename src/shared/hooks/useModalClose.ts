import { useState } from "react";
import { useEco } from "@/app/ecoMode";

const CLOSE_ANIMATION_MS = 170;

export function useModalClose(onClose: () => void) {
  const [closing, setClosing] = useState(false);
  const eco = useEco();

  const requestClose = () => {
    if (closing) return;
    if (eco) {
      onClose();
      return;
    }
    setClosing(true);
    window.setTimeout(onClose, CLOSE_ANIMATION_MS);
  };

  return { closing, requestClose };
}
