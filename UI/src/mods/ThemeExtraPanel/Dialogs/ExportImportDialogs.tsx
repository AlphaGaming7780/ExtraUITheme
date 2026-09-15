import { useState } from "react";
import classNames from "classnames";
import { useLocalization } from "cs2/l10n";
import { trigger } from "cs2/api";
import { Dialog } from "../../../../game-ui/common/panel/dialog/dialog";
import { Button } from "../../../../game-ui/common/input/button/button";
import { DialogButtonSCSS } from "../../../../game-ui/common/input/button/themes/dialog-button.module.scss";
import { setClipboard } from "../../../../game-ui/common/data-binding/app-bindings";
import styles from "./ExportImportDialogs.module.scss";

// Plain JSON, not base64 - escape/unescape (needed for btoa(unescape(encodeURIComponent(...))))
// aren't implemented in cohtml's JS runtime and crash the whole UI if used.
//
// Transports the theme's name + overrides map ({"name": "...", "overrides": {"--var": "value"}}),
// the same shape ThemeManager saves to disk (plus the name) - not the full CssDeclaration list
// Simple/Advanced mode renders, which carries derived/typed fields (r/g/b/a, selector, kind...) that
// only make sense alongside the game's own live CSS.

export const ExportDialog = ({
    themeName,
    overrides,
    onClose,
}: {
    themeName: string;
    overrides: Record<string, string>;
    onClose: () => void;
}) => {
    const [payload] = useState(() => JSON.stringify({ name: themeName, overrides }, null, 4));
    const { translate } = useLocalization();
    const count = Object.keys(overrides).length;

    return (
        <Dialog wide title={translate("ExtraTheme.Panel.ExportTitle", "Export theme")} onClose={onClose}
            buttons={
                <div className={styles.footer}>
                    <span className={styles.hint}>{count} {translate("ExtraTheme.Panel.VariablesCount", "variable(s)")}</span>
                    <div className={styles.dialogButtons}>
                        <Button className={DialogButtonSCSS.button} onSelect={onClose}>{translate("ExtraTheme.Panel.Close", "Close")}</Button>
                        <Button className={DialogButtonSCSS.button} onSelect={() => setClipboard(payload)}>{translate("ExtraTheme.Panel.Copy", "Copy")}</Button>
                    </div>
                </div>
            }>
            <div className={styles.subtitleRow}>
                {translate("ExtraTheme.Panel.ExportSubtitle", "Theme:")}
                <span className={styles.themeBadge}><span className={styles.themeDot} />{themeName}</span>
            </div>
            <div className={styles.exportDisplay}>{payload}</div>
        </Dialog>
    );
};

// "X (copy)", "X (copy 2)", ... until a free name is found - same convention as the C#-side fork
// naming (ThemeManager.GenerateForkName), kept identical so the app only has one such pattern.
const suggestAvailableName = (base: string, takenNames: string[]): string => {
    let candidate = `${base} (copy)`;
    for (let n = 2; takenNames.includes(candidate); n++) candidate = `${base} (copy ${n})`;
    return candidate;
};

const ImportConflictDialog = ({
    conflictingName,
    overrides,
    takenNames,
    onCancel,
    onDone,
}: {
    conflictingName: string;
    overrides: Record<string, string>;
    takenNames: string[];
    onCancel: () => void;
    onDone: () => void;
}) => {
    const [newName, setNewName] = useState(() => suggestAvailableName(conflictingName, takenNames));
    const [error, setError] = useState<string | null>(null);
    const { translate } = useLocalization();

    const overwrite = () => {
        trigger("ET", "ImportTheme", conflictingName, JSON.stringify(overrides), true);
        onDone();
    };

    const rename = () => {
        const trimmed = newName.trim();
        if (trimmed.length === 0) {
            setError(translate("ExtraTheme.Panel.RenameEmpty", "Enter a name."));
            return;
        }
        if (takenNames.includes(trimmed)) {
            setError(translate("ExtraTheme.Panel.RenameTaken", "A theme with that name already exists."));
            return;
        }
        trigger("ET", "ImportTheme", trimmed, JSON.stringify(overrides), false);
        onDone();
    };

    return (
        <Dialog title={translate("ExtraTheme.Panel.ImportConflictTitle", "A theme with that name already exists")} onClose={onCancel}
            buttons={
                <div className={styles.dialogButtonsRight}>
                    <Button className={DialogButtonSCSS.button} onSelect={onCancel}>{translate("ExtraTheme.Panel.Cancel", "Cancel")}</Button>
                    <Button className={classNames(DialogButtonSCSS.button, DialogButtonSCSS.negative)} onSelect={overwrite}>{translate("ExtraTheme.Panel.Overwrite", "Overwrite")}</Button>
                    <Button className={DialogButtonSCSS.button} onSelect={rename}>{translate("ExtraTheme.Panel.Rename", "Rename")}</Button>
                </div>
            }>
            <div className={styles.desc}>
                <span>{translate("ExtraTheme.Panel.ImportConflictDesc", "A theme named")}</span>
                <span className={styles.descStrong}>"{conflictingName}"</span>
                <span>{translate("ExtraTheme.Panel.ImportConflictDesc2", "already exists. What do you want to do?")}</span>
            </div>
            <div className={styles.fieldLabel}>{translate("ExtraTheme.Panel.ImportConflictNewName", "New name (if you choose Rename)")}</div>
            <input
                className={styles.importNameInput}
                value={newName}
                onChange={(e) => { setError(null); setNewName((e.target as HTMLInputElement).value); }}
                onKeyDown={(e) => { if (e.key === "Enter") rename(); }}
            />
            {error && <div className={styles.importError}>{error}</div>}
        </Dialog>
    );
};

export const ImportDialog = ({
    takenNames,
    onClose,
}: {
    // Every existing theme's name (built-in + user) - a fresh import always creates a NEW theme, so
    // (unlike rename) the current active theme's own name is taken too.
    takenNames: string[];
    onClose: () => void;
}) => {
    const [text, setText] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [conflict, setConflict] = useState<{ name: string; overrides: Record<string, string> } | null>(null);
    const { translate } = useLocalization();

    const doImport = () => {
        let parsed: unknown;
        try {
            parsed = JSON.parse(text);
        } catch {
            parsed = null;
        }
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
            setError(translate("ExtraTheme.Panel.ImportError", "Invalid text - this isn't recognizable JSON."));
            return;
        }

        // {name, overrides} (the current export shape) - or, for flexibility, a bare overrides map
        // with no wrapper and no name at all.
        const overridesField = (parsed as { overrides?: unknown }).overrides;
        const overrides = (overridesField && typeof overridesField === "object" && !Array.isArray(overridesField)
            ? overridesField
            : parsed) as Record<string, string>;
        const nameField = (parsed as { name?: unknown }).name;
        const name = typeof nameField === "string" && nameField.trim().length > 0
            ? nameField.trim()
            : translate("ExtraTheme.Panel.ImportDefaultName", "Imported theme") ?? "Imported theme";

        if (takenNames.includes(name)) {
            setConflict({ name, overrides });
            return;
        }

        trigger("ET", "ImportTheme", name, JSON.stringify(overrides), false);
        onClose();
    };

    // A name collision swaps this dialog's own content for the conflict resolution one (Cancel/
    // Overwrite/Rename), rather than opening a second dialog on top - only one is ever open.
    if (conflict) {
        return (
            <ImportConflictDialog
                conflictingName={conflict.name}
                overrides={conflict.overrides}
                takenNames={takenNames}
                onCancel={onClose}
                onDone={onClose}
            />
        );
    }

    return (
        <Dialog wide title={translate("ExtraTheme.Panel.ImportTitle", "Import a theme")} onClose={onClose}
            buttons={
                <div className={styles.dialogButtonsRight}>
                    <Button className={classNames(DialogButtonSCSS.button, DialogButtonSCSS.negative)} onSelect={onClose}>{translate("ExtraTheme.Panel.Cancel", "Cancel")}</Button>
                    <Button className={DialogButtonSCSS.button} onSelect={doImport}>{translate("ExtraTheme.Panel.Import", "Import")}</Button>
                </div>
            }>
            <div className={styles.desc}>{translate("ExtraTheme.Panel.ImportDesc", "Paste the exported theme below.")}</div>
            <div className={styles.textareaWrapper}>
                <textarea
                    className={styles.exportTextarea}
                    value={text}
                    onChange={(e) => { setError(null); setText((e.target as HTMLTextAreaElement).value); }}
                />
                {text.length === 0 && (
                    <span className={styles.textareaPlaceholder}>
                        {translate("ExtraTheme.Panel.ImportPlaceholder", "Paste the exported theme here (JSON)...")}
                    </span>
                )}
            </div>
            {error && <div className={styles.importError}>{error}</div>}
        </Dialog>
    );
};
