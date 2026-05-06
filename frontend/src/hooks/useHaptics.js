import { useCallback } from "react";

export default function useHaptics() {
  const tap = useCallback((duration = 16) => {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(duration);
    }
  }, []);

  return { tap };
}
