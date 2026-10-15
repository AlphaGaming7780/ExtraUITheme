// Mirrors ExtraUITheme.Helpers.Theme (src/Helpers/Theme.cs) - a named diff of :root overrides.
export interface Theme {
    name: string;
    isBuiltIn: boolean;
    overrides: Record<string, string>;
    // Variables edited in Advanced: Simple mode's palette never writes them.
    manual: string[];
    // Simple mode's recolored groups.
    palette: PaletteEntry[];
    // The theme as a saved file would hold it (ThemeSerializer.Write) - Export shows this verbatim.
    exportJson: string;
    // ThemeValidator's report against the game's current index.css - recomputed by C# on every theme update.
    issues: ThemeIssue[];
}

// Mirrors ThemeFileV2.PaletteEntry, PascalCase like the file.
export interface PaletteEntry {
    // Principal color of the group in the game CSS the entry was made against, "rgb(r,g,b)".
    From: string;
    // Variables identifying the group (principal first), tried before From.
    Anchors: string[];
    // The user's color for the principal, "rgb(r,g,b)".
    To: string;
    // Old hue link, no longer offered: always false in new entries.
    FollowAccentHue: boolean;
}

// Same order/values as ThemeIssueKind in src/Helpers/ThemeFormat/ThemeValidator.cs.
export enum ThemeIssueKind {
    Missing,
    InvalidValue,
    KindChanged,
    BrokenReference,
    Redundant,
}

export interface ThemeIssue {
    name: string;
    kind: ThemeIssueKind;
    themeValue: string;
    // Modern UI game default, "" when the variable is missing.
    gameValue: string;
}

// Redundant is info only - every other kind is a warning.
export const isWarning = (issue: ThemeIssue) => issue.kind !== ThemeIssueKind.Redundant;

// Same order/values as ImportStatus in src/Helpers/ThemeFormat/ImportReport.cs.
export enum ImportStatus {
    Ok,
    TooNew,
    Invalid,
    Empty,
}

export interface ImportReport {
    status: ImportStatus;
    // "" when the pasted JSON has no name.
    name: string;
    overrideCount: number;
    issues: ThemeIssue[];
}
