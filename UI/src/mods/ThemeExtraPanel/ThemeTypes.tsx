// Mirrors ExtraTheme.Helpers.Theme (src/Helpers/Theme.cs). A theme is a named diff: only the CSS
// custom properties it overrides, applied over whatever the game's own :root already defines - see
// docs/ThemePanel-Design.md.
export interface Theme {
    name: string;
    isBuiltIn: boolean;
    overrides: Record<string, string>;
}
