import { getModule } from "cs2/modding"
import { ReactNode } from "react"

const path$ = "game-ui/common/panel/panel-backdrop.tsx"

export type PropsPanelBackdrop = {
    className?: string,
    children?: ReactNode,
    zIndex?: number,
    onMouseDown?: () => void,
}

const PanelBackdropModule = getModule(path$, "PanelBackdrop")

export function PanelBackdrop(propsPanelBackdrop: PropsPanelBackdrop): JSX.Element {
    return <PanelBackdropModule {...propsPanelBackdrop} />
}

// Returns { zIndex: 10000 } when called from inside an already-open PanelBackdrop (nested
// backdrops stack above it), or undefined otherwise - matches Dialog's own usage.
export const usePanelBackdropStyle: () => { zIndex: number } | undefined = getModule(path$, "usePanelBackdropStyle")
