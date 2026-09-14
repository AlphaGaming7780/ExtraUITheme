import { getModule } from "cs2/modding"

const path$ = "game-ui/common/data-binding/app-bindings.ts"

// The game's own clipboard write - not the standard `navigator.clipboard` API, which isn't
// implemented in cohtml (confirmed in-game: writeText() silently no-ops).
export const setClipboard: (text: string) => void = getModule(path$, "setClipboard")
