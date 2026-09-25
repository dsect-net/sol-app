import { useEffect } from "react";

export function useViewportHeight({ overlay, closeOverlay, resetRubber }) {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    let frame = 0;
    const sync = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        document.documentElement.style.setProperty(
          "--vv-height",
          `${viewport.height}px`,
        );
        document.documentElement.style.setProperty(
          "--vv-top",
          `${viewport.offsetTop}px`,
        );
        const keyboard = window.innerHeight - viewport.height > 120;
        document.body.classList.toggle("keyboard-open", keyboard);
        if (keyboard && overlay?.type === "drawer") closeOverlay(false);
        resetRubber();
      });
    };
    sync();
    viewport.addEventListener("resize", sync);
    viewport.addEventListener("scroll", sync);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", sync);
      viewport.removeEventListener("scroll", sync);
    };
  }, [overlay, closeOverlay, resetRubber]);
}
