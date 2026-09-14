import { getModule } from "cs2/modding"
import { ReactNode } from "react"
import { ButtonSounds } from "../../button/button"

const path$ = "game-ui/common/input/dropdown/items/dropdown-item.tsx"

export const defaultDropdownItemSounds: ButtonSounds = getModule(path$, "defaultDropdownItemSounds")

export type PropsDropdownItem<T = any> = {
    focusKey?: any,
    value: T,
    disabled?: boolean,
    icon?: string,
    iconTint?: boolean,
    selected?: boolean,
    hasIcons?: boolean,
    theme?: any,
    sounds?: ButtonSounds,
    className?: string,
    // Fires with `value` when the item is clicked while NOT selected.
    onChange?: (value: T) => void,
    // Fires with `value` when the item is clicked while already selected.
    onToggleSelected?: (value: T) => void,
    closeOnSelect?: boolean,
    tooltip?: ReactNode,
    children?: ReactNode,
}

const DropdownItemModule = getModule(path$, "DropdownItem")

export function DropdownItem<T = any>(propsDropdownItem: PropsDropdownItem<T>): JSX.Element {
    return <DropdownItemModule {...propsDropdownItem} />
}
