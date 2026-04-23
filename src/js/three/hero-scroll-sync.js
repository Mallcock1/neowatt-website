export function createHeroScrollSync(heroSelector, controller) {
  const hero = document.querySelector(heroSelector);
  if (!hero || !controller) {
    return;
  }

  const computeProgress = () => {
    const rect = hero.getBoundingClientRect();
    const total = Math.max(window.innerHeight * 1.15, 1);
    const traveled = Math.max(0, -rect.top);
    return Math.min(traveled / total, 1);
  };

  let rafId = 0;

  const onScroll = () => {
    if (rafId) {
      return;
    }

    rafId = window.requestAnimationFrame(() => {
      controller.setProgress(computeProgress());
      rafId = 0;
    });
  };

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  onScroll();

  return () => {
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onScroll);
    if (rafId) {
      window.cancelAnimationFrame(rafId);
    }
  };
}
