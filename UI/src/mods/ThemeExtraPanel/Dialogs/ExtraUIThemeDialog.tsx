import { ReactNode, useEffect } from "react";
import { Dialog } from "../../../../game-ui/common/panel/dialog/dialog";
import styles from "./ExtraUIThemeDialog.module.scss";

// Marks <body> only while one of this panel's own dialogs is mounted - scopes the module's own
// :global(.dialog_E8_) width override to just that window, instead of it applying to every dialog in
// the whole game forever (dialog_E8_ is the generic game Dialog's own class, not something scoped to
// ExtraUITheme - see that rule's comment). Multiple of our dialogs are never open at once in practice
// (ImportDialog swaps itself for ImportConflictDialog rather than stacking), but the counter still
// makes this safe if that ever changed.
let openCount = 0;
const useDialogOpenClass = () => {
    useEffect(() => {
        if (openCount++ === 0) document.body.classList.add("eut-dialog-open");
        return () => {
            if (--openCount === 0) document.body.classList.remove("eut-dialog-open");
        };
    }, []);
};

// Shared wrapper around the game's own Dialog - every one of this panel's modals (Export, Import,
// ImportConflict, Rename, Delete) should go through this instead of calling Dialog directly, so
// they all get the same body-sizing behavior for free. `children` goes into a wrapper div capped to
// --eutDialogMaxWidth/--eutDialogMaxHeight (see usePanelDialogBounds.ts); the module's own
// :global(.dialog_E8_) rule forces the actual outer chrome to that same width (its own CSS sets a
// fixed width regardless of `wide`/content - see that rule's comment) - without both, a dialog's own
// fixed-size content (e.g. Export's JSON display) could render larger than the whole ExtraUITheme
// panel at its minimum size, spilling past the panel's own edges.
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
