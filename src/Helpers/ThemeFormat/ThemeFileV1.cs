using Colossal.Json;
using System.Collections.Generic;

namespace ExtraUITheme.Helpers.ThemeFormat
{
    // Frozen: the format every file had before "Version" existed. Never change this class - add a new version instead.
    internal sealed class ThemeFileV1
    {
        public string Name;
        public Dictionary<string, string> Overrides = new Dictionary<string, string>();

        // Accepts "Name"/"Overrides", the lowercase "name"/"overrides" of older exports, and a bare overrides map (embedded built-ins).
        internal static ThemeFileV1 Read(ProxyObject root)
        {
            Variant overrides = root.TryGet("Overrides") ?? root.TryGet("overrides");
            Variant name = root.TryGet("Name") ?? root.TryGet("name");

            return new ThemeFileV1
            {
                Name = name is ProxyString ? name.Make<string>() : null,
                // Only a file with no Name either is a bare map - otherwise "Name" itself would end up as a variable.
                Overrides = (overrides ?? (name == null ? root : null))?.Make<Dictionary<string, string>>() ?? new Dictionary<string, string>(),
            };
        }

        // Nothing in V1 says which values came from a palette, so every variable is a manual edit.
        internal ThemeFileV2 Upgrade() => new ThemeFileV2
        {
            Name = Name,
            Overrides = new Dictionary<string, string>(Overrides),
            Manual = new List<string>(Overrides.Keys).ToArray(),
            Palette = new ThemeFileV2.PaletteEntry[0],
        };
    }
}
