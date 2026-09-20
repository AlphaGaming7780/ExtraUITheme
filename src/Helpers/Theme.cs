using Colossal.UI.Binding;
using System.Collections.Generic;
using System.Linq;

namespace ExtraUITheme.Helpers
{
    // A theme's Name is free text (whatever the user typed), independent of FileName (its on-disk
    // identity - see ThemeManager). Two separate things on purpose: Name used to be derived from
    // the (sanitized) filename, so a Windows-invalid character in a typed name silently corrupted
    // the name itself.
    //
    // Decoded/encoded directly by ThemeManager via Colossal.Json (Decoder.Decode(json).Make<Theme>()
    // / Encoder.Encode(theme, ...)) - confirmed in the decompiled Colossal.Core source
    // (Colossal.Json/JSON.cs, Extensions.cs) that this is safe: field matching on decode is an exact
    // name match (case-sensitive, e.g. JSON "Name" -> this field), and encode only ever writes
    // *public* fields (ForEachField: `bool flag = item.IsPublic`) - so FileName/IsDirty/IsBuiltIn
    // (internal, runtime-only bookkeeping) never reach the file.
    internal sealed class Theme : IJsonWritable, System.IEquatable<Theme>
    {
        public string Name;

        // Built-in themes (Default, BrightBlue, DarkGreyOrange) ship embedded in the DLL and
        // can't be renamed/deleted from the UI - see docs/ThemePanel-Design.md. internal (not
        // public), same as FileName/IsDirty below - always set explicitly by whichever ThemeManager
        // load path constructed this Theme (true from LoadBuiltInThemes, false from LoadUserTheme),
        // never read from a theme file, and - since Colossal.Json's encoder only ever writes public
        // fields (see the class comment above) - never written to one either, even though Write()
        // below still sends it over the wire to the UI (that's the same in-assembly field either way).
        internal bool IsBuiltIn;

        public Dictionary<string, string> Overrides = new Dictionary<string, string>();

        // Internal bookkeeping only - not part of Write() below, ThemeManager.GetTheme() by name is
        // how the UI/JS side ever reaches a theme.
        //
        // Null until ThemeManager.Save() first succeeds for this theme (a fresh fork or import has
        // no file yet). Assigned once from Name at that point and never changed again, even across
        // later renames - see ThemeManager.Save's own comment on why.
        internal string FileName;

        // Set by SetOverride/Rename, cleared by ThemeManager.Save() - whether this theme's current
        // in-memory state differs from what's (or isn't yet) on disk.
        internal bool IsDirty;

        internal void SetOverride(string variableName, string rawValue)
        {
            Overrides[variableName] = rawValue;
            IsDirty = true;
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
            writer.TypeEnd();
        }

        public bool Equals(Theme other)
        {
            if (other is null) return false;
            if (ReferenceEquals(this, other)) return true;
            if (Name != other.Name || IsBuiltIn != other.IsBuiltIn) return false;
            if (Overrides.Count != other.Overrides.Count) return false;
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
