import { useState, useEffect } from "react";

const WATCH_BREAKPOINT = 280;

export function useIsWatch() {
  const [isWatch, setIsWatch] = useState<boolean>(false);

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${WATCH_BREAKPOINT - 1}px)`);
    const onChange = () => setIsWatch(window.innerWidth < WATCH_BREAKPOINT);
    mql.addEventListener("change", onChange);
    setIsWatch(window.innerWidth < WATCH_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isWatch;
}
