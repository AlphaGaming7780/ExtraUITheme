// !important on <body> beats the game's `:root .overwrite-legacy` block and its inline vars on <html> (where inline wins even over !important in Gameface).

// Separate sheets for the committed theme, live edits and Identify, so a drag only rewrites the small ones.
const kThemeStyleId = "eut-theme-overrides";
const kPreviewStyleId = "eut-theme-preview";
// Identify layer (identify.ts), above everything else.
const kIdentifyStyleId = "eut-theme-identify";

// Live edits are written at most this often: each rewrite restyles the whole UI.
const kPreviewIntervalMs = 50;

let committed: Record<string, string> = {};
// Live edits, layered over the committed theme until SetOverride's round-trip replaces them.
const preview = new Map<string, string>();
let themeElement: HTMLStyleElement | null = null;
let previewElement: HTMLStyleElement | null = null;
let identifyElement: HTMLStyleElement | null = null;

// Keeps the three sheets last in <head>, in this order.
const keepLast = () => {
    const head = document.head;
    if (!themeElement || !previewElement || !identifyElement) return;
    if (
        head.lastElementChild === identifyElement
        && identifyElement.previousElementSibling === previewElement
        && previewElement.previousElementSibling === themeElement
    ) return;
    head.appendChild(themeElement);
    head.appendChild(previewElement);
    head.appendChild(identifyElement);
};

const createStyle = (id: string) => {
    const element = document.createElement("style");
    element.id = id;
    return element;
};

const ensureStyleElements = () => {
    if (!themeElement || !previewElement || !identifyElement) {
        themeElement = createStyle(kThemeStyleId);
        previewElement = createStyle(kPreviewStyleId);
        identifyElement = createStyle(kIdentifyStyleId);
        if (typeof MutationObserver !== "undefined") {
            new MutationObserver(keepLast).observe(document.head, { childList: true });
        }
    }
    keepLast();
    return { theme: themeElement!, preview: previewElement!, identify: identifyElement! };
};

const sheetText = (entries: Iterable<[string, string]>) => {
    let body = "";
    for (const [name, value] of entries) body += `${name}: ${value} !important; `;
    return body.length > 0 ? `:root, body { ${body}}` : "";
};

// Unchanged text is not rewritten.
const write = (element: HTMLStyleElement, text: string) => {
    if (element.textContent !== text) element.textContent = text;
};

let previewTimer: number | null = null;
let lastPreviewWrite = 0;

const flushPreview = () => {
    if (previewTimer !== null) {
        clearTimeout(previewTimer);
        previewTimer = null;
    }
    lastPreviewWrite = Date.now();
    write(ensureStyleElements().preview, sheetText(preview));
};

// Throttled: leading write, then at most one per interval, last value always written.
const schedulePreview = () => {
    if (previewTimer !== null) return;
    const wait = kPreviewIntervalMs - (Date.now() - lastPreviewWrite);
    if (wait <= 0) flushPreview();
    else previewTimer = window.setTimeout(flushPreview, wait);
};

// Replaces the committed overrides and drops pending previews.
export const setThemeOverrides = (overrides: Record<string, string>) => {
    committed = { ...overrides };
    preview.clear();
    write(ensureStyleElements().theme, sheetText(Object.entries(committed)));
    flushPreview();
};

export const setPreviewOverride = (name: string, value: string) => {
    preview.set(name, value);
    schedulePreview();
};

// Several live edits at once (a whole palette group).
export const setPreviewOverrides = (values: Record<string, string>) => {
    for (const [name, value] of Object.entries(values)) preview.set(name, value);
    schedulePreview();
};

// Reverts a live edit to the committed value or the game default, immediately.
export const clearPreviewOverride = (name: string) => {
    if (preview.delete(name)) flushPreview();
};

export const clearPreviewOverrides = (names: string[]) => {
    let changed = false;
    for (const name of names) changed = preview.delete(name) || changed;
    if (changed) flushPreview();
};

// Identify's layer: `names` all set to `color`, or nothing.
export const setIdentifyOverride = (names: string[], color: string | null) => {
    write(ensureStyleElements().identify, color === null ? "" : sheetText(names.map((name) => [name, color] as [string, string])));
};
