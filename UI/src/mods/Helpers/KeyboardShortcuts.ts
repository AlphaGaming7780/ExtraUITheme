// C#-side ProxyAction shortcuts fire on raw key state with no idea whether a text field has focus - call this first and bail out if true so native undo/redo in that field isn't hijacked.
export const isTypingInTextControl = (): boolean => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return false;
    return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable;
};
