using Colossal.Json;

namespace ExtraUITheme.Helpers.ThemeFormat
{
    internal enum ThemeReadStatus
    {
        Ok,
        // Written by a newer build of the mod - nothing is loaded, and the file must never be rewritten.
        TooNew,
        Invalid,
    }

    // Every theme JSON (file, mod-bundled .eutjson, embedded built-in, pasted import) goes through Read: each version is decoded with its own frozen class, then upgraded one step at a time up to the current one.
    internal static class ThemeSerializer
    {
        internal const int CurrentVersion = 2;

        // sourceVersion is the version the JSON was written in (1 when it has no "Version"), so a later save knows it's upgrading the file.
        internal static ThemeReadStatus Read(string json, out Theme theme, out int sourceVersion)
        {
            theme = null;
            sourceVersion = 0;

            if (!(Decoder.Decode(json) is ProxyObject root)) return ThemeReadStatus.Invalid;

            Variant versionField = root.TryGet("Version");
            sourceVersion = versionField is ProxyNumber ? versionField.Make<int>() : 1;
            if (sourceVersion > CurrentVersion) return ThemeReadStatus.TooNew;
            if (sourceVersion < 1) return ThemeReadStatus.Invalid;

            // Each case falls through the upgrades of every later version - a new V3 adds a case and one Upgrade() on ThemeFileV2.
            ThemeFileV2 v2 = sourceVersion switch
            {
                1 => ThemeFileV1.Read(root).Upgrade(),
                _ => root.Make<ThemeFileV2>(),
            };

            theme = v2.ToTheme();
            return ThemeReadStatus.Ok;
        }

        // Always writes the current version.
        internal static string Write(Theme theme) => Encoder.Encode(ThemeFileV2.FromTheme(theme), EncodeOptions.None);
    }
}
