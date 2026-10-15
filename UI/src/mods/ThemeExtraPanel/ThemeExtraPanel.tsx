import { bindEvent, bindValue, trigger, useValue } from "cs2/api";
import { useLocalization } from "cs2/l10n";
import { Tooltip } from "cs2/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExtraPanelType } from "../ExtraPanelType";
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
import { countWarnings, ThemeIssuesDialog } from "./Dialogs/ThemeIssuesReport";
import { Masonry } from "./Masonry";
import { useCompactWidth } from "../Helpers/useCompactWidth";
import { usePanelDialogBounds } from "../Helpers/usePanelDialogBounds";
import { isTypingInTextControl } from "../Helpers/KeyboardShortcuts";
import { analyzeGamePalette, effectiveDefaults } from "../Helpers/palette";
import { exactNameSearch, PaletteView } from "./SimpleMode/PaletteView";
import { stopIdentify } from "../Helpers/identify";

const cssDeclarations$ = bindValue<CssDeclaration[]>("EUT", "CssDeclarations");
const cssVarUsages$ = bindValue<Record<string, number>>("EUT", "CssVarUsages");
const availableThemes$ = bindValue<Theme[]>("EUT", "AvailableThemes");
const activeThemeName$ = bindValue<string>("EUT", "ActiveThemeName");
const autoSave$ = bindValue<boolean>("EUT", "AutoSave");
const hasUnsavedChanges$ = bindValue<boolean>("EUT", "HasUnsavedChanges");
// The game's useLegacyInterfaceActive() binding - false means <body> has `overwrite-legacy`.
const useLegacyInterface$ = bindValue<boolean>("options", "useLegacyInterface");

// Fired by ThemeExtraPanel.cs's OnPreProcess on the real Ctrl+Z/Ctrl+Y ProxyAction - see KeyboardShortcuts.ts for the text-focus guard this still needs.
const onUndoShortcut$ = bindEvent<number>("EUT", "OnUndoShortcut");
const onRedoShortcut$ = bindEvent<number>("EUT", "OnRedoShortcut");

type Mode = "simple" | "advanced";

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
        const usages = useValue(cssVarUsages$);
        const availableThemes = useValue(availableThemes$) ?? [];
        const activeThemeName = useValue(activeThemeName$);
        const autoSave = useValue(autoSave$) ?? false;
        const hasUnsavedChanges = useValue(hasUnsavedChanges$) ?? false;
        const useLegacyInterface = useValue(useLegacyInterface$) ?? false;
        const { translate } = useLocalization();

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
        const [showIssues, setShowIssues] = useState(false);

        // Stops any flash when the panel closes or the mode changes.
        useEffect(() => stopIdentify, []);
        useEffect(() => { stopIdentify(); }, [mode]);

        // Panel box, tracked while a dialog is open so dialogs can cap themselves to it.
        const panelRef = useRef<HTMLDivElement>(null);
        usePanelDialogBounds(panelRef, showExport || showImport || showRename || showDelete || showIssues);

        const toggleKind = (kind: CssDeclarationKind) => {
            setActiveKinds((prev) => prev.includes(kind) ? prev.filter((k) => k !== kind) : [...prev, kind]);
        };

        // Built-in themes get a translated display name; user themes show their raw typed name as-is.
        const themeDisplayName = (theme: Theme | undefined) =>
            theme ? (theme.isBuiltIn ? translate(`ExtraUITheme.Theme[${theme.name}]`, theme.name) : theme.name) : "";

        const activeTheme = availableThemes.find((t) => t.name === activeThemeName);

        // One declaration per variable with the game default in effect: `:root .overwrite-legacy` wins over :root in the modern UI.
        const defaultDeclarations = useMemo(() => effectiveDefaults(declarations, useLegacyInterface), [declarations, useLegacyInterface]);

        // Patch the defaults with the active theme's live overrides, since ExtractAll() only reads static index.css.
        const effectiveDeclarations = useMemo(() => {
            const overrides = activeTheme?.overrides;
            if (!overrides || Object.keys(overrides).length === 0) return defaultDeclarations;
            return defaultDeclarations.map((d) => {
                const override = overrides[d.name];
                if (override === undefined) return d;
                return { ...d, ...resolveOverrideFields(override) };
            });
        }, [defaultDeclarations, activeTheme]);

        const filtered = useMemo(() => {
            return effectiveDeclarations.filter((d) => {
                if (activeKinds.length > 0 && !activeKinds.includes(d.kind)) return false;
                if (search.length === 0) return true;
                return matchesSearch(search, d.name);
            });
        }, [effectiveDeclarations, activeKinds, search]);

        // Simple mode's palette groups, always against the modern UI's defaults.
        const paletteGroups = useMemo(() => analyzeGamePalette(declarations, usages) ?? [], [declarations, usages]);

        // Member list's link: Advanced mode filtered on exactly that variable.
        const showInAdvanced = useCallback((name: string) => {
            setActiveKinds([]);
            setSearch(exactNameSearch(name));
            setMode("advanced");
        }, []);

        // Advanced: every overridable variable is its own Masonry cell in the "card" variant, no per-selector grouping.
        const advancedMasonryItems = useMemo(() => filtered.map((d) => ({
            key: d.name,
            node: <TypedListRenderer components={cssDeclarationRowComponents} data={[d]} props={{ variant: "card" }} />,
        })), [filtered]);

        // "12 / 308 variables" above Advanced's flat grid, since there's no group header to summarize it otherwise.
        const totalRootCount = defaultDeclarations.length;

        // Shared by each action button's <span> label and its Tooltip - translate() can return null, but Tooltip wants a plain string.
        const renameLabel = translate("ExtraUITheme.Panel.Rename", "Rename") ?? "Rename";
        const deleteLabel = translate("ExtraUITheme.Panel.Delete", "Delete") ?? "Delete";
        const cloneLabel = translate("ExtraUITheme.Panel.Clone", "Clone") ?? "Clone";
        const exportLabel = translate("ExtraUITheme.Panel.Export", "Export") ?? "Export";
        const importLabel = translate("ExtraUITheme.Panel.Import", "Import") ?? "Import";
        const saveLabel = translate("ExtraUITheme.Panel.Save", "Save") ?? "Save";
        const autoSaveLabel = translate("ExtraUITheme.Panel.AutoSave", "Auto-save") ?? "Auto-save";

        return (
        // Multi-child focus boundary: the game Panel's focus slot takes a single child.
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
                            <button className={toolbarStyles.btn} disabled={!hasUnsavedChanges} onClick={() => trigger("EUT", "SaveTheme")}>
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

                {/* Kinds only mean something in Advanced - Simple mode is all colors. */}
                {mode === "advanced" && (
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
                )}
            </div>

            {/* Only warnings count - a theme whose sole findings are info-only (Redundant) shows no banner. */}
            {activeTheme && countWarnings(activeTheme.issues) > 0 && (
                <div className={styles.issuesBanner}>
                    <TintedIcon className={styles.issuesBannerIcon} src="Media/Glyphs/Warning.svg" />
                    <span className={styles.issuesBannerText}>
                        {(translate("ExtraUITheme.Panel.IssuesBanner", "{count} variable(s) of this theme don't match the current game.") ?? "")
                            .replace("{count}", String(countWarnings(activeTheme.issues)))}
                    </span>
                    <button className={toolbarStyles.btn} onClick={() => setShowIssues(true)}>
                        <span>{translate("ExtraUITheme.Panel.IssuesView", "Details")}</span>
                    </button>
                </div>
            )}

            <div className={styles.content}>
                {mode === "simple" ? (
                    <PaletteView groups={paletteGroups} theme={activeTheme} search={search} onShowInAdvanced={showInAdvanced} />
                ) : (
                    <>
                        <div className={styles.countLine}>
                            <span>
                                {(translate("ExtraUITheme.Panel.VariablesCountFraction", "{filtered} / {total} variable(s)") ?? "")
                                    .replace("{filtered}", String(filtered.length))
                                    .replace("{total}", String(totalRootCount))}
                            </span>
                        </div>
                        <Masonry minColumnWidth={250} gap={12} items={advancedMasonryItems} virtualize />
                    </>
                )}
            </div>

            {showExport && activeTheme && (
                <ExportDialog themeName={activeTheme.name} overrides={activeTheme.overrides} payload={activeTheme.exportJson} onClose={() => setShowExport(false)} />
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
            {showIssues && activeTheme && (
                <ThemeIssuesDialog
                    themeName={themeDisplayName(activeTheme) ?? activeTheme.name}
                    issues={activeTheme.issues}
                    isBuiltIn={activeTheme.isBuiltIn}
                    onClose={() => setShowIssues(false)}
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
