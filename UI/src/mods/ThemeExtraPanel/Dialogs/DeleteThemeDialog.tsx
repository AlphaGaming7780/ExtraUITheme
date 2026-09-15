import classNames from "classnames";
import { useLocalization } from "cs2/l10n";
import { trigger } from "cs2/api";
import { Button } from "../../../../game-ui/common/input/button/button";
import { DialogButtonSCSS } from "../../../../game-ui/common/input/button/themes/dialog-button.module.scss";
import { ExtraThemeDialog } from "./ExtraThemeDialog";
import styles from "./DeleteThemeDialog.module.scss";

export const DeleteThemeDialog = ({ themeName, onClose }: { themeName: string; onClose: () => void }) => {
    const { translate } = useLocalization();

    const confirmDelete = () => {
        trigger("ET", "DeleteTheme");
        onClose();
    };

    return (
        <ExtraThemeDialog title={translate("ExtraTheme.Panel.DeleteTitle", "Delete theme")} onClose={onClose}
            buttons={
                <div className={styles.dialogButtons}>
                    <Button className={DialogButtonSCSS.button} onSelect={onClose}>{translate("ExtraTheme.Panel.Cancel", "Cancel")}</Button>
                    <Button className={classNames(DialogButtonSCSS.button, DialogButtonSCSS.negative)} onSelect={confirmDelete}>{translate("ExtraTheme.Panel.Delete", "Delete")}</Button>
                </div>
            }>
            <div className={styles.desc}>
                <span>{translate("ExtraTheme.Panel.DeleteDesc", "Permanently delete")}</span>
                <span className={styles.descStrong}>"{themeName}"</span>
                <span>{translate("ExtraTheme.Panel.DeleteDesc2", "? This can't be undone.")}</span>
            </div>
        </ExtraThemeDialog>
    );
};
