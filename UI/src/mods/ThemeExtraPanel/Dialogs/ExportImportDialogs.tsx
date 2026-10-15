import { useEffect, useState } from "react";
import classNames from "classnames";
import { useLocalization } from "cs2/l10n";
import { bindEvent, trigger } from "cs2/api";
import { Button } from "../../../../game-ui/common/input/button/button";
import { DialogButtonSCSS } from "../../../../game-ui/common/input/button/themes/dialog-button.module.scss";
import { setClipboard } from "../../../../game-ui/common/data-binding/app-bindings";
import { ExtraUIThemeDialog } from "./ExtraUIThemeDialog";
import { ImportReport, ImportStatus } from "../ThemeTypes";
import { countWarnings, ThemeIssueList } from "./ThemeIssuesReport";
import styles from "./ExportImportDialogs.module.scss";

// Reply to the AnalyzeImport trigger (ThemeExtraPanel.cs).
const onImportAnalyzed$ = bindEvent<ImportReport>("EUT", "OnImportAnalyzed");

// Plain JSON, not base64 - escape/unescape aren't implemented in cohtml's JS runtime and crash the whole UI if used.
export const ExportDialog = ({
    themeName,
    overrides,
    payload: livePayload,
    onClose,
}: {
    themeName: string;
    overrides: Record<string, string>;
    // Built C#-side (ThemeSerializer.Write), so the export is always exactly the current file format.
    payload: string;
    onClose: () => void;
}) => {
    // Frozen at open - the dialog shows a snapshot, like the copy it offers.
    const [payload] = useState(livePayload);
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
    themeJson,
    takenNames,
    onCancel,
    onDone,
}: {
    conflictingName: string;
    themeJson: string;
    takenNames: string[];
    onCancel: () => void;
    onDone: () => void;
}) => {
    const [newName, setNewName] = useState(() => suggestAvailableName(conflictingName, takenNames));
    const [error, setError] = useState<string | null>(null);
    const { translate } = useLocalization();
    const [descBefore, descAfter] = (translate("ExtraUITheme.Panel.ImportConflictDesc", "A theme named {name} already exists. What do you want to do?") ?? "").split("{name}");

    const overwrite = () => {
        trigger("EUT", "ImportTheme", conflictingName, themeJson, true);
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
        trigger("EUT", "ImportTheme", trimmed, themeJson, false);
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
    // Set while C# analyzes the pasted text - ignores replies to an earlier click.
    const [analyzing, setAnalyzing] = useState(false);
    // Shown instead of the paste view when the analysis found warnings.
    const [report, setReport] = useState<ImportReport | null>(null);
    const [conflict, setConflict] = useState<string | null>(null);
    const { translate } = useLocalization();

    // After the report (or straight away without warnings): name resolution, then the conflict check, then the import itself.
    const proceed = (analyzed: ImportReport) => {
        const name = analyzed.name.trim().length > 0
            ? analyzed.name.trim()
            : translate("ExtraUITheme.Panel.ImportDefaultName", "Imported theme") ?? "Imported theme";

        if (takenNames.includes(name)) {
            setReport(null);
            setConflict(name);
            return;
        }

        // The raw text - C# runs it through the same versioned reader as a file on disk.
        trigger("EUT", "ImportTheme", name, text, false);
        onClose();
    };

    // Every check (JSON shape, version, CSS variable names, game data) is C#'s ImportReport.Analyze - one source of truth with the file loader.
    useEffect(() => {
        if (!analyzing) return;
        const sub = onImportAnalyzed$.subscribe((analyzed: ImportReport) => {
            setAnalyzing(false);
            switch (analyzed.status) {
                case ImportStatus.Invalid:
                    setError(translate("ExtraUITheme.Panel.ImportError", "Invalid text - this isn't recognizable JSON."));
                    return;
                case ImportStatus.TooNew:
                    setError(translate("ExtraUITheme.Panel.ImportTooNewError", "This theme was made with a newer version of the mod. Update the mod to import it."));
                    return;
                case ImportStatus.Empty:
                    setError(translate("ExtraUITheme.Panel.ImportEmptyError", "This JSON is valid, but doesn't contain any theme variables."));
                    return;
            }
            if (countWarnings(analyzed.issues) > 0) setReport(analyzed);
            else proceed(analyzed);
        });
        trigger("EUT", "AnalyzeImport", text);
        return () => sub.dispose();
    }, [analyzing]);

    const doImport = () => {
        if (text.trim().length === 0) {
            setError(translate("ExtraUITheme.Panel.ImportError", "Invalid text - this isn't recognizable JSON."));
            return;
        }
        setError(null);
        setAnalyzing(true);
    };

    // A name collision swaps this dialog's own content for the conflict resolution one, rather than opening a second dialog.
    if (conflict) {
        return (
            <ImportConflictDialog
                conflictingName={conflict}
                themeJson={text}
                takenNames={takenNames}
                onCancel={onClose}
                onDone={onClose}
            />
        );
    }

    // Same swap for the report: it comes before the name conflict, so cancelling here never leaves a half-resolved import.
    if (report) {
        const warnings = countWarnings(report.issues);
        return (
            <ExtraUIThemeDialog wide title={translate("ExtraUITheme.Panel.ImportReportTitle", "This theme doesn't fully match the game")} onClose={onClose}
                buttons={
                    <div className={styles.dialogButtonsRight}>
                        <Button className={DialogButtonSCSS.button} onSelect={onClose}>{translate("ExtraUITheme.Panel.Cancel", "Cancel")}</Button>
                        <Button className={DialogButtonSCSS.button} onSelect={() => proceed(report)}>{translate("ExtraUITheme.Panel.ImportAnyway", "Import anyway")}</Button>
                    </div>
                }>
                <div className={styles.desc}>
                    <span>{(translate("ExtraUITheme.Panel.ImportReportDesc", "{count} of its {total} variable(s) don't match the current game. They can be cleaned up later from the panel.") ?? "")
                        .replace("{count}", String(warnings)).replace("{total}", String(report.overrideCount))}</span>
                </div>
                <ThemeIssueList issues={report.issues} />
            </ExtraUIThemeDialog>
        );
    }

    return (
        <ExtraUIThemeDialog wide title={translate("ExtraUITheme.Panel.ImportTitle", "Import a theme")} onClose={onClose}
            buttons={
                <div className={styles.dialogButtonsRight}>
                    <Button className={classNames(DialogButtonSCSS.button, DialogButtonSCSS.negative)} onSelect={onClose}>{translate("ExtraUITheme.Panel.Cancel", "Cancel")}</Button>
                    <Button className={DialogButtonSCSS.button} disabled={analyzing} onSelect={doImport}>
                        {analyzing ? translate("ExtraUITheme.Panel.Analyzing", "Checking...") : translate("ExtraUITheme.Panel.Import", "Import")}
                    </Button>
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
