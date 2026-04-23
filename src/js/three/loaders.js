export function detectRenderTier() {
  const isReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isMobile = window.matchMedia("(max-width: 900px)").matches;

  if (isReducedMotion) {
    return "low";
  }

  return isMobile ? "medium" : "high";
}

export function supportsWebGL() {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2");
    return Boolean(gl);
  } catch {
    return false;
  }
}
