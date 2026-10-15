using Colossal.UI.Binding;
using ExtraUITheme.Helpers.ThemeFormat;
using System.Collections.Generic;
using System.Linq;

namespace ExtraUITheme.Helpers
{
    // Name is free text independent of FileName (on-disk identity, see ThemeManager) - keeps a Windows-invalid character from corrupting the display name.
    internal sealed class Theme : IJsonWritable, System.IEquatable<Theme>
    {
        public string Name;

        // Built-in themes (Default, BrightBlue, DarkGreyOrange) ship embedded in the DLL and can't be renamed/deleted from the UI.
        internal bool IsBuiltIn;

        public Dictionary<string, string> Overrides = new Dictionary<string, string>();

        // Variables set by hand (Advanced) - the palette never recomputes them. Every V1 variable lands here on upgrade.
        public HashSet<string> Manual = new HashSet<string>();

        // Simple mode palette: one entry per recolored group (see SetPaletteColor and PaletteCommand).
        public List<ThemeFileV2.PaletteEntry> Palette = new List<ThemeFileV2.PaletteEntry>();

        // Format version of the file this was read from; ThemeManager.Save() backs up the old file once before upgrading it.
        internal int LoadedVersion = ThemeSerializer.CurrentVersion;

        // Null until ThemeManager.Save() first succeeds for this theme; assigned once from Name and never changed again, even across later renames.
        internal string FileName;

        // Extension the file was loaded with, kept on re-save; null until first saved, when Save() picks the preferred one.
        internal string FileExtension;

        // Set by every edit (SetOverride, palette, Rename, Undo/Redo), cleared by ThemeManager.Save().
        internal bool IsDirty;

        internal void SetOverride(string variableName, string rawValue)
        {
            Overrides[variableName] = rawValue;
            Manual.Add(variableName);
            IsDirty = true;
        }

        // Reverts a variable back to inherited/default - used by Undo when the edit being undone was the first override for that variable.
        internal void RemoveOverride(string variableName)
        {
            if (!Overrides.Remove(variableName)) return;
            Manual.Remove(variableName);
            IsDirty = true;
        }

        // Simple mode: adds the entry (or replaces the one for the same group) and writes its derived values.
        internal void SetPaletteColor(ThemeFileV2.PaletteEntry entry, Dictionary<string, string> values)
        {
            Palette.RemoveAll(e => SameGroup(e, entry));
            Palette.Add(entry);
            WriteDerived(values);
            IsDirty = true;
        }

        // Simple mode's group reset: drops the entry and reverts its variables, except Manual ones.
        internal void ResetPaletteColor(ThemeFileV2.PaletteEntry entry, IEnumerable<string> names)
        {
            Palette.RemoveAll(e => SameGroup(e, entry));
            foreach (string name in names)
                if (!Manual.Contains(name)) Overrides.Remove(name);
            IsDirty = true;
        }

        // Makes a detached variable follow the palette again; null means back to the game default.
        internal void ReattachVariable(string name, string value)
        {
            Manual.Remove(name);
            if (value == null) Overrides.Remove(name);
            else Overrides[name] = value;
            IsDirty = true;
        }

        // Re-derivation after a game update; returns false when nothing changed.
        internal bool SyncPalette(IEnumerable<ThemeFileV2.PaletteEntry> palette, Dictionary<string, string> values, IEnumerable<string> removed)
        {
            ThemeState before = ThemeState.Capture(this);
            bool wasDirty = IsDirty;
            Palette = new List<ThemeFileV2.PaletteEntry>(palette);
            WriteDerived(values);
            foreach (string name in removed)
                if (!Manual.Contains(name)) Overrides.Remove(name);

            if (ThemeState.Capture(this).SameAs(before))
            {
                IsDirty = wasDirty;
                return false;
            }
            IsDirty = true;
            return true;
        }

        private void WriteDerived(Dictionary<string, string> values)
        {
            foreach (KeyValuePair<string, string> pair in values)
                if (!Manual.Contains(pair.Key)) Overrides[pair.Key] = pair.Value;
        }

        // Same group when they share an anchor; From is the fallback for anchor-less entries.
        private static bool SameGroup(ThemeFileV2.PaletteEntry a, ThemeFileV2.PaletteEntry b)
        {
            string[] anchorsA = a.Anchors ?? new string[0], anchorsB = b.Anchors ?? new string[0];
            if (anchorsA.Length == 0 || anchorsB.Length == 0) return a.From == b.From;
            return anchorsA.Intersect(anchorsB).Any();
        }

        internal void Rename(string newName)
        {
            Name = newName;
            IsDirty = true;
        }

        public void Write(IJsonWriter writer)
        {
            writer.TypeBegin(GetType().FullName);
            writer.PropertyName("name");
            writer.Write(Name);
            writer.PropertyName("isBuiltIn");
            writer.Write(IsBuiltIn);
            writer.PropertyName("overrides");
            writer.MapBegin(Overrides.Count);
            foreach (var item in Overrides)
            {
                writer.Write(item.Key);
                writer.Write(item.Value);
            }
            writer.MapEnd();
            writer.PropertyName("manual");
            writer.ArrayBegin(Manual.Count);
            foreach (string name in Manual) writer.Write(name);
            writer.ArrayEnd();
            // PascalCase keys, like the file and PaletteCommand.
            writer.PropertyName("palette");
            writer.ArrayBegin(Palette.Count);
            foreach (ThemeFileV2.PaletteEntry entry in Palette)
            {
                writer.TypeBegin(typeof(ThemeFileV2.PaletteEntry).FullName);
                writer.PropertyName("From");
                writer.Write(entry.From);
                writer.PropertyName("Anchors");
                string[] anchors = entry.Anchors ?? new string[0];
                writer.ArrayBegin(anchors.Length);
                foreach (string anchor in anchors) writer.Write(anchor);
                writer.ArrayEnd();
                writer.PropertyName("To");
                writer.Write(entry.To);
                writer.PropertyName("FollowAccentHue");
                writer.Write(entry.FollowAccentHue);
                writer.TypeEnd();
            }
            writer.ArrayEnd();
            // The exact text a saved file would hold - Export shows this so the UI never has to know the file format.
            writer.PropertyName("exportJson");
            writer.Write(ThemeSerializer.Write(this));
            // Recomputed on every write, so it always matches the current overrides (a few dictionary lookups per variable).
            writer.PropertyName("issues");
            ThemeValidator.WriteIssues(writer, ThemeValidator.Validate(this));
            writer.TypeEnd();
        }

        public bool Equals(Theme other)
        {
            if (other is null) return false;
            if (ReferenceEquals(this, other)) return true;
            if (Name != other.Name || IsBuiltIn != other.IsBuiltIn) return false;
            if (Overrides.Count != other.Overrides.Count) return false;
            if (!Manual.SetEquals(other.Manual) || Palette.Count != other.Palette.Count) return false;
            for (int i = 0; i < Palette.Count; i++)
                if (!ThemeState.SameEntry(Palette[i], other.Palette[i])) return false;
            return Overrides.All(kvp => other.Overrides.TryGetValue(kvp.Key, out string otherValue) && otherValue == kvp.Value);
        }

        public override bool Equals(object obj) => Equals(obj as Theme);

        public override int GetHashCode()
        {
            unchecked
            {
                int hash = 17;
                hash = hash * 31 + (Name?.GetHashCode() ?? 0);
                hash = hash * 31 + IsBuiltIn.GetHashCode();
                hash = hash * 31 + Overrides.Count;
                return hash;
            }
        }
    }
}
