// Mirrors ExtraUITheme.Helpers.Theme (src/Helpers/Theme.cs) - a named diff of :root overrides.
export interface Theme {
    name: string;
    isBuiltIn: boolean;
    overrides: Record<string, string>;
    // The theme as a saved file would hold it (ThemeSerializer.Write) - Export shows this verbatim.
    exportJson: string;
}
