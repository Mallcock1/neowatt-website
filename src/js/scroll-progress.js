export function initSectionObserver(sectionSelectors) {
  const sections = sectionSelectors
    .map((selector) => document.querySelector(selector))
    .filter(Boolean);

  const navLinks = new Map();
  document.querySelectorAll('.site-nav a[href^="#"]').forEach((link) => {
    navLinks.set(link.getAttribute("href"), link);
  });

  if (!sections.length || !navLinks.size) {
    return;
  }

  const setActive = (id) => {
    navLinks.forEach((link, hash) => {
      link.classList.toggle("is-active", hash === `#${id}`);
    });
  };

  const observer = new IntersectionObserver(
    (entries) => {
      const sorted = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio);

      if (sorted[0]?.target?.id) {
        setActive(sorted[0].target.id);
      }
    },
    {
      threshold: [0.2, 0.45, 0.7],
      rootMargin: "-20% 0px -45% 0px"
    }
  );

  sections.forEach((section) => observer.observe(section));
}
