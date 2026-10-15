using System.Collections.Generic;

namespace ExtraUITheme.Helpers.ThemeFormat
{
    // Frozen once released. Overrides keeps every final value (palette-derived ones too) so a mod build that only knows V1 still renders the theme.
    internal sealed class ThemeFileV2
    {
        public int Version = 2;
        public string Name;
        public Dictionary<string, string> Overrides = new Dictionary<string, string>();

        // Variables edited by hand in Advanced ("detached"): never recomputed from the palette.
        public string[] Manual = new string[0];

        // The Simple mode's intent ("this game color becomes that one"), re-derived against the current game CSS on load.
        public PaletteEntry[] Palette = new PaletteEntry[0];

        internal sealed class PaletteEntry
        {
            // Principal color of the group in the game CSS the theme was made against.
            public string From;
            // Variables that identify the group, tried before From when matching against a newer game CSS.
            public string[] Anchors = new string[0];
            public string To;
            public bool FollowAccentHue;
        }

        internal Theme ToTheme() => new Theme
        {
            Name = Name,
            Overrides = Overrides ?? new Dictionary<string, string>(),
            Manual = new HashSet<string>(Manual ?? new string[0]),
            Palette = new List<PaletteEntry>(Palette ?? new PaletteEntry[0]),
        };

        internal static ThemeFileV2 FromTheme(Theme theme)
        {
            List<string> manual = new List<string>(theme.Manual);
            manual.Sort(System.StringComparer.Ordinal);
            return new ThemeFileV2
            {
                Name = theme.Name,
                Overrides = theme.Overrides,
                Manual = manual.ToArray(),
                Palette = theme.Palette.ToArray(),
            };
        }
    }
}
