import { ReactNode, useEffect } from "react";
import { Dialog } from "../../../../game-ui/common/panel/dialog/dialog";
import styles from "./ExtraUIThemeDialog.module.scss";

// Marks <body> only while one of this panel's own dialogs is mounted, so the :global(.dialog_E8_) width override stays scoped to us.
let openCount = 0;
const useDialogOpenClass = () => {
    useEffect(() => {
        if (openCount++ === 0) document.body.classList.add("eut-dialog-open");
        return () => {
            if (--openCount === 0) document.body.classList.remove("eut-dialog-open");
        };
    }, []);
};

// Shared wrapper around the game's own Dialog - caps `children` to --eutDialogMaxWidth/--eutDialogMaxHeight so content can't spill past the panel.
export const ExtraUIThemeDialog = ({
    title,
    wide,
    buttons,
    onClose,
    children,
}: {
    title: ReactNode;
    wide?: boolean;
    buttons: ReactNode;
    onClose: () => void;
    children: ReactNode;
}) => {
    useDialogOpenClass();
    return (
        <Dialog wide={wide} title={title} onClose={onClose} buttons={buttons}>
            <div className={styles.dialogBody}>{children}</div>
        </Dialog>
    );
};
