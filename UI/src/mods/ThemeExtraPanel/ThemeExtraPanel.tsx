import { bindEvent, bindValue, trigger, useValue } from "cs2/api";
import { useLocalization } from "cs2/l10n";
import { Tooltip } from "cs2/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { isTypingInTextControl } from "../Helpers/KeyboardShortcuts";

const cssDeclarations$ = bindValue<CssDeclaration[]>("EUT", "CssDeclarations");
const availableThemes$ = bindValue<Theme[]>("EUT", "AvailableThemes");
const activeThemeName$ = bindValue<string>("EUT", "ActiveThemeName");
const autoSave$ = bindValue<boolean>("EUT", "AutoSave");
const hasUnsavedChanges$ = bindValue<boolean>("EUT", "HasUnsavedChanges");

// Fired by ThemeExtraPanel.cs's OnPreProcess on the real Ctrl+Z/Ctrl+Y ProxyAction - see KeyboardShortcuts.ts for the text-focus guard this still needs.
const onUndoShortcut$ = bindEvent<number>("EUT", "OnUndoShortcut");
const onRedoShortcut$ = bindEvent<number>("EUT", "OnRedoShortcut");

type Mode = "simple" | "advanced";

// Curated "important" variables for Simple mode, grouped by topic - Advanced mode shows every :root-overridable variable flat instead.
const SIMPLE_GROUPS: { key: string; names: string[] }[] = [
    { key: "PanelColors", names: ["--panelColorNormal", "--panelColorDark", "--sectionBackgroundColor", "--sectionBorderColor", "--sectionHeaderColor"] },
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

// Custom theme for Dropdown/DropdownToggle/DropdownItem - see ThemeDropdown.module.scss for why.
const dropdownTheme = {
    dropdownToggle: dropdownStyles.dropdownToggle,
    indicator: dropdownStyles.dropdownIndicator,
    dropdownPopup: dropdownStyles.dropdownPopup,
    dropdownMenu: dropdownStyles.dropdownMenu,
    dropdownItem: dropdownStyles.dropdownItem,
};

export const ThemeExtraPanel = (ComponentList: { [x: string]: any; }): any => {
    ComponentList["ExtraUITheme.Systems.UI.ThemePanel.ThemeExtraPanel"] = (extraPanel: ExtraPanelType) => {
        const declarations = useValue(cssDeclarations$) ?? [];
        const availableThemes = useValue(availableThemes$) ?? [];
        const activeThemeName = useValue(activeThemeName$);
        const autoSave = useValue(autoSave$) ?? false;
        const hasUnsavedChanges = useValue(hasUnsavedChanges$) ?? false;
        const { translate } = useLocalization();

        // This panel's own outer box - tracked so every dialog (ExtraUIThemeDialog.tsx) can cap itself to its size.
        const panelRef = useRef<HTMLDivElement>(null);
        usePanelDialogBounds(panelRef);

        // Toolbar's top row - once narrower than this threshold, action buttons drop their text label and go icon-only.
        const toolbarRowRef = useRef<HTMLDivElement>(null);
        const compactActions = useCompactWidth(toolbarRowRef, 830);

        // Ctrl+Z/Ctrl+Y, guarded so native undo/redo inside a focused text field isn't hijacked.
        const handleUndo = useCallback(() => { if (!isTypingInTextControl()) trigger("EUT", "Undo"); }, []);
        const handleRedo = useCallback(() => { if (!isTypingInTextControl()) trigger("EUT", "Redo"); }, []);
        useEffect(() => {
            const undoSub = onUndoShortcut$.subscribe(handleUndo);
            const redoSub = onRedoShortcut$.subscribe(handleRedo);
            return () => {
                undoSub.dispose();
                redoSub.dispose();
            };
        }, [handleUndo, handleRedo]);

        const [mode, setMode] = useState<Mode>("simple");
        const [search, setSearch] = useState("");
        const [activeKinds, setActiveKinds] = useState<CssDeclarationKind[]>([]);
        const [showExport, setShowExport] = useState(false);
        const [showImport, setShowImport] = useState(false);
        const [showRename, setShowRename] = useState(false);
        const [showDelete, setShowDelete] = useState(false);
        const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
        // Every Simple-mode group ever expanded - its content mounts once and stays mounted so re-opening is free.
        const [everExpandedGroups, setEverExpandedGroups] = useState<Set<string>>(new Set());

        const toggleKind = (kind: CssDeclarationKind) => {
            setActiveKinds((prev) => prev.includes(kind) ? prev.filter((k) => k !== kind) : [...prev, kind]);
        };

        // Built-in themes get a translated display name; user themes show their raw typed name as-is.
        const themeDisplayName = (theme: Theme | undefined) =>
            theme ? (theme.isBuiltIn ? translate(`ExtraUITheme.Theme[${theme.name}]`, theme.name) : theme.name) : "";

        const activeTheme = availableThemes.find((t) => t.name === activeThemeName);

        const toggleGroup = (title: string) => {
            setExpandedGroups((prev) => {
                const next = new Set(prev);
                next.has(title) ? next.delete(title) : next.add(title);
                return next;
            });
            setEverExpandedGroups((prev) => (prev.has(title) ? prev : new Set(prev).add(title)));
        };

        // Patch :root declarations with the active theme's live overrides, since ExtractAll() only reads static index.css.
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

        // Only :root is ever actually overridable (see Legacy/AdvancedSelectorGroupedList.tsx) - other selectors would just duplicate each variable.
        const filtered = useMemo(() => {
            return effectiveDeclarations.filter((d) => {
                if (d.selector !== ":root") return false;
                if (activeKinds.length > 0 && !activeKinds.includes(d.kind)) return false;
                if (search.length === 0) return true;
                return matchesSearch(search, d.name);
            });
        }, [effectiveDeclarations, activeKinds, search]);

        // Advanced mode no longer groups by selector - just the curated Simple-mode groups remain.
        const groups = useMemo(() => {
            return SIMPLE_GROUPS
                .map((g) => ({
                    title: g.key,
                    displayTitle: translate(`ExtraUITheme.Panel.Group[${g.key}]`, g.key),
                    items: filtered.filter((d) => g.names.includes(d.name)),
                }))
                .filter((g) => g.items.length > 0);
        }, [filtered, translate]);

        // Memoized so typing in search or toggling a kind chip doesn't rebuild every group node on each keystroke.
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

        // Advanced: every overridable variable is its own Masonry cell in the "card" variant, no per-selector grouping.
        const advancedMasonryItems = useMemo(() => filtered.map((d) => ({
            key: d.name,
            node: <TypedListRenderer components={cssDeclarationRowComponents} data={[d]} props={{ variant: "card" }} />,
        })), [filtered]);

        const masonryItems = mode === "simple" ? simpleMasonryItems : advancedMasonryItems;

        // "12 / 308 variables" above Advanced's flat grid, since there's no group header to summarize it otherwise.
        const totalRootCount = useMemo(() => declarations.filter((d) => d.selector === ":root").length, [declarations]);

        // Shared by each action button's <span> label and its Tooltip - translate() can return null, but Tooltip wants a plain string.
        const renameLabel = translate("ExtraUITheme.Panel.Rename", "Rename") ?? "Rename";
        const deleteLabel = translate("ExtraUITheme.Panel.Delete", "Delete") ?? "Delete";
        const cloneLabel = translate("ExtraUITheme.Panel.Clone", "Clone") ?? "Clone";
        const exportLabel = translate("ExtraUITheme.Panel.Export", "Export") ?? "Export";
        const importLabel = translate("ExtraUITheme.Panel.Import", "Import") ?? "Import";
        const saveLabel = translate("ExtraUITheme.Panel.Save", "Save") ?? "Save";
        const autoSaveLabel = translate("ExtraUITheme.Panel.AutoSave", "Auto-save") ?? "Auto-save";

        return (
        // Our own multi-child focus boundary, so Dropdown and FoldoutItem groups don't fight over the game Panel's single-child focus slot.
        <FocusScope>
        <div className={styles.themeExtraPanelContent} ref={panelRef}>
            <div className={styles.toolbar}>
                {/* Two flex items so flex-wrap moves the whole actions cluster below the dropdown when the panel is narrow. */}
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
                                            onChange={(name) => trigger("EUT", "SelectTheme", name)}
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
                        {/* Label drops entirely (icon-only) once compactActions is true - Tooltip carries it instead, since native `title` doesn't render in cohtml. */}
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
                        <Tooltip tooltip={cloneLabel}>
                            <button className={toolbarStyles.btn} disabled={!activeTheme} onClick={() => trigger("EUT", "CloneTheme")}>
                                <TintedIcon className={toolbarStyles.btnIcon} src="Media/Glyphs/Copy.svg" />
                                {!compactActions && <span>{cloneLabel}</span>}
                            </button>
                        </Tooltip>
                        <Tooltip tooltip={exportLabel}>
                            <button className={toolbarStyles.btn} disabled={!activeTheme} onClick={() => setShowExport(true)}>
                                {/* Plain <img>, not TintedIcon - Export.svg carries its own accent color that TintedIcon's mask would erase. */}
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
                            <button className={toolbarStyles.btn} disabled={!hasUnsavedChanges} onClick={() => trigger("EUT", "SaveTheme", true)}>
                                <TintedIcon className={toolbarStyles.btnIcon} src="Media/Glyphs/Save.svg" />
                                {!compactActions && <span>{saveLabel}</span>}
                            </button>
                        </Tooltip>
                        <Tooltip tooltip={autoSaveLabel}>
                            <label className={toolbarStyles.autoSaveLabel}>
                                {/* Shown unchecked (not just disabled) on built-ins - display-only, doesn't touch the global AutoSave setting itself. */}
                                <Checkbox checked={!!activeTheme && !activeTheme.isBuiltIn && autoSave} disabled={!activeTheme || activeTheme.isBuiltIn} onChange={(value: boolean) => trigger("EUT", "SetAutoSave", value)} />
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
                    <button className={mode === "simple" ? toolbarStyles.active : undefined} onClick={() => setMode("simple")}><span>{translate("ExtraUITheme.Panel.Simple", "Simple")}</span></button>
                    <button className={mode === "advanced" ? toolbarStyles.active : undefined} onClick={() => setMode("advanced")}><span>{translate("ExtraUITheme.Panel.Advanced", "Advanced")}</span></button>
                </div>

                <div className={searchStyles.searchInputWrapper}>
                    <TintedIcon className={searchStyles.searchIcon} src="coui://extratheme/Icons/ThemePanel/Search.svg" />
                    <input
                        className={searchStyles.searchInput}
                        value={search}
                        onChange={(e) => setSearch((e.target as HTMLInputElement).value)}
                        onKeyDown={(e) => {
                            // Keys aren't localized: AZERTY reports physical Ctrl+A as "q" (its QWERTY position), so test both.
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
                            {translate("ExtraUITheme.Panel.SearchPlaceholder", "Search, e.g. panel*Color")}
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
                            {translate(`ExtraUITheme.Panel.Kind[${CssDeclarationKind[kind]}]`, CssDeclarationKind[kind])}
                        </span>
                    ))}
                </div>
            </div>

            <div className={styles.content}>
                {mode === "advanced" && (
                    <div className={styles.countLine}>
                        <span>
                            {(translate("ExtraUITheme.Panel.VariablesCountFraction", "{filtered} / {total} variable(s)") ?? "")
                                .replace("{filtered}", String(filtered.length))
                                .replace("{total}", String(totalRootCount))}
                        </span>
                    </div>
                )}
                <Masonry
                    minColumnWidth={250}
                    gap={12}
                    items={masonryItems}
                    virtualize={mode === "advanced"}
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
