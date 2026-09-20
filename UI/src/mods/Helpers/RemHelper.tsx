// The game's root font-size is dynamic (per aspect ratio), so 1rem needs converting to compare against a real pixel measurement.
const getRemInPx = (): number => {
    const raw = getComputedStyle(document.documentElement).fontSize;
    const value = parseFloat(raw);
    if (raw.endsWith('vw')) return (value / 100) * window.innerWidth;
    if (raw.endsWith('vh')) return (value / 100) * window.innerHeight;
    return value;
};
export const pxToRem = (px: number) => px / getRemInPx();
export const remToPx = (rem: number) => rem * getRemInPx();
