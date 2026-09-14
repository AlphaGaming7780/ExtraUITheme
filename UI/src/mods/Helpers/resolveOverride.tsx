// Best-effort re-derivation of a CssDeclaration's typed fields (r/g/b/a, number/unit,
// referencedVariable) from an override's raw string - mirrors (a simplified subset of)
// CssVariableExtractor.Classify() on the C# side, since the row components render from those
// typed fields, not from rawValue alone (e.g. UnitDeclarationRow shows `number unit`, not
// rawValue). Falls back to just patching rawValue when the override doesn't match a recognized
// shape (e.g. `rgba(0,0,0,var(--panelOpacityDark))` - a var() reference nested inside a color
// component isn't resolved here) - the row keeps its base swatch/number in that case, which is a
// reasonable degradation since the text itself still shows the real override.
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

    const rgb = raw.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i);
    if (rgb) {
        patch.r = parseFloat(rgb[1]) / 255;
        patch.g = parseFloat(rgb[2]) / 255;
        patch.b = parseFloat(rgb[3]) / 255;
        patch.a = rgb[4] !== undefined ? parseFloat(rgb[4]) : 1;
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
