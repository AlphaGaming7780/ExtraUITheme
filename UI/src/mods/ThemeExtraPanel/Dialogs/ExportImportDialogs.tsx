import { useState } from "react";
import classNames from "classnames";
import { useLocalization } from "cs2/l10n";
import { trigger } from "cs2/api";
import { Button } from "../../../../game-ui/common/input/button/button";
import { DialogButtonSCSS } from "../../../../game-ui/common/input/button/themes/dialog-button.module.scss";
import { setClipboard } from "../../../../game-ui/common/data-binding/app-bindings";
import { ExtraUIThemeDialog } from "./ExtraUIThemeDialog";
import styles from "./ExportImportDialogs.module.scss";

// Plain JSON, not base64 - escape/unescape aren't implemented in cohtml's JS runtime and crash the whole UI if used.
export const ExportDialog = ({
    themeName,
    overrides,
    onClose,
}: {
    themeName: string;
    overrides: Record<string, string>;
    onClose: () => void;
}) => {
    // Same shape as a saved theme file on disk (ThemeManager.Save) - "Name"/"Overrides", not the lowercase "name"/"overrides" the UI binding uses.
    const [payload] = useState(() => JSON.stringify({ Name: themeName, Overrides: overrides }, null, 4));
    const { translate } = useLocalization();
    const count = Object.keys(overrides).length;

    return (
        <ExtraUIThemeDialog wide title={translate("ExtraUITheme.Panel.ExportTitle", "Export theme")} onClose={onClose}
            buttons={
                <div className={styles.footer}>
                    <span className={styles.hint}>{(translate("ExtraUITheme.Panel.VariablesCount", "{count} variable(s)") ?? "").replace("{count}", String(count))}</span>
                    <div className={styles.dialogButtons}>
                        <Button className={DialogButtonSCSS.button} onSelect={onClose}>{translate("ExtraUITheme.Panel.Close", "Close")}</Button>
                        <Button className={DialogButtonSCSS.button} onSelect={() => setClipboard(payload)}>{translate("ExtraUITheme.Panel.Copy", "Copy")}</Button>
                    </div>
                </div>
            }>
            <div className={styles.subtitleRow}>
                {translate("ExtraUITheme.Panel.ExportSubtitle", "Theme:")}
                <span className={styles.themeBadge}><span className={styles.themeDot} />{themeName}</span>
            </div>
            <div className={styles.exportDisplay}>{payload}</div>
        </ExtraUIThemeDialog>
    );
};

// "X (copy)", "X (copy 2)", ... - same convention as the C#-side fork naming (ThemeManager.Fork).
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
    const [descBefore, descAfter] = (translate("ExtraUITheme.Panel.ImportConflictDesc", "A theme named {name} already exists. What do you want to do?") ?? "").split("{name}");

    const overwrite = () => {
        trigger("EUT", "ImportTheme", conflictingName, JSON.stringify(overrides), true);
        onDone();
    };

    const rename = () => {
        const trimmed = newName.trim();
        if (trimmed.length === 0) {
            setError(translate("ExtraUITheme.Panel.RenameEmpty", "Enter a name."));
            return;
        }
        if (takenNames.includes(trimmed)) {
            setError(translate("ExtraUITheme.Panel.RenameTaken", "A theme with that name already exists."));
            return;
        }
        trigger("EUT", "ImportTheme", trimmed, JSON.stringify(overrides), false);
        onDone();
    };

    return (
        <ExtraUIThemeDialog title={translate("ExtraUITheme.Panel.ImportConflictTitle", "A theme with that name already exists")} onClose={onCancel}
            buttons={
                <div className={styles.dialogButtonsRight}>
                    <Button className={DialogButtonSCSS.button} onSelect={onCancel}>{translate("ExtraUITheme.Panel.Cancel", "Cancel")}</Button>
                    <Button className={classNames(DialogButtonSCSS.button, DialogButtonSCSS.negative)} onSelect={overwrite}>{translate("ExtraUITheme.Panel.Overwrite", "Overwrite")}</Button>
                    <Button className={DialogButtonSCSS.button} onSelect={rename}>{translate("ExtraUITheme.Panel.Rename", "Rename")}</Button>
                </div>
            }>
            <div className={styles.desc}>
                <span>{descBefore}</span>
                <span className={styles.descStrong}>"{conflictingName}"</span>
                <span>{descAfter}</span>
            </div>
            <div className={styles.fieldLabel}>{translate("ExtraUITheme.Panel.ImportConflictNewName", "New name (if you choose Rename)")}</div>
            <input
                className={styles.importNameInput}
                value={newName}
                onChange={(e) => { setError(null); setNewName((e.target as HTMLInputElement).value); }}
                onKeyDown={(e) => { if (e.key === "Enter") rename(); }}
            />
            {error && <div className={styles.importError}>{error}</div>}
        </ExtraUIThemeDialog>
    );
};

export const ImportDialog = ({
    takenNames,
    onClose,
}: {
    // Every existing theme's name - a fresh import always creates a NEW theme, so the active theme's own name is taken too.
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
            setError(translate("ExtraUITheme.Panel.ImportError", "Invalid text - this isn't recognizable JSON."));
            return;
        }

        // Accepts "Name"/"Overrides" (a saved theme file, or the current export shape), "name"/"overrides" (older exports,
        // and the live UI binding shape), or a bare overrides map with no wrapper.
        const record = parsed as Record<string, unknown>;
        const overridesField = record.Overrides ?? record.overrides;
        const overrides = (overridesField && typeof overridesField === "object" && !Array.isArray(overridesField)
            ? overridesField
            : parsed) as Record<string, string>;

        // Valid JSON with no recognizable "name"/"overrides" wrapper and no CSS-variable-looking entries either
        // (e.g. pasting {Name, Overrides} before that shape was supported) - the bare-map fallback above ends up holding
        // unrelated fields instead of theme data, so nothing gets imported silently unless this is caught here.
        const overrideEntries = Object.entries(overrides);
        if (overrideEntries.length === 0 || !overrideEntries.every(([key, value]) => key.startsWith("--") && typeof value === "string")) {
            setError(translate("ExtraUITheme.Panel.ImportEmptyError", "This JSON is valid, but doesn't contain any theme variables."));
            return;
        }

        const nameField = record.Name ?? record.name;
        const name = typeof nameField === "string" && nameField.trim().length > 0
            ? nameField.trim()
            : translate("ExtraUITheme.Panel.ImportDefaultName", "Imported theme") ?? "Imported theme";

        if (takenNames.includes(name)) {
            setConflict({ name, overrides });
            return;
        }

        trigger("EUT", "ImportTheme", name, JSON.stringify(overrides), false);
        onClose();
    };

    // A name collision swaps this dialog's own content for the conflict resolution one, rather than opening a second dialog.
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
        <ExtraUIThemeDialog wide title={translate("ExtraUITheme.Panel.ImportTitle", "Import a theme")} onClose={onClose}
            buttons={
                <div className={styles.dialogButtonsRight}>
                    <Button className={classNames(DialogButtonSCSS.button, DialogButtonSCSS.negative)} onSelect={onClose}>{translate("ExtraUITheme.Panel.Cancel", "Cancel")}</Button>
                    <Button className={DialogButtonSCSS.button} onSelect={doImport}>{translate("ExtraUITheme.Panel.Import", "Import")}</Button>
                </div>
            }>
            <div className={styles.desc}>{translate("ExtraUITheme.Panel.ImportDesc", "Paste the exported theme below.")}</div>
            <div className={styles.textareaWrapper}>
                <textarea
                    className={styles.exportTextarea}
                    rows={20}
                    value={text}
                    onChange={(e) => { setError(null); setText((e.target as HTMLTextAreaElement).value); }}
                />
                {text.length === 0 && (
                    <span className={styles.textareaPlaceholder}>
                        {translate("ExtraUITheme.Panel.ImportPlaceholder", "Paste the exported theme here (JSON)...")}
                    </span>
                )}
            </div>
            {error && <div className={styles.importError}>{error}</div>}
        </ExtraUIThemeDialog>
    );
};
