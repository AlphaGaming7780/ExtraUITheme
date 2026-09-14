import { getModule } from "cs2/modding"
import { Context, ReactNode } from "react"

const path$ = "game-ui/common/input/dropdown/dropdown.tsx"

export type DropdownContextValue = {
    visible: boolean,
    theme: any,
    show: () => void,
    hide: () => void,
    toggle: () => void,
}
export const DropdownContext: Context<DropdownContextValue> = getModule(path$, "DropdownContext")

export const DROPDOWN_TOGGLE_KEY: any = getModule(path$, "DROPDOWN_TOGGLE_KEY")
export const DROPDOWN_MENU_KEY: any = getModule(path$, "DROPDOWN_MENU_KEY")

export type PropsDropdown = {
    focusKey?: any,
    initialFocused?: any,
    theme?: any,
    content: ReactNode,
    alignment?: any,
    children: ReactNode,
    onToggle?: (visible: boolean) => void,
}

const DropdownModule = getModule(path$, "Dropdown")

// Generic popover/menu primitive: `children` is the trigger element (typically a DropdownToggle),
// `content` is the popup body (typically a list of DropdownItem). Manages its own open/close
// state and outside-click dismissal via DropdownContext.
export function Dropdown(propsDropdown: PropsDropdown): JSX.Element {
    return <DropdownModule {...propsDropdown} />
}
