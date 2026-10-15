// Simple mode palette: groups :root colors around principal colors (OKLCH) and re-derives members from them.
import { CssColorDeclaration, CssDeclaration, CssDeclarationKind, CssVarReferenceDeclaration } from "../ThemeExtraPanel/DeclarationRow/CssDeclarationTypes";
import { PaletteEntry } from "../ThemeExtraPanel/ThemeTypes";

// The game's modern-UI block, redefining ~80 :root variables.
export const OVERWRITE_LEGACY_SELECTOR = ":root .overwrite-legacy";

// One declaration per variable with the game default in effect (`:root .overwrite-legacy` wins in the modern UI).
export function effectiveDefaults(declarations: CssDeclaration[], legacy: boolean): CssDeclaration[] {
    const byName = new Map<string, CssDeclaration>();
    for (const d of declarations) if (d.selector === ":root") byName.set(d.name, d);
    if (!legacy) {
        for (const d of declarations) if (d.selector === OVERWRITE_LEGACY_SELECTOR) byName.set(d.name, d);
    }
    return [...byName.values()];
}

export const PALETTE_DEFAULTS = {
    hueThreshold: 25, // degrees: vivid colors closer than this share a principal
    lightnessThreshold: 0.12, // OKLCH L: same for neutrals
    neutralChroma: 0.035, // below this OKLCH chroma a color is a neutral (gray)
    // Dark colors show their tint at a lower chroma (#141b22 reads as dark blue, not gray).
    darkNeutralChroma: 0.012,
    darkLightness: 0.5, // OKLCH L below which darkNeutralChroma applies
    // Between neutral and vivid: tinted grays, grouped more by lightness than by hue.
    mutedChroma: 0.065,
    mutedHueThreshold: 40,
    mutedLightnessThreshold: 0.2,
    // Colors with their own meaning (states, money...), grouped apart. Case-sensitive ("Red" not "hoveRED").
    semantic: /[Pp]ositive|[Nn]egative|[Ww]arning|[Ee]rror|[Ss]uccess|[Dd]anger|Red|Green|Yellow|Orange|income|expense|surplus|deficit|loan|ButtonYes|ButtonNo|^--(un)?lockedColor$/,
};
export type PaletteOptions = typeof PALETTE_DEFAULTS;

export type Rgb = [number, number, number];
export interface Oklch { L: number; C: number; h: number }
// A literal alpha, or "var(--x)" when the game ties it to another variable (rgba(42, 55, 83, var(--panelOpacityNormal))).
export type Alpha = number | string;

export type PaletteKind = "chromatic" | "muted" | "neutral" | "semantic";

export interface PaletteOffset {
    dL: number;
    dC: number;
    // Chroma as a ratio of the principal's, null when the principal is too gray for a ratio to mean anything.
    cRatio: number | null;
    dH: number;
}

export interface PaletteColor {
    name: string;
    rgb: Rgb;
    alpha: Alpha;
    lch: Oklch;
    // 1 + reads through var(), aliases included; the most used member becomes the principal.
    weight: number;
    // var(--this) aliases: they follow on their own and are never written.
    aliases: string[];
    kind: PaletteKind;
    offset: PaletteOffset;
}

export type PaletteHue = "Pink" | "Red" | "Orange" | "Yellow" | "Lime" | "Green" | "Cyan" | "Blue" | "Indigo" | "Violet";
export type PaletteGray = "White" | "VeryLightGray" | "LightGray" | "Gray" | "DarkGray" | "Black";

// Language-neutral description of a principal color - the panel turns it into a translated name.
export type PaletteLabel =
    | { gray: PaletteGray }
    | { hue: PaletteHue; muted: boolean; tone: "dark" | "light" | null };

export interface PaletteGroup {
    kind: PaletteKind;
    principal: PaletteColor;
    members: PaletteColor[];
    weight: number;
    // Variable families ("accentColor", "menuText"...) by weight, most used first.
    families: string[];
    label: PaletteLabel;
    // Mostly state colors (disabled, hover...), ranked last.
    statesOnly: boolean;
}

export interface PaletteAnalysis {
    groups: PaletteGroup[];
    colorCount: number;
    aliasCount: number;
}

// Interaction variants ("--x-hover") and gradient stops ("--xEnd") follow their base variable.
const VARIANT = /^(--.+?)-(hover|pressed|active|focused|disabled)$/;
const STATE = /Disabled|Locked|-(hover|pressed|active|focused|disabled)$/;
const GRADIENT_STOP = /^(--.+?)(End|Middle)$/;
const baseOf = (name: string) => name.match(VARIANT)?.[1] ?? name.replace(GRADIENT_STOP, "$1Start");

// --- Color conversion ---

const toLinear = (c: number) => ((c /= 255) <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const fromLinear = (c: number) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

export function rgbToOklch(rgb: Rgb): Oklch {
    const [r, g, b] = rgb.map(toLinear);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
    const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
    const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
    return { L, C: Math.hypot(A, B), h: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360 };
}

export function oklchToRgb({ L, C, h }: Oklch): Rgb {
    const A = C * Math.cos((h * Math.PI) / 180);
    const B = C * Math.sin((h * Math.PI) / 180);
    const l = Math.pow(L + 0.3963377774 * A + 0.2158037573 * B, 3);
    const m = Math.pow(L - 0.1055613458 * A - 0.0638541728 * B, 3);
    const s = Math.pow(L - 0.0894841775 * A - 1.291485548 * B, 3);
    return [
        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ].map((c) => Math.round(Math.min(255, Math.max(0, fromLinear(c))))) as Rgb;
}

// Signed, -180..180.
export const hueDiff = (a: number, b: number) => ((b - a + 540) % 360) - 180;
export const toHex = (rgb: Rgb) => "#" + rgb.map((c) => c.toString(16).padStart(2, "0")).join("");
export const toCss = (rgb: Rgb, alpha: Alpha) => (alpha === 1 ? toHex(rgb) : `rgba(${rgb.join(", ")}, ${alpha})`);

// C# hands colors over as 0..1 channels; back to the 0..255 integers the CSS was written with.
function colorOf(d: CssColorDeclaration): { rgb: Rgb; alpha: Alpha } {
    const rgb = [d.r, d.g, d.b].map((c) => Math.round(c * 255)) as Rgb;
    const alpha = d.alphaVarRef ? `var(${d.alphaVarRef})` : Math.round(d.a * 1000) / 1000;
    return { rgb, alpha };
}

// "--accentColorNormal-hover" -> "accentColor", "--menuText1Normal" -> "menuText"
export function familyName(name: string): string {
    let n = name.replace(/^--/, "").replace(/-.*$/, "");
    let prev;
    do {
        prev = n;
        n = n.replace(/(Normal|Dark|Darker|Light|Lighter|Lightest|Dim|Dimmer|Dimmest|Inverted|Disabled|Hover|Pressed|Active|Focused|Start|End|\d+)$/, "");
    } while (n !== prev && n);
    return n || name.replace(/^--/, "");
}

const HUES: [number, PaletteHue][] = [[20, "Pink"], [45, "Red"], [75, "Orange"], [105, "Yellow"], [140, "Lime"], [175, "Green"], [215, "Cyan"], [250, "Blue"], [285, "Indigo"], [330, "Violet"], [360, "Pink"]];

function describe({ L, h }: Oklch, kind: PaletteKind): PaletteLabel {
    if (kind === "neutral") {
        return { gray: L > 0.93 ? "White" : L > 0.8 ? "VeryLightGray" : L > 0.62 ? "LightGray" : L > 0.45 ? "Gray" : L > 0.12 ? "DarkGray" : "Black" };
    }
    const hue = HUES.find(([max]) => h < max)![1];
    return { hue, muted: kind === "muted", tone: L < 0.4 ? "dark" : L > 0.8 ? "light" : null };
}

// --- Grouping ---

// `defaults`: the game values (effectiveDefaults), never the theme's. `usages`: the CssVarUsages binding.
export function analyzePalette(defaults: CssDeclaration[], usages: Record<string, number>, options: Partial<PaletteOptions> = {}): PaletteAnalysis {
    const opt = { ...PALETTE_DEFAULTS, ...options };
    const usageOf = (name: string) => usages[name] ?? 0;

    // Aliases (--a: var(--b)) follow their target, which inherits their usages.
    const aliasOf = new Map<string, string>();
    for (const d of defaults) {
        if (d.kind === CssDeclarationKind.VarReference) aliasOf.set(d.name, (d as CssVarReferenceDeclaration).referencedVariable);
    }
    const resolve = (n: string, seen = new Set<string>()): string => {
        const target = aliasOf.get(n);
        return target !== undefined && !seen.has(n) ? resolve(target, seen.add(n)) : n;
    };

    const colors = new Map<string, PaletteColor>();
    for (const d of defaults) {
        if (d.kind !== CssDeclarationKind.Color) continue;
        const { rgb, alpha } = colorOf(d as CssColorDeclaration);
        // Skips "transparent": nothing to recolor.
        if (alpha === 0) continue;
        const lch = rgbToOklch(rgb);
        const kind: PaletteKind =
            lch.C < (lch.L < opt.darkLightness ? opt.darkNeutralChroma : opt.neutralChroma) ? "neutral"
                : opt.semantic.test(d.name) ? "semantic"
                    : lch.C < opt.mutedChroma ? "muted"
                        : "chromatic";
        colors.set(d.name, { name: d.name, rgb, alpha, lch, weight: 1 + usageOf(d.name), aliases: [], kind, offset: { dL: 0, dC: 0, cRatio: null, dH: 0 } });
    }
    for (const alias of aliasOf.keys()) {
        const target = colors.get(resolve(alias));
        if (!target) continue;
        target.aliases.push(alias);
        target.weight += usageOf(alias);
    }

    const dh = (a: PaletteColor, b: PaletteColor) => Math.abs(hueDiff(a.lch.h, b.lch.h));
    const dl = (a: PaletteColor, b: PaletteColor) => Math.abs(a.lch.L - b.lch.L);
    const close = (a: PaletteColor, b: PaletteColor) =>
        a.kind === "chromatic" ? dh(a, b) <= opt.hueThreshold
            : a.kind === "muted" ? dh(a, b) <= opt.mutedHueThreshold && dl(a, b) <= opt.mutedLightnessThreshold
                : a.kind === "neutral" ? dl(a, b) <= opt.lightnessThreshold
                    // semantic: by hue, but tighter so red/orange/yellow/green stay apart
                    : dh(a, b) <= Math.min(opt.hueThreshold, 14);

    // Greedy, most used first; each color joins the closest principal of its kind (stable sort: deterministic).
    const sorted = [...colors.values()].sort((a, b) => b.weight - a.weight);
    const groups: PaletteGroup[] = [];
    const variants: [PaletteColor, string][] = [];
    for (const c of sorted) {
        const base = baseOf(c.name);
        if (base !== c.name && colors.has(base)) {
            variants.push([c, base]);
            continue;
        }
        let best: PaletteGroup | null = null;
        let bestScore = Infinity;
        for (const g of groups) {
            if (g.kind !== c.kind || !close(g.principal, c)) continue;
            const score = Math.abs(hueDiff(g.principal.lch.h, c.lch.h)) / 180 + Math.abs(g.principal.lch.L - c.lch.L);
            if (score < bestScore) {
                best = g;
                bestScore = score;
            }
        }
        if (best) best.members.push(c);
        else groups.push({ kind: c.kind, principal: c, members: [c], weight: 0, families: [], label: { gray: "Gray" }, statesOnly: false });
    }

    // Variants join their base's group, resolved through chains of variants.
    const groupOf = new Map<string, PaletteGroup>();
    for (const g of groups) for (const m of g.members) groupOf.set(m.name, g);
    let pending = variants;
    while (pending.length > 0) {
        const next: [PaletteColor, string][] = [];
        for (const [c, base] of pending) {
            const g = groupOf.get(base);
            if (g) {
                g.members.push(c);
                groupOf.set(c.name, g);
            } else next.push([c, base]);
        }
        if (next.length === pending.length) break;
        pending = next;
    }

    for (const g of groups) {
        const p = g.principal.lch;
        g.weight = g.members.reduce((s, m) => s + m.weight, 0);
        const fam = new Map<string, number>();
        for (const m of g.members) fam.set(familyName(m.name), (fam.get(familyName(m.name)) ?? 0) + m.weight);
        g.families = [...fam.entries()].sort((a, b) => b[1] - a[1]).map(([f]) => f);
        g.label = describe(p, g.kind);
        g.statesOnly = g.members.filter((m) => STATE.test(m.name)).length / g.members.length >= 0.6;
        // Offset of every member from the principal (alpha stays the member's own).
        for (const m of g.members) {
            m.offset = { dL: m.lch.L - p.L, dC: m.lch.C - p.C, cRatio: p.C > 0.02 ? m.lch.C / p.C : null, dH: hueDiff(p.h, m.lch.h) };
        }
    }
    const order: Record<PaletteKind, number> = { chromatic: 0, muted: 1, neutral: 2, semantic: 3 };
    groups.sort((a, b) => order[a.kind] - order[b.kind] || b.weight - a.weight);
    return { groups, colorCount: colors.size, aliasCount: aliasOf.size };
}

// --- Derivation ---

// New rgb of a member when its group's principal becomes `newRgb`.
export function deriveRgb(member: PaletteColor, principal: PaletteColor, newRgb: Rgb): Rgb {
    if (member === principal) return newRgb;
    const np = rgbToOklch(newRgb);
    const o = member.offset;
    // Gray new color: members keep their own hue and their tint fades with the new chroma.
    const grayTarget = np.C < 0.02;
    const C = o.cRatio !== null && !grayTarget ? np.C * o.cRatio : Math.max(0, np.C + o.dC * Math.min(1, np.C / 0.02));
    // A gray principal has no meaningful hue: members take the new hue as is.
    const h = grayTarget ? member.lch.h : principal.lch.C > 0.02 ? np.h + o.dH : np.h;
    const L = Math.min(1, Math.max(0, np.L + o.dL));
    return oklchToRgb({ L, C, h: (h + 360) % 360 });
}

// { "--name": "css value" } for every member of a group whose principal becomes `newRgb` - aliases excluded, they follow on their own.
export function deriveGroup(group: PaletteGroup, newRgb: Rgb): Record<string, string> {
    const out: Record<string, string> = {};
    for (const m of group.members) out[m.name] = toCss(deriveRgb(m, group.principal, newRgb), m.alpha);
    return out;
}

// --- Group identity ---
// Saved entries find their group again by anchors (member names), then by the principal's color (From).

const MAX_ANCHORS = 3;
// OKLab distance under which a principal is still the same color (closest current pair: 0.061).
export const FROM_MATCH_DISTANCE = 0.035;

// Principal first, then the most used members that are neither states nor variants.
export function groupAnchors(group: PaletteGroup): string[] {
    const others = group.members
        .filter((m) => m !== group.principal && !STATE.test(m.name) && baseOf(m.name) === m.name)
        .sort((a, b) => b.weight - a.weight);
    return [group.principal, ...others].slice(0, MAX_ANCHORS).map((m) => m.name);
}

export const toRgbString = (rgb: Rgb) => `rgb(${rgb.join(",")})`;

// Parses an entry color ("rgb(r,g,b)", hex or rgba), alpha ignored.
export function parseRgb(value: string): Rgb | null {
    const v = value.trim();
    const hex = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})(?:[0-9a-f]{2})?$/i);
    if (hex) {
        const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join("") : hex[1];
        return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
    }
    const rgb = v.match(/^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*(?:,[^)]*)?\)$/i);
    return rgb ? ([rgb[1], rgb[2], rgb[3]].map((c) => Math.min(255, Math.round(Number(c)))) as Rgb) : null;
}

// Euclidean distance in OKLab (deltaE OK).
export function oklabDistance(a: Oklch, b: Oklch): number {
    const ax = a.C * Math.cos((a.h * Math.PI) / 180), ay = a.C * Math.sin((a.h * Math.PI) / 180);
    const bx = b.C * Math.cos((b.h * Math.PI) / 180), by = b.C * Math.sin((b.h * Math.PI) / 180);
    return Math.hypot(a.L - b.L, ax - bx, ay - by);
}

// What SetPaletteColor saves when the user gives `group`'s principal the color `to`.
export function paletteEntry(group: PaletteGroup, to: Rgb): PaletteEntry {
    return { From: toRgbString(group.principal.rgb), Anchors: groupAnchors(group), To: toRgbString(to), FollowAccentHue: false };
}

export interface PaletteMatch {
    entry: PaletteEntry;
    group: PaletteGroup;
    by: "anchors" | "from";
}

export interface PaletteMatching {
    matches: PaletteMatch[];
    // Matched to no current group: kept in the theme, flagged in the UI, never applied.
    orphans: PaletteEntry[];
    byGroup: Map<PaletteGroup, PaletteMatch>;
}

// Pairs entries and groups one-to-one: anchor matches beat From matches, more anchors found wins.
export function matchPalette(groups: PaletteGroup[], entries: PaletteEntry[], maxFromDistance = FROM_MATCH_DISTANCE): PaletteMatching {
    const candidates: { entry: number; group: number; by: "anchors" | "from"; score: number }[] = [];
    const namesOf = groups.map((g) => new Set(g.members.flatMap((m) => [m.name, ...m.aliases])));
    entries.forEach((entry, e) => {
        const anchors = entry.Anchors ?? [];
        const from = entry.From ? parseRgb(entry.From) : null;
        const fromLch = from && rgbToOklch(from);
        groups.forEach((g, i) => {
            const hits = anchors.filter((a) => namesOf[i].has(a)).length;
            if (hits > 0) candidates.push({ entry: e, group: i, by: "anchors", score: -(hits * 2 + (namesOf[i].has(anchors[0]) ? 1 : 0)) });
            if (fromLch) {
                const distance = oklabDistance(fromLch, g.principal.lch);
                if (distance <= maxFromDistance) candidates.push({ entry: e, group: i, by: "from", score: distance });
            }
        });
    });
    const rank = { anchors: 0, from: 1 };
    candidates.sort((a, b) => rank[a.by] - rank[b.by] || a.score - b.score || a.entry - b.entry || a.group - b.group);

    const takenEntries = new Set<number>();
    const byGroup = new Map<PaletteGroup, PaletteMatch>();
    const byEntry = new Map<number, PaletteMatch>();
    for (const c of candidates) {
        const group = groups[c.group];
        if (takenEntries.has(c.entry) || byGroup.has(group)) continue;
        const match: PaletteMatch = { entry: entries[c.entry], group, by: c.by };
        takenEntries.add(c.entry);
        byGroup.set(group, match);
        byEntry.set(c.entry, match);
    }
    return {
        matches: entries.flatMap((_, e) => byEntry.get(e) ?? []),
        orphans: entries.filter((_, e) => !takenEntries.has(e)),
        byGroup,
    };
}

// --- Re-derivation (sync) ---

// Always computed against the modern UI's defaults, so a theme never depends on the legacy-interface option.
export const PALETTE_REFERENCE_LEGACY = false;

// The game's groups as Simple mode and the sync see them. Null until both bindings have arrived.
export function analyzeGamePalette(declarations: CssDeclaration[] | null | undefined, usages: Record<string, number> | null | undefined): PaletteGroup[] | null {
    if (!declarations || declarations.length === 0 || !usages) return null;
    return analyzePalette(effectiveDefaults(declarations, PALETTE_REFERENCE_LEGACY), usages).groups;
}

// PaletteCommand's SyncPalette payload (PascalCase, read by C#).
export interface PaletteSync {
    Palette: PaletteEntry[];
    Values: Record<string, string>;
    Names: string[];
}

export interface PaletteTheme {
    overrides: Record<string, string>;
    manual: string[];
    palette: PaletteEntry[];
}

const sameEntry = (a: PaletteEntry, b: PaletteEntry) =>
    a.From === b.From && a.To === b.To && a.FollowAccentHue === b.FollowAccentHue && (a.Anchors ?? []).join(",") === (b.Anchors ?? []).join(",");

// The theme's palette re-derived against the current game CSS (Manual variables untouched), or null when unchanged.
export function planPaletteSync(theme: PaletteTheme, groups: PaletteGroup[]): PaletteSync | null {
    const palette = theme.palette ?? [];
    if (palette.length === 0) return null;
    const manual = new Set(theme.manual ?? []);
    const overrides = theme.overrides ?? {};

    const usable = palette.filter((e) => e.To && parseRgb(e.To));
    const { byGroup } = matchPalette(groups, usable);
    const refreshed = new Map<PaletteEntry, PaletteEntry>();
    const values: Record<string, string> = {};
    for (const [group, match] of byGroup) {
        refreshed.set(match.entry, { From: toRgbString(group.principal.rgb), Anchors: groupAnchors(group), To: match.entry.To, FollowAccentHue: false });
        for (const [name, value] of Object.entries(deriveGroup(group, parseRgb(match.entry.To)!))) {
            if (!manual.has(name)) values[name] = value;
        }
    }

    const newPalette = palette.map((e) => refreshed.get(e) ?? e);
    const names = Object.keys(overrides).filter((n) => !manual.has(n) && !(n in values));
    const changed = names.length > 0
        || newPalette.some((e, i) => !sameEntry(e, palette[i]))
        || Object.entries(values).some(([n, v]) => overrides[n] !== v);
    return changed ? { Palette: newPalette, Values: values, Names: names } : null;
}
