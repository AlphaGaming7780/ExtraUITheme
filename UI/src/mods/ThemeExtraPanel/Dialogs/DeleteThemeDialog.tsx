import classNames from "classnames";
import { useLocalization } from "cs2/l10n";
import { trigger } from "cs2/api";
import { Button } from "../../../../game-ui/common/input/button/button";
import { DialogButtonSCSS } from "../../../../game-ui/common/input/button/themes/dialog-button.module.scss";
import { ExtraUIThemeDialog } from "./ExtraUIThemeDialog";
import styles from "./DeleteThemeDialog.module.scss";

export const DeleteThemeDialog = ({ themeName, onClose }: { themeName: string; onClose: () => void }) => {
    const { translate } = useLocalization();
    const [descBefore, descAfter] = (translate("ExtraUITheme.Panel.DeleteDesc", "Permanently delete {name}? This can't be undone.") ?? "").split("{name}");

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
                <span>{descBefore}</span>
                <span className={styles.descStrong}>"{themeName}"</span>
                <span>{descAfter}</span>
            </div>
        </ExtraUIThemeDialog>
    );
};
