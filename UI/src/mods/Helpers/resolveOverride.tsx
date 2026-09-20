// Best-effort re-derivation of a CssDeclaration's typed fields from an override's raw string - mirrors CssVariableExtractor.Classify() on the C# side.
export function resolveOverrideFields(overrideRaw: string): Record<string, unknown> {
    const raw = overrideRaw.trim();
    const patch: Record<string, unknown> = { rawValue: overrideRaw };

    const hex = raw.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/);
    if (hex) {
        let h = hex[1];
        if (h.length === 3 || h.length === 4) h = h.split("").map((c) => c + c).join("");
        patch.r = parseInt(h.slice(0, 2), 16) / 255;
        patch.g = parseInt(h.slice(2, 4), 16) / 255;
        patch.b = parseInt(h.slice(4, 6), 16) / 255;
        patch.a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
        return patch;
    }

    // Alpha accepts a var() reference too - `a` stays a 1.0 display stand-in when it's a reference, same as the C# side.
    const rgb = raw.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*(?:([\d.]+)|var\(\s*(--[a-zA-Z0-9_-]+)\s*\))\s*)?\)$/i);
    if (rgb) {
        patch.r = parseFloat(rgb[1]) / 255;
        patch.g = parseFloat(rgb[2]) / 255;
        patch.b = parseFloat(rgb[3]) / 255;
        patch.a = rgb[4] !== undefined ? parseFloat(rgb[4]) : 1;
        patch.alphaVarRef = rgb[5] ?? "";
        return patch;
    }

    const unit = raw.match(/^(-?[\d.]+)([a-zA-Z%]+)$/);
    if (unit) {
        patch.number = parseFloat(unit[1]);
        patch.unit = unit[2];
        return patch;
    }

    if (/^-?[\d.]+$/.test(raw)) {
        patch.number = parseFloat(raw);
        return patch;
    }

    const varRef = raw.match(/^var\((--[a-zA-Z0-9_-]+)\)$/);
    if (varRef) {
        patch.referencedVariable = varRef[1];
        return patch;
    }

    return patch;
}
