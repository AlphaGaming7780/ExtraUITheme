import { bindValue, trigger, useValue } from "cs2/api";
import { useLocalization } from "cs2/l10n";
import { Tooltip } from "cs2/ui";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { DeleteThemeDialog } from "./Dialogs/DeleteThemeDialog";
import { Masonry } from "./Masonry";
import { useCompactWidth } from "../Helpers/useCompactWidth";
import { usePanelDialogBounds } from "../Helpers/usePanelDialogBounds";

const cssDeclarations$ = bindValue<CssDeclaration[]>("ET", "CssDeclarations");
const availableThemes$ = bindValue<Theme[]>("ET", "AvailableThemes");
const activeThemeName$ = bindValue<string>("ET", "ActiveThemeName");
const autoSave$ = bindValue<boolean>("ET", "AutoSave");
const hasUnsavedChanges$ = bindValue<boolean>("ET", "HasUnsavedChanges");

type Mode = "simple" | "advanced";

// Curated "important" variables for Simple mode, grouped by topic. Advanced mode shows every
// :root-overridable variable flat, ungrouped (see the `filtered`/`groups` split below).
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

        // This panel's own outer box - tracked so every dialog (ExtraThemeDialog.tsx) can cap
        // itself to never render bigger than it, even at the panel's minimum size.
        const panelRef = useRef<HTMLDivElement>(null);
        usePanelDialogBounds(panelRef);

        // The toolbar's top row (theme dropdown + action buttons) - once it measures narrower than
        // this, the action buttons drop their text label and show icon-only (title attribute as a
        // tooltip fallback). Threshold is a rough estimate (panel default width is 640, minimum is
        // 360 - see PanelMinSize/SetPanelSize in ThemeExtraPanel.cs) - retune if it flips too early
        // or too late in practice.
        const toolbarRowRef = useRef<HTMLDivElement>(null);
        const compactActions = useCompactWidth(toolbarRowRef, 720);

        const [mode, setMode] = useState<Mode>("simple");
        const [search, setSearch] = useState("");
        const [activeKinds, setActiveKinds] = useState<CssDeclarationKind[]>([]);
        const [showExport, setShowExport] = useState(false);
        const [showImport, setShowImport] = useState(false);
        const [showRename, setShowRename] = useState(false);
        const [showDelete, setShowDelete] = useState(false);
        const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
        // Tracks every Simple-mode group that has EVER been expanded, and never removes from it -
        // a group's row content (TypedListRenderer below) only mounts once it's been opened at
        // least once, then stays mounted (just visually collapsed by FoldoutItem) so re-opening it
        // later is free. Advanced mode doesn't use this at all - it has no groups anymore.
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

        // Only :root is ever actually overridable - ExtraTheme's overrides always apply globally
        // via an inline style on <html> (RegisterThemePanel.tsx), which beats any other selector's
        // own rule regardless of which one a value happened to be shown from. The same --variable
        // name also exists under dozens of other selectors (.style--bright-blue, individual
        // component classes...) - without this restriction both modes would show the same variable
        // several times over for no controllable difference. See
        // Legacy/AdvancedSelectorGroupedList.tsx for the discussion and the preserved old UI.
        const filtered = useMemo(() => {
            return effectiveDeclarations.filter((d) => {
                if (d.selector !== ":root") return false;
                if (activeKinds.length > 0 && !activeKinds.includes(d.kind)) return false;
                if (search.length === 0) return true;
                return matchesSearch(search, d.name);
            });
        }, [effectiveDeclarations, activeKinds, search]);

        // Advanced mode no longer groups by selector (see the note on `filtered` above) - just the
        // curated Simple-mode groups remain.
        const groups = useMemo(() => {
            return SIMPLE_GROUPS
                .map((g) => ({
                    title: g.key,
                    displayTitle: translate(`ExtraTheme.Panel.Group[${g.key}]`, g.key),
                    items: filtered.filter((d) => g.names.includes(d.name)),
                }))
                .filter((g) => g.items.length > 0);
        }, [filtered, translate]);

        // A group's TypedListRenderer only mounts once it's been expanded at least once
        // (everExpandedGroups above), so re-opening it later is free. Memoized so typing in the
        // search box or toggling a kind chip doesn't rebuild every group node on each keystroke for
        // no reason beyond what `groups` itself needed anyway.
        const simpleMasonryItems = useMemo(() => groups.map((group) => {
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

        // Advanced: no more per-selector Foldout groups (see `filtered` above) - every overridable
        // variable is its own Masonry cell directly, rendered in the "card" variant (kind tag +
        // its own background/border, since it no longer sits inside a labeled group).
        //
        // Used to lazy-mount each card via IntersectionObserver (LazyMount.tsx) - removed: confirmed
        // in-game it wasn't actually deferring anything (IntersectionObserver isn't used anywhere in
        // the game's own UI bundle either, so its cohtml support was already unconfirmed going in -
        // see that file's own comment). Its feature-detect fallback (mount immediately if
        // IntersectionObserver is unavailable) was firing every time, so everything mounted at once
        // regardless - just with the extra wrapper's overhead on top for nothing.
        const advancedMasonryItems = useMemo(() => filtered.map((d) => ({
            key: d.name,
            node: <TypedListRenderer components={cssDeclarationRowComponents} data={[d]} props={{ variant: "card" }} />,
        })), [filtered]);

        const masonryItems = mode === "simple" ? simpleMasonryItems : advancedMasonryItems;

        // "12 / 308 variables" above Advanced's flat grid - the only overview it has left now that
        // there's no group header breaking the list into labeled sections.
        const totalRootCount = useMemo(() => declarations.filter((d) => d.selector === ":root").length, [declarations]);

        // Shared by each action button's <span> label and its Tooltip - translate() can return
        // null, but Tooltip's `tooltip` prop (and the old `title` fallback it replaced) want a
        // plain string.
        const renameLabel = translate("ExtraTheme.Panel.Rename", "Rename") ?? "Rename";
        const deleteLabel = translate("ExtraTheme.Panel.Delete", "Delete") ?? "Delete";
        const exportLabel = translate("ExtraTheme.Panel.Export", "Export") ?? "Export";
        const importLabel = translate("ExtraTheme.Panel.Import", "Import") ?? "Import";
        const saveLabel = translate("ExtraTheme.Panel.Save", "Save") ?? "Save";
        const autoSaveLabel = translate("ExtraTheme.Panel.AutoSave", "Auto-save") ?? "Auto-save";

        return (
        // Our own multi-child focus boundary for everything below - without it, the theme
        // Dropdown and every expanded FoldoutItem group's content try to register directly with
        // the game Panel's own ambient single-child focus slot ("PanelContent") and fight over it,
        // producing "Attempted to unregister mismatching focus key ... from a KeyFocusController!"
        // once a losing registration's owner unmounts/collapses. FocusScope's own controller is a
        // proper multi-child one (a Map keyed by focus key), so everything underneath registers
        // with THIS instead.
        <FocusScope>
        <div className={styles.themeExtraPanelContent} ref={panelRef}>
            <div className={styles.toolbar}>
                {/* Two flex items (dropdown, actions cluster) so flex-wrap moves the WHOLE actions
                group onto its own line below the dropdown when the panel is narrow, instead of the
                dropdown getting crushed to near-nothing while everything stays crammed on one line -
                see .themeSelect's min-width in ThemeDropdown.module.scss for the dropdown's half of
                this. */}
                <div className={styles.row} ref={toolbarRowRef}>
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
                    <div className={toolbarStyles.actions}>
                        {/* Text wrapped in a child <span>, not the <button>'s own direct text node -
                        see .modeToggle button below for the accented-character reason. Dropped
                        entirely (icon-only) once compactActions is true - a Tooltip (cs2/ui) carries
                        the label then, same as always really: a native `title` attribute doesn't
                        render as a tooltip in this engine (confirmed in-game - cohtml has no OS-level
                        tooltip chrome to hook into), this is the game's own hover-tooltip component. */}
                        <Tooltip tooltip={renameLabel}>
                            <button className={toolbarStyles.btn} disabled={!activeTheme || activeTheme.isBuiltIn} onClick={() => setShowRename(true)}>
                                <TintedIcon className={toolbarStyles.btnIcon} src="Media/Editor/Edit.svg" />
                                {!compactActions && <span>{renameLabel}</span>}
                            </button>
                        </Tooltip>
                        <Tooltip tooltip={deleteLabel}>
                            <button className={toolbarStyles.btn} disabled={!activeTheme || activeTheme.isBuiltIn} onClick={() => setShowDelete(true)}>
                                <TintedIcon className={toolbarStyles.btnIcon} src="Media/Glyphs/Trash.svg" />
                                {!compactActions && <span>{deleteLabel}</span>}
                            </button>
                        </Tooltip>
                        <Tooltip tooltip={exportLabel}>
                            <button className={toolbarStyles.btn} disabled={!activeTheme} onClick={() => setShowExport(true)}>
                                {/* Plain <img>, not TintedIcon - Export/Import.svg carry their own
                                green/orange accent color (the game's own export/import iconography);
                                TintedIcon renders as a flat mask-image and would erase that. */}
                                <img className={toolbarStyles.btnIconImg} src="Media/Game/Icons/Export.svg" />
                                {!compactActions && <span>{exportLabel}</span>}
                            </button>
                        </Tooltip>
                        <Tooltip tooltip={importLabel}>
                            <button className={toolbarStyles.btn} onClick={() => setShowImport(true)}>
                                <img className={toolbarStyles.btnIconImg} src="Media/Game/Icons/Import.svg" />
                                {!compactActions && <span>{importLabel}</span>}
                            </button>
                        </Tooltip>
                        <Tooltip tooltip={saveLabel}>
                            <button className={toolbarStyles.btn} disabled={!hasUnsavedChanges} onClick={() => trigger("ET", "SaveTheme", true)}>
                                <TintedIcon className={toolbarStyles.btnIcon} src="Media/Glyphs/Save.svg" />
                                {!compactActions && <span>{saveLabel}</span>}
                            </button>
                        </Tooltip>
                        <Tooltip tooltip={autoSaveLabel}>
                            <label className={toolbarStyles.autoSaveLabel}>
                                {/* Built-in themes have nothing to save - SetOverride forks them into
                                a new theme on the first edit (ThemeExtraPanel.cs), so auto-save only
                                ever applies once that fork exists, same as the Save button above.
                                Shown unchecked here too (not just disabled) - display-only, doesn't
                                touch the underlying AutoSave setting, which is a global preference
                                unrelated to whichever theme happens to be showing right now and
                                should survive switching back to a custom theme. */}
                                <Checkbox checked={!!activeTheme && !activeTheme.isBuiltIn && autoSave} disabled={!activeTheme || activeTheme.isBuiltIn} onChange={(value: boolean) => trigger("ET", "SetAutoSave", value)} />
                                {!compactActions && <span>{autoSaveLabel}</span>}
                            </label>
                        </Tooltip>
                    </div>
                </div>

                <div className={toolbarStyles.modeToggle}>
                    <div className={toolbarStyles.modeToggleIndicatorTrack}>
                        <div
                            className={toolbarStyles.modeToggleIndicator}
                            style={{ transform: mode === "advanced" ? "translateX(100%)" : "translateX(0%)" }}
                        />
                    </div>
                    <button className={mode === "simple" ? toolbarStyles.active : undefined} onClick={() => setMode("simple")}><span>{translate("ExtraTheme.Panel.Simple", "Simple")}</span></button>
                    <button className={mode === "advanced" ? toolbarStyles.active : undefined} onClick={() => setMode("advanced")}><span>{translate("ExtraTheme.Panel.Advanced", "Advanced")}</span></button>
                </div>

                <div className={searchStyles.searchInputWrapper}>
                    <TintedIcon className={searchStyles.searchIcon} src="coui://extratheme/Icons/ThemePanel/Search.svg" />
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
                {mode === "advanced" && (
                    <div className={styles.countLine}>
                        <span>{filtered.length} / {totalRootCount}</span>
                        <span>{translate("ExtraTheme.Panel.VariablesCount", "variable(s)")}</span>
                    </div>
                )}
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
            {showDelete && activeTheme && (
                <DeleteThemeDialog themeName={activeTheme.name} onClose={() => setShowDelete(false)} />
            )}
        </div>
        </FocusScope>
        )
    }
    return ComponentList;
}
