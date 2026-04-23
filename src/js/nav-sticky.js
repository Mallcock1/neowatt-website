export function initStickyNav({ heroSelector, navSelector }) {
  const hero = document.querySelector(heroSelector);
  const header = document.querySelector(navSelector);
  if (!hero || !header) {
    return;
  }

  const observer = new IntersectionObserver(
    ([entry]) => {
      const shouldShow = !entry.isIntersecting;
      header.classList.toggle("is-visible", shouldShow);
    },
    {
      rootMargin: "-40% 0px 0px 0px",
      threshold: 0
    }
  );

  observer.observe(hero);
}
