// A ProxyAction-driven shortcut (see ThemeExtraPanel.cs's Undo/Redo) fires from real C#-side
// physical key state - unlike a browser keydown listener, it has no idea whether the user is
// actually typing into a text field at the moment (e.g. Ctrl+Z while editing the Rename dialog
// should hit that field's own native undo, not the theme's). Call this at the top of each
// shortcut handler and bail out if true, letting the field's own native handling run uncontested.
export const isTypingInTextControl = (): boolean => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return false;
    return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable;
};
