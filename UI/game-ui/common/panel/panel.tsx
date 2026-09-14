import { FocusKey } from "cs2/ui"
import { getModule } from "cs2/modding"
import { ReactNode } from "react"

const path$ = "game-ui/common/panel/panel.tsx"

export type PropsPanel = {
    focusKey?: FocusKey,
    header?: ReactNode,
    footer?: ReactNode,
    theme?: any,
    transition?: any,
    transitionSounds?: any,
    className?: string,
    contentClassName?: string,
    children?: ReactNode,
    onClose?: () => void,
    allowFocusExit?: boolean,
    showCloseHint?: boolean,
    hintClassName?: string,
    unfocusedHintAction?: any,
    backActionOverride?: any,
    allowLooping?: boolean,
    actionContext?: string,
    footerHintAsTooltip?: boolean,
    [x: string]: any,
}

const PanelModule = getModule(path$, "Panel")

export function Panel(propsPanel: PropsPanel): JSX.Element {
    return <PanelModule {...propsPanel} />
}
