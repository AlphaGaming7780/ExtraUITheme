import { getModule } from "cs2/modding"
import { CSSProperties, HTMLAttributes } from "react"

const path$ = "game-ui/common/image/tinted-icon.tsx"

export type PropsTintedIcon = HTMLAttributes<HTMLDivElement> & {
    src?: string,
    className?: string,
    style?: CSSProperties,
}

const TintedIconModule = getModule(path$, "TintedIcon")

// Renders `src` (e.g. "Media/Glyphs/ThickStrokeArrowRight.svg") as a CSS mask-image on a plain div,
// so it recolors via `color`/currentColor instead of being a fixed-color raster/svg image - this is
// what the game's own FoldoutItemHeader uses for its expand/collapse chevron.
export function TintedIcon(propsTintedIcon: PropsTintedIcon): JSX.Element {
    return <TintedIconModule {...propsTintedIcon} />
}
