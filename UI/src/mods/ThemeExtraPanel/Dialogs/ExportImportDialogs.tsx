import { useState } from "react";
import classNames from "classnames";
import { useLocalization } from "cs2/l10n";
import { Dialog } from "../../../../game-ui/common/panel/dialog/dialog";
import { Button } from "../../../../game-ui/common/input/button/button";
import { DialogButtonSCSS } from "../../../../game-ui/common/input/button/themes/dialog-button.module.scss";
import { CssDeclaration } from "../DeclarationRow/CssDeclarationTypes";
import styles from "./ExportImportDialogs.module.scss";

// Transports the raw declaration list as JSON, not base64 - escape/unescape (needed for
// btoa(unescape(encodeURIComponent(...)))) aren't implemented in cohtml's JS runtime and crash the
// whole UI if used. There's no theme/preset diffing system yet, so this isn't a real "export a
// theme" feature yet either, just the transport mechanism.
function encodeThemePayload(declarations: CssDeclaration[]): string {
    return JSON.stringify(declarations);
}

function decodeThemePayload(text: string): CssDeclaration[] {
    return JSON.parse(text.trim());
}

export const ExportDialog = ({ declarations, onClose }: { declarations: CssDeclaration[]; onClose: () => void }) => {
    const [payload] = useState(() => encodeThemePayload(declarations));
    const { translate } = useLocalization();

    return (
        <Dialog title={translate("ExtraTheme.Panel.ExportTitle", "Export theme")} onClose={onClose}
            buttons={
                <div className={styles.dialogButtons}>
                    <Button className={DialogButtonSCSS.button} onSelect={onClose}>{translate("ExtraTheme.Panel.Close", "Close")}</Button>
                    <Button className={DialogButtonSCSS.button}
                        onSelect={() => { navigator.clipboard?.writeText(payload); }}>
                        {translate("ExtraTheme.Panel.Copy", "Copy")}
                    </Button>
                </div>
            }>
            <textarea className={styles.exportTextarea} value={payload} readOnly />
        </Dialog>
    );
};

export const ImportDialog = ({
    onClose,
    onImport,
}: {
    onClose: () => void;
    onImport: (declarations: CssDeclaration[]) => void;
}) => {
    const [text, setText] = useState("");
    const [error, setError] = useState<string | null>(null);
    const { translate } = useLocalization();

    const doImport = () => {
        try {
            const declarations = decodeThemePayload(text);
            setError(null);
            onImport(declarations);
            onClose();
        } catch {
            setError(translate("ExtraTheme.Panel.ImportError", "Invalid text - this isn't recognizable JSON."));
        }
    };

    return (
        <Dialog title={translate("ExtraTheme.Panel.ImportTitle", "Import a theme")} onClose={onClose}
            buttons={
                <div className={styles.dialogButtons}>
                    <Button className={classNames(DialogButtonSCSS.button, DialogButtonSCSS.negative)} onSelect={onClose}>{translate("ExtraTheme.Panel.Cancel", "Cancel")}</Button>
                    <Button className={DialogButtonSCSS.button} onSelect={doImport}>{translate("ExtraTheme.Panel.Import", "Import")}</Button>
                </div>
            }>
            <textarea
                className={styles.exportTextarea}
                value={text}
                onChange={(e) => setText((e.target as HTMLTextAreaElement).value)}
                placeholder={translate("ExtraTheme.Panel.ImportPlaceholder", "Paste the exported theme here (JSON)...") ?? undefined}
            />
            {error && <div className={styles.importError}>{error}</div>}
        </Dialog>
    );
};
