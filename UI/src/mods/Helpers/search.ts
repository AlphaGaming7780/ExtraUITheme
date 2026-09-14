// Windows-style wildcard search (like File Explorer's "panel*Color"), NOT regex by default: `*` =
// any run of characters (incl. none), `?` = exactly one character. Everything else is escaped so it
// matches literally. Falls back to plain substring matching when the pattern has no `*`/`?` at all.
//
// NOT anchored to the whole string (no `^`/`$`) - "panel*color" must match "panelColorNormal" (the
// documented example), which only works as a substring search: "Color" sits in the MIDDLE of
// "panelColorNormal", not at the end, so an anchored `^panel.*color$` would never match it.
//
// A pattern starting with "regex:" (case-insensitive) skips glob translation entirely and uses the
// rest as a real, user-supplied regex (case-insensitive) - an invalid regex just matches nothing
// rather than throwing.
export function matchesSearch(pattern: string, text: string): boolean {
    if (pattern.length === 0) return true;

    const regexPrefix = pattern.match(/^regex:(.*)$/is);
    if (regexPrefix) {
        try {
            return new RegExp(regexPrefix[1], "i").test(text);
        } catch {
            return false;
        }
    }

    if (!/[*?]/.test(pattern)) {
        return text.toLowerCase().includes(pattern.toLowerCase());
    }

    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    const regexSource = escaped.replace(/\*/g, ".*").replace(/\?/g, ".");

    try {
        return new RegExp(regexSource, "i").test(text);
    } catch {
        return text.toLowerCase().includes(pattern.toLowerCase());
    }
}
