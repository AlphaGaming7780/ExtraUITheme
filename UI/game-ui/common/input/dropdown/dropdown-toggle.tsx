import { getModule } from "cs2/modding"
import { ReactNode } from "react"
import { PropsButton } from "../button/button"

const path$ = "game-ui/common/input/dropdown/dropdown-toggle.tsx"

export type PropsDropdownToggle = PropsButton & {
    theme?: any,
    openIconComponent?: ReactNode,
    closeIconComponent?: ReactNode,
    children?: ReactNode,
}

const DropdownToggleModule = getModule(path$, "DropdownToggle")

// Meant to be used as Dropdown's `children` (the trigger) - reads DropdownContext to know if the
// dropdown is currently open and to toggle it on select.
export function DropdownToggle(propsDropdownToggle: PropsDropdownToggle): JSX.Element {
    return <DropdownToggleModule {...propsDropdownToggle} />
}

export type PropsDropdownToggleBase = PropsButton & {
    theme?: any,
    buttonTheme?: any,
    sounds?: any,
    showHint?: boolean,
    selectSound?: string,
    className?: string,
    children?: ReactNode,
}

const DropdownToggleBaseModule = getModule(path$, "DropdownToggleBase")

// Lower-level building block DropdownToggle is built on (just the themed Button wired to
// DropdownContext, without the label/indicator-icon wrapper DropdownToggle adds).
export function DropdownToggleBase(propsDropdownToggleBase: PropsDropdownToggleBase): JSX.Element {
    return <DropdownToggleBaseModule {...propsDropdownToggleBase} />
}
