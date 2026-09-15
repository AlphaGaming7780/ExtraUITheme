import { bindValue, trigger, useValue } from "cs2/api";
import { useLocalization } from "cs2/l10n";
import { useMemo, useState } from "react";
import { ExtraPanelType } from "../ExtraPanelType";
import { FoldoutItem } from "../../../game-ui/common/foldout/foldout-item";
import { TintedIcon } from "../../../game-ui/common/image/tinted-icon";
import { TypedListRenderer } from "../../../game-ui/common/typed-renderer/typed-renderer";
import { Dropdown } from "../../../game-ui/common/input/dropdown/dropdown";
import { DropdownToggle } from "../../../game-ui/common/input/dropdown/dropdown-toggle";
import { DropdownItem } from "../../../game-ui/common/input/dropdown/items/dropdown-item";
import { Checkbox } from "../../../game-ui/common/input/toggle/checkbox/checkbox";
import { FocusScope } from "../../../game-ui/common/focus/focus-scope";
import styles from "./ThemeExtraPanel.module.scss";
import dropdownStyles from "./ThemeDropdown.module.scss";
import toolbarStyles from "./Toolbar.module.scss";
import searchStyles from "./SearchBar.module.scss";
import chipStyles from "./FilterChips.module.scss";
import { CssDeclaration, CssDeclarationKind } from "./DeclarationRow/CssDeclarationTypes";
import { Theme } from "./ThemeTypes";
import { cssDeclarationRowComponents } from "./DeclarationRow/CssDeclarationRow";
import { matchesSearch } from "../Helpers/search";
import { resolveOverrideFields } from "../Helpers/resolveOverride";
import { ExportDialog, ImportDialog } from "./Dialogs/ExportImportDialogs";
import { RenameThemeDialog } from "./Dialogs/RenameThemeDialog";
import { Masonry } from "./Masonry";

const cssDeclarations$ = bindValue<CssDeclaration[]>("ET", "CssDeclarations");
const availableThemes$ = bindValue<Theme[]>("ET", "AvailableThemes");
const activeThemeName$ = bindValue<string>("ET", "ActiveThemeName");
const autoSave$ = bindValue<boolean>("ET", "AutoSave");
const hasUnsavedChanges$ = bindValue<boolean>("ET", "HasUnsavedChanges");

type Mode = "simple" | "advanced";

// Curated "important" variables for Simple mode, grouped by topic. Advanced mode instead groups
// everything by its origin CSS selector.
// Kept in sync with every color variable the two legacy presets (BrightBlue/DarkGreyOrange, see
// src/embedded/Themes/) actually override - if a theme can change it, Simple mode should show it
// somewhere sensible rather than only in Advanced.
// `key` is a stable identifier (also used for expand/collapse state and as the React key) - the
// translated label (ExtraTheme.Panel.Group[key], see embedded/Localization/*.json) is resolved at
// render time in the `groups` useMemo below, not baked in here.
const SIMPLE_GROUPS: { key: string; names: string[] }[] = [
    { key: "PanelColors", names: ["--panelColorNormal", "--panelColorDark", "--sectionBackgroundColor", "--sectionBorderColor"] },
    { key: "TextColors", names: ["--normalTextColor", "--textColorDim", "--textColorDisabled", "--textColorDimmer"] },
    {
        key: "AccentColors", names: [
            "--accentColorNormal", "--accentColorNormal-hover", "--accentColorNormal-pressed",
            "--accentColorDark", "--accentColorDark-hover", "--accentColorDark-pressed", "--accentColorDark-focused",
            "--accentColorLight", "--accentColorLighter",
            "--selectedColor", "--selectedColorDark", "--selectedColor-hover", "--selectedColor-active",
            "--gradientHighlightStart", "--gradientHighlightEnd",
            "--commonCyan",
            "--focusedColor",
            "--highlightBrightBlue", "--highlightLightBlue", "--highlightGreen", "--highlightYellow",
            "--highlightWarningRed", "--highlightWarningLightRed",
        ]
    },
    { key: "States", names: ["--positiveColor", "--warningColor", "--negativeColor"] },
    {
        key: "MenuColors", names: [
            "--menuPanel1", "--menuPanel2", "--menuPanel3",
            "--menuControl1", "--menuControl2", "--menuDisabledColor",
            "--menuText1Normal", "--menuText1Inverted", "--menuText1Disabled",
            "--menuText2Normal", "--menuText2Inverted", "--menuTitleNormal",
        ]
    },
];

const ALL_KINDS = Object.values(CssDeclarationKind).filter((k) => typeof k === "number") as CssDeclarationKind[];

// Custom theme for Dropdown/DropdownToggle/DropdownItem - see ThemeDropdown.module.scss for why
// (not the game's own game-dropdown theme).
const dropdownTheme = {
    dropdownToggle: dropdownStyles.dropdownToggle,
    indicator: dropdownStyles.dropdownIndicator,
    dropdownPopup: dropdownStyles.dropdownPopup,
    dropdownMenu: dropdownStyles.dropdownMenu,
    dropdownItem: dropdownStyles.dropdownItem,
};

export const ThemeExtraPanel = (ComponentList: { [x: string]: any; }): any => {
    ComponentList["ExtraTheme.Systems.UI.ThemePanel.ThemeExtraPanel"] = (extraPanel: ExtraPanelType) => {
        const declarations = useValue(cssDeclarations$) ?? [];
        const availableThemes = useValue(availableThemes$) ?? [];
        const activeThemeName = useValue(activeThemeName$);
        const autoSave = useValue(autoSave$) ?? false;
        const hasUnsavedChanges = useValue(hasUnsavedChanges$) ?? false;
        const { translate } = useLocalization();

        const [mode, setMode] = useState<Mode>("simple");
        const [search, setSearch] = useState("");
        const [activeKinds, setActiveKinds] = useState<CssDeclarationKind[]>([]);
        const [showExport, setShowExport] = useState(false);
        const [showImport, setShowImport] = useState(false);
        const [showRename, setShowRename] = useState(false);
        const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
        // Tracks every group that has EVER been expanded, and never removes from it - a group's
        // row content (TypedListRenderer below) only mounts once it's been opened at least once,
        // then stays mounted (just visually collapsed by FoldoutItem) so re-opening it later is
        // free. Advanced mode alone produces 258 groups (one per CSS selector), so rendering every
        // group's rows eagerly on mode switch, most of which nobody ever opens, was a real source
        // of lag.
        const [everExpandedGroups, setEverExpandedGroups] = useState<Set<string>>(new Set());

        const toggleKind = (kind: CssDeclarationKind) => {
            setActiveKinds((prev) => prev.includes(kind) ? prev.filter((k) => k !== kind) : [...prev, kind]);
        };

        // Built-in themes get a translated display name (ExtraTheme.Theme[Name], see
        // embedded/Localization/*.json) - user themes have no locale entry, so their raw name (the
        // one the user typed when saving) is shown as-is.
        const themeDisplayName = (theme: Theme | undefined) =>
            theme ? (theme.isBuiltIn ? translate(`ExtraTheme.Theme[${theme.name}]`, theme.name) : theme.name) : "";

        const activeTheme = availableThemes.find((t) => t.name === activeThemeName);

        const toggleGroup = (title: string) => {
            setExpandedGroups((prev) => {
                const next = new Set(prev);
                next.has(title) ? next.delete(title) : next.add(title);
                return next;
            });
            setEverExpandedGroups((prev) => (prev.has(title) ? prev : new Set(prev).add(title)));
        };

        // CssVariableExtractor.ExtractAll() reads the game's static index.css on disk - it has no
        // idea what the active theme has overridden live via setProperty (see
        // RegisterThemePanel.tsx). Patch the :root declarations here so the panel shows the value
        // actually in effect right now, not just whatever index.css says.
        const effectiveDeclarations = useMemo(() => {
            const overrides = activeTheme?.overrides;
            if (!overrides || Object.keys(overrides).length === 0) return declarations;
            return declarations.map((d) => {
                if (d.selector !== ":root") return d;
                const override = overrides[d.name];
                if (override === undefined) return d;
                return { ...d, ...resolveOverrideFields(override) };
            });
        }, [declarations, activeTheme]);

        const filtered = useMemo(() => {
            return effectiveDeclarations.filter((d) => {
                if (activeKinds.length > 0 && !activeKinds.includes(d.kind)) return false;
                if (search.length === 0) return true;
                // In Advanced mode (grouped by selector), a search also matching the selector
                // itself pulls in that whole group - e.g. typing "bright-blue" should surface
                // .style--bright-blue's declarations even though "bright-blue" isn't in any of
                // their names. Simple mode's own curated-name restriction (see `groups` below)
                // already ignores this, so it's harmless to leave enabled there too.
                if (matchesSearch(search, d.name)) return true;
                if (mode === "advanced" && matchesSearch(search, d.selector)) return true;
                return false;
            });
        }, [effectiveDeclarations, activeKinds, search, mode]);

        const groups = useMemo(() => {
            if (mode === "simple") {
                // Restricted to :root - the same --variable name also exists under
                // .style--bright-blue/.style--dark-grey-orange/etc (each theme's own override of
                // it), so without this a curated group would show the same variable 2-3 times over.
                return SIMPLE_GROUPS
                    .map((g) => ({
                        title: g.key,
                        displayTitle: translate(`ExtraTheme.Panel.Group[${g.key}]`, g.key),
                        items: filtered.filter((d) => d.selector === ":root" && g.names.includes(d.name)),
                    }))
                    .filter((g) => g.items.length > 0);
            }

            const bySelector = new Map<string, CssDeclaration[]>();
            for (const d of filtered) {
                const list = bySelector.get(d.selector);
                if (list) list.push(d); else bySelector.set(d.selector, [d]);
            }
            return [...bySelector.entries()]
                .sort(([a], [b]) => (a === ":root" ? -1 : b === ":root" ? 1 : a.localeCompare(b)))
                .map(([selector, items]) => ({ title: selector, displayTitle: selector, items }));
        }, [filtered, mode, translate]);

        // A group's TypedListRenderer only mounts once it's been expanded at least once
        // (everExpandedGroups above), which is what keeps a mode switch (258 groups in Advanced)
        // fast. Memoized so typing in the search box or toggling a kind chip doesn't rebuild every
        // group node on each keystroke for no reason beyond what `groups` itself needed anyway.
        const masonryItems = useMemo(() => groups.map((group) => {
            const expanded = expandedGroups.has(group.title);
            const everExpanded = everExpandedGroups.has(group.title);
            return {
                key: group.title,
                node: (
                    <FoldoutItem
                        className={styles.group}
                        expanded={expanded}
                        expandFromContent={false}
                        initialExpanded={false}
                        header={
                            <div className={styles.groupHeader} onClick={() => toggleGroup(group.title)}>
                                <span className={styles.groupTitle}>{group.displayTitle}</span>
                                <span className={styles.count}>{group.items.length}</span>
                                <TintedIcon
                                    className={styles.groupToggle}
                                    src={expanded ? "Media/Glyphs/ThickStrokeArrowDown.svg" : "Media/Glyphs/ThickStrokeArrowRight.svg"}
                                />
                            </div>
                        }
                    >
                        {everExpanded && <TypedListRenderer components={cssDeclarationRowComponents} data={group.items} props={{}} />}
                    </FoldoutItem>
                ),
            };
        }), [groups, expandedGroups, everExpandedGroups]);

        return (
        // Our own multi-child focus boundary for everything below - without it, the theme
        // Dropdown and every expanded FoldoutItem group's content try to register directly with
        // the game Panel's own ambient single-child focus slot ("PanelContent") and fight over it,
        // producing "Attempted to unregister mismatching focus key ... from a KeyFocusController!"
        // once a losing registration's owner unmounts/collapses. FocusScope's own controller is a
        // proper multi-child one (a Map keyed by focus key), so everything underneath registers
        // with THIS instead.
        <FocusScope>
        <div className={styles.themeExtraPanelContent}>
            <div className={styles.toolbar}>
                <div className={styles.row}>
                    <div className={dropdownStyles.themeSelect}>
                        <Dropdown
                            theme={dropdownTheme}
                            content={
                                <>
                                    {availableThemes.map((t) => (
                                        <DropdownItem
                                            key={t.name}
                                            theme={dropdownTheme}
                                            value={t.name}
                                            selected={t.name === activeThemeName}
                                            closeOnSelect={true}
                                            onChange={(name) => trigger("ET", "SelectTheme", name)}
                                        >
                                            {themeDisplayName(t)}
                                        </DropdownItem>
                                    ))}
                                </>
                            }
                        >
                            <DropdownToggle theme={dropdownTheme}>{themeDisplayName(activeTheme)}</DropdownToggle>
                        </Dropdown>
                    </div>
                    {/* Text wrapped in a child <span>, not the <button>'s own direct text node - see
                    .modeToggle button in Toolbar.module.scss for the accented-character reason. */}
                    <button className={toolbarStyles.btn} disabled={!activeTheme || activeTheme.isBuiltIn} onClick={() => setShowRename(true)}><span>{translate("ExtraTheme.Panel.Rename", "Rename")}</span></button>
                    <button className={toolbarStyles.btn} disabled={!activeTheme} onClick={() => setShowExport(true)}><span>{translate("ExtraTheme.Panel.Export", "Export")}</span></button>
                    <button className={toolbarStyles.btn} onClick={() => setShowImport(true)}><span>{translate("ExtraTheme.Panel.Import", "Import")}</span></button>
                    <button className={toolbarStyles.btn} disabled={!hasUnsavedChanges} onClick={() => trigger("ET", "SaveTheme", true)}><span>{translate("ExtraTheme.Panel.Save", "Save")}</span></button>
                    <label className={toolbarStyles.autoSaveLabel}>
                        <Checkbox checked={autoSave} onChange={(value: boolean) => trigger("ET", "SetAutoSave", value)} />
                        <span>{translate("ExtraTheme.Panel.AutoSave", "Auto-save")}</span>
                    </label>
                </div>

                <div className={toolbarStyles.modeToggle}>
                    <button className={mode === "simple" ? toolbarStyles.active : undefined} onClick={() => setMode("simple")}><span>{translate("ExtraTheme.Panel.Simple", "Simple")}</span></button>
                    <button className={mode === "advanced" ? toolbarStyles.active : undefined} onClick={() => setMode("advanced")}><span>{translate("ExtraTheme.Panel.Advanced", "Advanced")}</span></button>
                </div>

                <div className={searchStyles.searchInputWrapper}>
                    <input
                        className={searchStyles.searchInput}
                        value={search}
                        onChange={(e) => setSearch((e.target as HTMLInputElement).value)}
                        onKeyDown={(e) => {
                            // Keys aren't localized in this engine: on an AZERTY layout, physical
                            // Ctrl+A is reported as key "q" (its QWERTY position) rather than "a" -
                            // test both so this also works on a QWERTY layout.
                            if (e.ctrlKey && (e.key === "q" || e.key === "a")) {
                                e.preventDefault();
                                e.stopPropagation();
                                e.currentTarget.select();
                                return;
                            }
                            if (e.ctrlKey && e.key === "Backspace") {
                                e.preventDefault();
                                e.stopPropagation();
                                const input = e.currentTarget;
                                const caret = input.selectionStart ?? search.length;
                                if (caret === 0) return;
                                const before = search.slice(0, caret);
                                const after = search.slice(caret);
                                const wordStart = before.replace(/\s+$/, "").search(/\S*$/);
                                const newValue = before.slice(0, wordStart) + after;
                                input.value = newValue;
                                input.setSelectionRange(wordStart, wordStart);
                                setSearch(newValue);
                            }
                        }}
                    />
                    {search.length === 0 && (
                        <span className={searchStyles.searchInputPlaceholder}>
                            {translate("ExtraTheme.Panel.SearchPlaceholder", "Search, e.g. panel*Color")}
                        </span>
                    )}
                </div>

                <div className={chipStyles.filterChips}>
                    {ALL_KINDS.map((kind) => (
                        <span
                            key={kind}
                            className={activeKinds.includes(kind) ? `${chipStyles.chip} ${chipStyles.active}` : chipStyles.chip}
                            onClick={() => toggleKind(kind)}
                        >
                            {translate(`ExtraTheme.Panel.Kind[${CssDeclarationKind[kind]}]`, CssDeclarationKind[kind])}
                        </span>
                    ))}
                </div>
            </div>

            <div className={styles.content}>
                <Masonry
                    minColumnWidth={250}
                    gap={12}
                    items={masonryItems}
                />
            </div>

            {showExport && activeTheme && (
                <ExportDialog themeName={activeTheme.name} overrides={activeTheme.overrides} onClose={() => setShowExport(false)} />
            )}
            {showImport && (
                <ImportDialog takenNames={availableThemes.map((t) => t.name)} onClose={() => setShowImport(false)} />
            )}
            {showRename && activeTheme && (
                <RenameThemeDialog
                    currentName={activeTheme.name}
                    takenNames={availableThemes.filter((t) => t.name !== activeTheme.name).map((t) => t.name)}
                    onClose={() => setShowRename(false)}
                />
            )}
        </div>
        </FocusScope>
        )
    }
    return ComponentList;
}
