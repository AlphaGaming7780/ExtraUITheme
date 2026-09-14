import { getModule } from "cs2/modding"
import { Context, ReactNode } from "react"

const path$ = "game-ui/common/panel/dialog/dialog.tsx"

export type PropsDialog = {
    wide?: boolean,
    title?: ReactNode,
    content?: ReactNode,
    buttons?: ReactNode,
    theme?: any,
    zIndex?: number,
    onClose?: () => void,
    initialFocus?: any,
    children?: ReactNode,
}

const DialogModule = getModule(path$, "Dialog")

// Renders its own full-screen PanelBackdrop + Panel - no need to wrap it in either yourself.
// title -> header row, children -> body/message area, content/buttons -> footer action row.
export function Dialog(propsDialog: PropsDialog): JSX.Element {
    return <DialogModule {...propsDialog} />
}

// Optional imperative stacking system, only needed if dialogs should be pushed/popped from
// outside a simple `{open && <Dialog>...}` render - not required for a single controlled dialog.
//
// Naming note (matches the game's own public names, which are swapped from what they'd suggest):
// DialogStack is the context holding {showDialog, closeAll}; DialogContext is the context a
// dialog's own content reads {onClose} from; DialogRenderer is the actual provider component to
// wrap around your app root; DialogController is a small helper a dialog's content can render to
// auto-close it when some condition (`required`) goes false.
export type DialogStackContextValue = {
    showDialog: (dialog: ReactNode) => void,
    closeAll: () => void,
}
export const DialogStack: Context<DialogStackContextValue> = getModule(path$, "DialogStack")

export type DialogContextValue = {
    onClose: () => void,
}
export const DialogContext: Context<DialogContextValue> = getModule(path$, "DialogContext")

export type PropsDialogRenderer = {
    children?: ReactNode,
}
const DialogRendererModule = getModule(path$, "DialogRenderer")
export function DialogRenderer(propsDialogRenderer: PropsDialogRenderer): JSX.Element {
    return <DialogRendererModule {...propsDialogRenderer} />
}

export type PropsDialogController = {
    required: boolean,
}
const DialogControllerModule = getModule(path$, "DialogController")
export function DialogController(propsDialogController: PropsDialogController): JSX.Element {
    return <DialogControllerModule {...propsDialogController} />
}
