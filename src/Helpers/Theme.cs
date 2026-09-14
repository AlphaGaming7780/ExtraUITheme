using Colossal.UI.Binding;
using System.Collections.Generic;
using System.Linq;
using Unity.Entities.UniversalDelegates;

namespace ExtraTheme.Helpers
{
    internal sealed class Theme : IJsonWritable, System.IEquatable<Theme>
    {
        public string Name;

        // Built-in themes (Default, BrightBlue, DarkGreyOrange) ship embedded in the DLL and
        // can't be renamed/deleted from the UI - see docs/ThemePanel-Design.md.
        public bool IsBuiltIn;

        public Dictionary<string, string> Overrides = new Dictionary<string, string>();

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
