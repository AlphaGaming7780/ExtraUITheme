using ExtraUITheme.Helpers.ThemeFormat;
using System.Collections.Generic;
using System.Linq;

namespace ExtraUITheme.Helpers
{
    // Everything an edit can change in a theme; one undo step stores it before and after.
    internal sealed class ThemeState
    {
        private readonly Dictionary<string, string> m_Overrides;
        private readonly HashSet<string> m_Manual;
        private readonly List<ThemeFileV2.PaletteEntry> m_Palette;

        private ThemeState(Dictionary<string, string> overrides, HashSet<string> manual, List<ThemeFileV2.PaletteEntry> palette)
        {
            m_Overrides = overrides;
            m_Manual = manual;
            m_Palette = palette;
        }

        // Deep copies: a theme of ~150 variables costs a few KB per step.
        internal static ThemeState Capture(Theme theme) => new ThemeState(
            new Dictionary<string, string>(theme.Overrides),
            new HashSet<string>(theme.Manual),
            theme.Palette.Select(Clone).ToList());

        internal void RestoreTo(Theme theme)
        {
            theme.Overrides = new Dictionary<string, string>(m_Overrides);
            theme.Manual = new HashSet<string>(m_Manual);
            theme.Palette = m_Palette.Select(Clone).ToList();
            theme.IsDirty = true;
        }

        internal bool SameAs(ThemeState other)
        {
            if (m_Overrides.Count != other.m_Overrides.Count || !m_Manual.SetEquals(other.m_Manual) || m_Palette.Count != other.m_Palette.Count) return false;
            if (m_Overrides.Any(kvp => !other.m_Overrides.TryGetValue(kvp.Key, out string value) || value != kvp.Value)) return false;
            for (int i = 0; i < m_Palette.Count; i++)
                if (!SameEntry(m_Palette[i], other.m_Palette[i])) return false;
            return true;
        }

        internal static ThemeFileV2.PaletteEntry Clone(ThemeFileV2.PaletteEntry entry) => new ThemeFileV2.PaletteEntry
        {
            From = entry.From,
            Anchors = (string[])(entry.Anchors ?? new string[0]).Clone(),
            To = entry.To,
            FollowAccentHue = entry.FollowAccentHue,
        };

        internal static bool SameEntry(ThemeFileV2.PaletteEntry a, ThemeFileV2.PaletteEntry b) =>
            a.From == b.From && a.To == b.To && a.FollowAccentHue == b.FollowAccentHue
            && (a.Anchors ?? new string[0]).SequenceEqual(b.Anchors ?? new string[0]);
    }
}
