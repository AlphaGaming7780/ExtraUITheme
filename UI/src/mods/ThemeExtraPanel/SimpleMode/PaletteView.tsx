import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { trigger } from "cs2/api";
import { useLocalization } from "cs2/l10n";
import { Color } from "cs2/bindings";
import { Tooltip } from "cs2/ui";
import { TintedIcon } from "../../../../game-ui/common/image/tinted-icon";
import { PaletteEntry, Theme } from "../ThemeTypes";
import { matchesSearch } from "../../Helpers/search";
import { remToPx } from "../../Helpers/RemHelper";
import { clearPreviewOverrides, setPreviewOverrides } from "../../Helpers/themeStyleSheet";
import { ALPHA_PATTERN, LazyColorField } from "../LazyColorField";
import { startIdentify, stopIdentify } from "../../Helpers/identify";
import {
    deriveGroup,
    matchPalette,
    PaletteGroup,
    PaletteLabel,
    PaletteMatch,
    paletteEntry,
    parseRgb,
    Rgb,
    toCss,
    toHex,
} from "../../Helpers/palette";
import styles from "./PaletteView.module.scss";

// Simple mode: one card per palette group; Manual variables keep their value.

type Translate = (key: string, fallback?: string | null) => string | null;

// "Dark grayish blue": the hue wrapped in the muted and tone templates, so each language picks its word order.
export function paletteLabelText(label: PaletteLabel, translate: Translate): string {
    if ("gray" in label) return translate(`ExtraUITheme.Palette.Gray[${label.gray}]`, label.gray) ?? label.gray;
    let name = translate(`ExtraUITheme.Palette.Hue[${label.hue}]`, label.hue) ?? label.hue;
    if (label.muted) name = (translate("ExtraUITheme.Palette.Muted", "Grayish {color}") ?? "{color}").replace("{color}", name);
    if (label.tone) name = (translate(`ExtraUITheme.Palette.Tone[${label.tone}]`, `{color} (${label.tone})`) ?? "{color}").replace("{color}", name);
    return name;
}

// Display order; state-heavy groups last whatever their kind.
type SectionKey = "Vivid" | "Muted" | "Neutral" | "Semantic" | "StatesOnly";
const SECTIONS: { key: SectionKey; test: (g: PaletteGroup) => boolean }[] = [
    { key: "Vivid", test: (g) => !g.statesOnly && g.kind === "chromatic" },
    { key: "Muted", test: (g) => !g.statesOnly && g.kind === "muted" },
    { key: "Neutral", test: (g) => !g.statesOnly && g.kind === "neutral" },
    { key: "Semantic", test: (g) => !g.statesOnly && g.kind === "semantic" },
    { key: "StatesOnly", test: (g) => g.statesOnly },
];

const toColor = (rgb: Rgb): Color => ({ r: rgb[0] / 255, g: rgb[1] / 255, b: rgb[2] / 255, a: 1 });
const fromColor = (c: Color): Rgb => [c.r, c.g, c.b].map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255)) as Rgb;
const sameRgb = (a: Rgb, b: Rgb) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

// Group values minus the Manual ones.
function derivedValues(group: PaletteGroup, rgb: Rgb, manual: Set<string>): Record<string, string> {
    const values = deriveGroup(group, rgb);
    for (const name of Object.keys(values)) if (manual.has(name)) delete values[name];
    return values;
}

// Exact-name filter, so "--x" doesn't also list "--x-hover".
export const exactNameSearch = (name: string) => `regex:^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`;

interface CardProps {
    group: PaletteGroup;
    match: PaletteMatch | undefined;
    manual: Set<string>;
    overrides: Record<string, string>;
    expanded: boolean;
    onToggle: (key: string) => void;
    onShowInAdvanced: (name: string) => void;
}

// The wrapper stops the click: a disabled button would let it reach the card head.
const IconButton = ({ icon, tooltip, onClick, disabled }: { icon: string; tooltip: string; onClick: () => void; disabled?: boolean }) => (
    <div className={styles.iconButtonBox} onClick={(e) => e.stopPropagation()}>
        <Tooltip tooltip={tooltip}>
            <button className={styles.iconButton} disabled={disabled} onClick={onClick}>
                <TintedIcon className={styles.iconButtonIcon} src={icon} />
            </button>
        </Tooltip>
    </div>
);

// Checkered under the color, so translucent variables show as such.
const Swatch = ({ color }: { color: string }) => (
    <div className={styles.memberSwatch} style={ALPHA_PATTERN}>
        <div className={styles.memberSwatchColor} style={{ backgroundColor: color }} />
    </div>
);

const GroupCard = memo(({ group, match, manual, overrides, expanded, onToggle, onShowInAdvanced }: CardProps) => {
    const { translate } = useLocalization();
    const key = group.principal.name;
    // Principal's current color: palette entry, else a hand edit, else the game's.
    const principalOverride = overrides[key];
    const savedRgb = (match && parseRgb(match.entry.To)) || (principalOverride !== undefined && parseRgb(principalOverride)) || group.principal.rgb;

    // Previewed live while dragging, sent to C# once on close.
    const [color, setColor] = useState<Color>(toColor(savedRgb));
    const dirtyRef = useRef(false);
    useEffect(() => {
        if (!dirtyRef.current) setColor(toColor(savedRgb));
    }, [savedRgb[0], savedRgb[1], savedRgb[2]]);

    const onChange = (value: Color) => {
        dirtyRef.current = true;
        setColor(value);
        setPreviewOverrides(derivedValues(group, fromColor(value), manual));
    };

    const onClosePicker = () => {
        if (!dirtyRef.current) return;
        dirtyRef.current = false;
        const rgb = fromColor(color);
        // Back to the saved color: only drop the previews.
        if (sameRgb(rgb, savedRgb)) {
            clearPreviewOverrides(group.members.map((m) => m.name));
            return;
        }
        trigger("EUT", "SetPaletteColor", { Entry: paletteEntry(group, rgb), Values: derivedValues(group, rgb, manual) });
    };

    // Drops the entry and reverts the group (C# keeps Manual variables).
    const onReset = () => {
        if (!match) return;
        trigger("EUT", "ResetPaletteColor", { Entry: match.entry, Names: group.members.map((m) => m.name) });
    };

    // Values derived from the current color, used to reattach a Manual variable.
    const derived = useMemo(() => (match ? deriveGroup(group, savedRgb) : null), [group, match, savedRgb[0], savedRgb[1], savedRgb[2]]);
    const currentValue = (name: string, rgb: Rgb, alpha: number | string) => overrides[name] ?? toCss(rgb, alpha);
    const stripColors = useMemo(() => group.members.map((m) => currentValue(m.name, m.rgb, m.alpha)), [group, overrides]);
    const manualCount = group.members.filter((m) => manual.has(m.name)).length;

    // Identify: the card flashes its group, a member row only that variable.
    const memberNames = useMemo(() => group.members.map((m) => m.name), [group]);
    const identifyGroup = () => startIdentify(memberNames);

    const families = group.families.slice(0, 3).join(", ");
    const countText = (translate("ExtraUITheme.Palette.MemberCount", "{count} variable(s)") ?? "").replace("{count}", String(group.members.length));
    const manualText = (translate("ExtraUITheme.Palette.ManualCount", "{count} edited by hand") ?? "").replace("{count}", String(manualCount));
    const resetLabel = translate("ExtraUITheme.Palette.Reset", "Back to the game color") ?? "";
    const reattachLabel = translate("ExtraUITheme.Palette.Reattach", "Edited by hand - click to make it follow the palette again") ?? "";
    const advancedLabel = translate("ExtraUITheme.Palette.ShowInAdvanced", "Show in Advanced mode") ?? "";

    return (
        <div className={match ? `${styles.card} ${styles.changed}` : styles.card} onMouseEnter={identifyGroup} onMouseLeave={stopIdentify}>
            <div className={styles.head} onClick={() => onToggle(key)}>
                <LazyColorField value={color} onChange={onChange} onClosePicker={onClosePicker} />
                <div className={styles.label}>
                    <span className={styles.name}>{paletteLabelText(group.label, translate)}</span>
                    <span className={styles.sub}>{families}</span>
                    <div className={styles.meta}>
                        <span>{countText}</span>
                        {manualCount > 0 && <span className={styles.manualMeta}>{manualText}</span>}
                    </div>
                </div>
                <IconButton icon="Media/Glyphs/ArrowCircular.svg" tooltip={resetLabel} onClick={onReset} disabled={!match} />
                <TintedIcon className={styles.toggle} src={expanded ? "Media/Glyphs/ThickStrokeArrowDown.svg" : "Media/Glyphs/ThickStrokeArrowRight.svg"} />
            </div>
            <div className={styles.strip}>
                {stripColors.map((c, i) => <div key={i} className={styles.stripCell} style={{ backgroundColor: c }} />)}
            </div>
            {expanded && (
                <div className={styles.members}>
                    {group.members.map((m) => (
                        <div
                            key={m.name}
                            className={m === group.principal ? `${styles.member} ${styles.principal}` : styles.member}
                            onMouseEnter={() => startIdentify([m.name])}
                            onMouseLeave={identifyGroup}
                        >
                            <Swatch color={currentValue(m.name, m.rgb, m.alpha)} />
                            <div className={styles.memberName}>
                                <span>{m.name}</span>
                                {m.aliases.length > 0 && <span className={styles.alias}>{"<- " + m.aliases.join(", ")}</span>}
                            </div>
                            {manual.has(m.name) && (
                                <IconButton
                                    icon="Media/Glyphs/Lock.svg"
                                    tooltip={reattachLabel}
                                    onClick={() => trigger("EUT", "ReattachVariable", m.name, derived?.[m.name] ?? null)}
                                />
                            )}
                            <IconButton icon="Media/Glyphs/ArrowRight.svg" tooltip={advancedLabel} onClick={() => onShowInAdvanced(m.name)} />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
});

// Saved colors matching no current group: kept in the theme, not applied.
const OrphansBlock = ({ orphans }: { orphans: PaletteEntry[] }) => {
    const { translate } = useLocalization();
    const removeLabel = translate("ExtraUITheme.Palette.OrphanRemove", "Remove from the theme") ?? "";
    const swatch = (value: string) => {
        const rgb = parseRgb(value);
        return <Swatch color={rgb ? toHex(rgb) : "transparent"} />;
    };
    return (
        <div className={styles.orphans}>
            <div className={styles.orphansHead}>
                <TintedIcon className={styles.orphansIcon} src="Media/Glyphs/Warning.svg" />
                <span>{translate("ExtraUITheme.Palette.OrphansDesc", "These theme colors match nothing in the current game, so they aren't applied.")}</span>
            </div>
            {orphans.map((entry, i) => (
                <div key={i} className={styles.member}>
                    {swatch(entry.From)}
                    <span className={styles.arrow}>{"->"}</span>
                    {swatch(entry.To)}
                    <span className={styles.memberName}>{(entry.Anchors ?? []).join(", ")}</span>
                    <IconButton
                        icon="Media/Glyphs/Trash.svg"
                        tooltip={removeLabel}
                        onClick={() => trigger("EUT", "ResetPaletteColor", { Entry: entry, Names: [] })}
                    />
                </div>
            ))}
        </div>
    );
};

export interface PaletteViewProps {
    groups: PaletteGroup[];
    theme: Theme | undefined;
    search: string;
    onShowInAdvanced: (name: string) => void;
}

const COLUMN_MIN_WIDTH_REM = 250;
const COLUMN_GAP_REM = 12;

// Card columns fitting in `ref`'s width; re-renders only when the count changes.
function useColumnCount(ref: React.RefObject<HTMLDivElement>): number {
    const [count, setCount] = useState(1);
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        let rafId: number | null = null;
        const update = () => {
            rafId = null;
            const width = el.getBoundingClientRect().width;
            if (width <= 0) return;
            const min = remToPx(COLUMN_MIN_WIDTH_REM), gap = remToPx(COLUMN_GAP_REM);
            setCount(Math.max(1, Math.floor((width + gap) / (min + gap))));
        };
        update();
        const observer = new ResizeObserver(() => { if (rafId === null) rafId = requestAnimationFrame(update); });
        observer.observe(el);
        return () => {
            observer.disconnect();
            if (rafId !== null) cancelAnimationFrame(rafId);
        };
    }, []);
    return count;
}

// memo: unaffected by the panel's drag and resize re-renders.
export const PaletteView = memo(({ groups, theme, search, onShowInAdvanced }: PaletteViewProps) => {
    const { translate } = useLocalization();
    const rootRef = useRef<HTMLDivElement>(null);
    const columnCount = useColumnCount(rootRef);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const onToggle = useCallback((key: string) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            next.has(key) ? next.delete(key) : next.add(key);
            return next;
        });
    }, []);

    const manual = useMemo(() => new Set(theme?.manual ?? []), [theme?.manual]);
    // Stable empty object, so the cards' memo holds.
    const overrides = useMemo(() => theme?.overrides ?? {}, [theme?.overrides]);
    const matching = useMemo(() => matchPalette(groups, theme?.palette ?? []), [groups, theme?.palette]);

    // A group shows when one of its variables (or their aliases) matches the search.
    const visible = useMemo(
        () => (search.length === 0 ? groups : groups.filter((g) => g.members.some((m) => [m.name, ...m.aliases].some((n) => matchesSearch(search, n))))),
        [groups, search],
    );

    return (
        <div ref={rootRef}>
            {matching.orphans.length > 0 && <OrphansBlock orphans={matching.orphans} />}
            {SECTIONS.map(({ key, test }) => {
                const sectionGroups = visible.filter(test);
                if (sectionGroups.length === 0) return null;
                return (
                    <div key={key} className={styles.section}>
                        <div className={styles.sectionTitle}>{translate(`ExtraUITheme.Palette.Section[${key}]`, key)}</div>
                        {/* Columns in reading order (card i in column i % n): an opened card only pushes down the ones below. */}
                        <div className={styles.grid}>
                            {Array.from({ length: columnCount }, (_, c) => (
                                <div key={c} className={styles.column}>
                                    {sectionGroups.filter((_, i) => i % columnCount === c).map((g) => (
                                        <GroupCard
                                            key={g.principal.name}
                                            group={g}
                                            match={matching.byGroup.get(g)}
                                            manual={manual}
                                            overrides={overrides}
                                            expanded={expanded.has(g.principal.name)}
                                            onToggle={onToggle}
                                            onShowInAdvanced={onShowInAdvanced}
                                        />
                                    ))}
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
});
