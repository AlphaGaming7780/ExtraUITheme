// Copied as-is from ExtraDetailingTools/ExtraLib/Procedural-Content-Generation's own RemHelper -
// the game's root font-size is dynamic (`html{font-size:.0925926vh}` / `html{font-size:.0520833vw}`
// in the game's own index.css, picked per aspect ratio), so 1rem is only ~1px at the 1920x1080
// reference resolution - it scales with actual resolution/UI scale the same way the rest of the
// game's UI does. Anything that needs to compare a CSS size against a real pixel measurement (e.g.
// ResizeObserver's contentRect, which reports actual device pixels, not rem) has to go through this
// conversion instead of assuming a fixed ratio.
const getRemInPx = (): number => {
    const raw = getComputedStyle(document.documentElement).fontSize;
    const value = parseFloat(raw);
    if (raw.endsWith('vw')) return (value / 100) * window.innerWidth;
    if (raw.endsWith('vh')) return (value / 100) * window.innerHeight;
    return value;
};
export const pxToRem = (px: number) => px / getRemInPx();
export const remToPx = (rem: number) => rem * getRemInPx();
