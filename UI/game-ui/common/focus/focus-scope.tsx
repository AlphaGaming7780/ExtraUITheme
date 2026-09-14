import { getModule } from "cs2/modding"
import { ReactNode } from "react"

const path$ = "game-ui/common/focus/focus-scope.tsx"

const FocusScopeModule = getModule(path$, "FocusScope")

export interface FocusScopeProps {
    focusKey?: any,
    debugName?: string,
    focused?: any,
    activation?: any,
    limits?: any,
    children?: ReactNode,
}

export function FocusScope(props: FocusScopeProps): JSX.Element {
    return <FocusScopeModule {...props} />
}
