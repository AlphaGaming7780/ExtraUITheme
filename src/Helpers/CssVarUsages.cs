using Colossal.UI.Binding;
using System.Collections.Generic;

namespace ExtraUITheme.Helpers
{
    // var() usage count per variable name, written to the UI as a plain { "--name": count } map.
    internal sealed class CssVarUsages : IJsonWritable
    {
        internal readonly Dictionary<string, int> Counts;

        internal CssVarUsages(Dictionary<string, int> counts)
        {
            Counts = counts;
        }

        public void Write(IJsonWriter writer)
        {
            writer.MapBegin(Counts.Count);
            foreach (KeyValuePair<string, int> pair in Counts)
            {
                writer.Write(pair.Key);
                writer.Write(pair.Value);
            }
            writer.MapEnd();
        }
    }
}
