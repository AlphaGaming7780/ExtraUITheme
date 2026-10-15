// !important on <body> beats the game's `:root .overwrite-legacy` block and its inline vars on <html> (where inline wins even over !important in Gameface).

const kStyleId = "eut-theme-overrides";

let committed: Record<string, string> = {};
// Live edits, layered over the committed theme until SetOverride's round-trip replaces them.
const preview = new Map<string, string>();
let styleElement: HTMLStyleElement | null = null;

const keepLast = () => {
    const head = document.head;
    if (styleElement && head.lastElementChild !== styleElement) head.appendChild(styleElement);
};

const ensureStyleElement = (): HTMLStyleElement => {
    if (!styleElement) {
        styleElement = document.createElement("style");
        styleElement.id = kStyleId;
        // Stay last in <head> when another stylesheet gets appended after us.
        if (typeof MutationObserver !== "undefined") {
            new MutationObserver(keepLast).observe(document.head, { childList: true });
        }
    }
    keepLast();
    return styleElement;
};

const render = () => {
    const merged = { ...committed };
    preview.forEach((value, name) => { merged[name] = value; });
    const body = Object.entries(merged).map(([name, value]) => `${name}: ${value} !important;`).join(" ");
    ensureStyleElement().textContent = body.length > 0 ? `:root, body { ${body} }` : "";
};

// Replaces the committed overrides and drops pending previews.
export const setThemeOverrides = (overrides: Record<string, string>) => {
    committed = { ...overrides };
    preview.clear();
    render();
};

export const setPreviewOverride = (name: string, value: string) => {
    preview.set(name, value);
    render();
};

// Reverts a live edit to the committed value, or the game default.
export const clearPreviewOverride = (name: string) => {
    if (preview.delete(name)) render();
};
