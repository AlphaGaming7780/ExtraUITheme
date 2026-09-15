import { useState } from "react";
import { useLocalization } from "cs2/l10n";
import { trigger } from "cs2/api";
import { Button } from "../../../../game-ui/common/input/button/button";
import { DialogButtonSCSS } from "../../../../game-ui/common/input/button/themes/dialog-button.module.scss";
import { ExtraThemeDialog } from "./ExtraThemeDialog";
import styles from "./RenameThemeDialog.module.scss";

export const RenameThemeDialog = ({
    currentName,
    takenNames,
    onClose,
}: {
    currentName: string;
    // Every other theme's name (built-in + user, excluding currentName) - checked client-side so a
    // collision shows an inline error instead of RenameTheme silently no-oping server-side.
    takenNames: string[];
    onClose: () => void;
}) => {
    const [name, setName] = useState(currentName);
    const [error, setError] = useState<string | null>(null);
    const { translate } = useLocalization();

    const confirm = () => {
        const trimmed = name.trim();
        if (trimmed.length === 0) {
            setError(translate("ExtraTheme.Panel.RenameEmpty", "Enter a name."));
            return;
        }
        if (trimmed !== currentName && takenNames.includes(trimmed)) {
            setError(translate("ExtraTheme.Panel.RenameTaken", "A theme with that name already exists."));
            return;
        }
        if (trimmed !== currentName) trigger("ET", "RenameTheme", trimmed);
        onClose();
    };

    return (
        <ExtraThemeDialog title={translate("ExtraTheme.Panel.RenameTitle", "Rename theme")} onClose={onClose}
            buttons={
                <div className={styles.dialogButtons}>
                    <Button className={DialogButtonSCSS.button} onSelect={onClose}>{translate("ExtraTheme.Panel.Cancel", "Cancel")}</Button>
                    <Button className={DialogButtonSCSS.button} onSelect={confirm}>{translate("ExtraTheme.Panel.Rename", "Rename")}</Button>
                </div>
            }>
            <input
                className={styles.renameInput}
                value={name}
                onChange={(e) => { setError(null); setName((e.target as HTMLInputElement).value); }}
                onKeyDown={(e) => { if (e.key === "Enter") confirm(); }}
            />
            {error && <div className={styles.renameError}>{error}</div>}
        </ExtraThemeDialog>
    );
};
