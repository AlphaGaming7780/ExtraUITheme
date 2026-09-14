import { Color } from "cs2/bindings"
import { FocusKey } from "cs2/ui"
import { getModule } from "cs2/modding"

const path$ = "game-ui/common/input/color-picker/color-field/color-field.tsx"

export type Hsva = {
	h: number,
	s: number,
	v: number,
	a: number,
}

export type PropsColorField = {
	focusKey?: FocusKey,
	disabled?: boolean,
	value: Color,
	className?: string,
	selectAction?: string,
	alpha?: boolean,
	popupDirection?: "up" | "down",
	hideHint?: boolean,
	colorWheel?: boolean,
	hexInput?: boolean,
	onChange: (value: Color) => void,
	onClick?: () => void,
	onMouseEnter?: () => void,
	onMouseLeave?: () => void,
	onOpenPicker?: () => void,
	onClosePicker?: () => void,
}

export type PropsBoundColorField = {
	parent: any,
	path: any,
	props: {
		value: Color,
		disabled?: boolean,
		showAlpha?: boolean,
	},
}

export type PropsColorCustomizeField = {
	value?: Color,
	onChange: (value: Color) => void,
	className?: string,
	onOpenPicker?: () => void,
	onClosePicker?: () => void,
}

const ColorFieldModule = getModule(path$, "ColorField");
const BoundColorFieldModule = getModule(path$, "BoundColorField");
const ColorCustomizeFieldModule = getModule(path$, "ColorCustomizeField");

export function ColorField(propsColorField: PropsColorField) : JSX.Element
{
	return <ColorFieldModule {...propsColorField} />
}

export function BoundColorField(propsBoundColorField: PropsBoundColorField) : JSX.Element
{
	return <BoundColorFieldModule {...propsBoundColorField} />
}

export function ColorCustomizeField(propsColorCustomizeField: PropsColorCustomizeField) : JSX.Element
{
	return <ColorCustomizeFieldModule {...propsColorCustomizeField} />
}

export const rgbaToHsvaWithStrongFallbackHue: (value: Color, fallbackHue: number) => Hsva = getModule(path$, "rgbaToHsvaWithStrongFallbackHue")
