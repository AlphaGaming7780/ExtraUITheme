import { getModule } from "cs2/modding"

const path$ = "game-ui/common/input/color-picker/color-field/color-field.module.scss"

export type PropsColorFieldSCSS = {
    colorField: string
    alpha: string
    disabled: string
    wrapper: string
    colorPickerContainer: string
    boundColorField: string
    hint: string
}

export const ColorFieldSCSS: PropsColorFieldSCSS = getModule(path$, "classes")
