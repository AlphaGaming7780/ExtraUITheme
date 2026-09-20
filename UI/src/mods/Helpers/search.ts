// Windows-style wildcard search (`*`/`?`, not anchored), or a real regex when the pattern starts with "regex:".
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
