using Colossal.UI.Binding;
using ExtraUITheme.Helpers.ThemeFormat;
using System.Collections.Generic;

namespace ExtraUITheme.Helpers
{
    // Palette triggers' payload (PascalCase, like the theme file); the UI does the color math, C# stores it. Every key is optional.
    internal sealed class PaletteCommand : IJsonReadable
    {
        // Built directly: ValueReaders.Create fails on DictionaryReader (no parameterless constructor).
        private static readonly IReader<Dictionary<string, string>> kValuesReader = new DictionaryReader<string, string>();
        private static readonly IReader<string[]> kNamesReader = new ArrayReader<string>();

        // SetPaletteColor: the entry to add or replace. ResetPaletteColor: only its Anchors are used, to find the entry.
        public ThemeFileV2.PaletteEntry Entry;

        // SyncPalette: the whole palette after re-matching against the current game CSS (orphans included, unchanged).
        public ThemeFileV2.PaletteEntry[] Palette;

        // Derived values to write; Manual variables in here are skipped.
        public Dictionary<string, string> Values = new Dictionary<string, string>();

        // ResetPaletteColor: variables to revert. SyncPalette: derived variables gone from their group.
        public string[] Names = new string[0];

        public void Read(IJsonReader reader)
        {
            reader.ReadMapBegin();
            if (HasValue(reader, "Entry")) Entry = ReadEntry(reader);
            if (HasValue(reader, "Palette"))
            {
                ulong count = reader.ReadArrayBegin();
                Palette = new ThemeFileV2.PaletteEntry[count];
                for (ulong i = 0; i < count; i++)
                {
                    reader.ReadArrayElement(i);
                    Palette[i] = ReadEntry(reader);
                }
                reader.ReadArrayEnd();
            }
            if (HasValue(reader, "Values")) kValuesReader.Read(reader, out Values);
            if (HasValue(reader, "Names")) kNamesReader.Read(reader, out Names);
            reader.ReadMapEnd();
        }

        // PaletteEntry stays a plain file class, read here.
        private static ThemeFileV2.PaletteEntry ReadEntry(IJsonReader reader)
        {
            ThemeFileV2.PaletteEntry entry = new ThemeFileV2.PaletteEntry();
            reader.ReadMapBegin();
            if (HasValue(reader, "From")) reader.Read(out entry.From);
            if (HasValue(reader, "Anchors")) kNamesReader.Read(reader, out entry.Anchors);
            if (HasValue(reader, "To")) reader.Read(out entry.To);
            if (HasValue(reader, "FollowAccentHue")) reader.Read(out entry.FollowAccentHue);
            reader.ReadMapEnd();
            return entry;
        }

        // Moves to `name`; false when the key is missing, or null (skipped) - the field then keeps its default.
        private static bool HasValue(IJsonReader reader, string name)
        {
            if (!reader.ReadProperty(name)) return false;
            if (reader.PeekValueType() != cohtml.Net.ValueType.Null) return true;
            reader.SkipValue();
            return false;
        }
    }
}
