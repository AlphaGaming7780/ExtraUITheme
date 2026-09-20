import classNames from "classnames";
import { useLocalization } from "cs2/l10n";
import { trigger } from "cs2/api";
import { Button } from "../../../../game-ui/common/input/button/button";
import { DialogButtonSCSS } from "../../../../game-ui/common/input/button/themes/dialog-button.module.scss";
import { ExtraUIThemeDialog } from "./ExtraUIThemeDialog";
import styles from "./DeleteThemeDialog.module.scss";

export const DeleteThemeDialog = ({ themeName, onClose }: { themeName: string; onClose: () => void }) => {
    const { translate } = useLocalization();

    const confirmDelete = () => {
        trigger("EUT", "DeleteTheme");
        onClose();
    };

    return (
        <ExtraUIThemeDialog title={translate("ExtraUITheme.Panel.DeleteTitle", "Delete theme")} onClose={onClose}
            buttons={
                <div className={styles.dialogButtons}>
                    <Button className={DialogButtonSCSS.button} onSelect={onClose}>{translate("ExtraUITheme.Panel.Cancel", "Cancel")}</Button>
                    <Button className={classNames(DialogButtonSCSS.button, DialogButtonSCSS.negative)} onSelect={confirmDelete}>{translate("ExtraUITheme.Panel.Delete", "Delete")}</Button>
                </div>
            }>
            <div className={styles.desc}>
                <span>{translate("ExtraUITheme.Panel.DeleteDesc", "Permanently delete")}</span>
                <span className={styles.descStrong}>"{themeName}"</span>
                <span>{translate("ExtraUITheme.Panel.DeleteDesc2", "? This can't be undone.")}</span>
            </div>
        </ExtraUIThemeDialog>
    );
};
