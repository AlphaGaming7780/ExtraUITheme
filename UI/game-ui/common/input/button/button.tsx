import { FocusKey } from "cs2/ui"
import { getModule } from "cs2/modding"
import { ReactNode } from "react"

const path$ = "game-ui/common/input/button/button.tsx"

export type ButtonSounds = {
    select?: string,
    hover?: string,
    focus?: string,
}

export type PropsButton = {
    focusKey?: FocusKey,
    debugName?: string,
    selected?: boolean,
    disabled?: boolean,
    theme?: any,
    sounds?: ButtonSounds,
    selectAction?: string,
    selectSound?: string,
    className?: string,
    tooltipLabel?: ReactNode,
    disableHint?: boolean,
    onClick?: (e: any) => void,
    onMouseEnter?: (e: any) => void,
    onSelect?: () => void,
    children?: ReactNode,
    as?: string,
    hintAction?: string,
    actionContext?: string,
    forceHint?: boolean,
    shortcut?: any,
    allowFocusableChildren?: boolean,
    [x: string]: any,
}

export const defaultButtonSounds: ButtonSounds = getModule(path$, "defaultButtonSounds")

const ButtonModule = getModule(path$, "Button")

// The generic button primitive used throughout the game's UI - themed via `theme`/`className`
// (e.g. DialogButtonSCSS for the dialog Yes/No look, with DialogButtonSCSS.negative added for the
// "No"/destructive variant).
export function Button(propsButton: PropsButton): JSX.Element {
    return <ButtonModule {...propsButton} />
}
