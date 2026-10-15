using Colossal.UI.Binding;
using System.Collections.Generic;
using System.Linq;

namespace ExtraUITheme.Helpers.ThemeFormat
{
    // Same order/values as ImportStatus in UI/src/mods/ThemeExtraPanel/ThemeTypes.tsx.
    internal enum ImportStatus
    {
        Ok,
        TooNew,
        // Not JSON, or not a theme (e.g. a key that isn't a "--" variable).
        Invalid,
        // A readable theme with no variable and no palette - nothing to import.
        Empty,
    }

    // Answer to the UI's "AnalyzeImport" trigger: everything the Import dialog needs before it decides to import, warn, or refuse.
    internal sealed class ImportReport : IJsonWritable
    {
        public ImportStatus Status;
        // From the pasted JSON; null when it has none (bare map) - the UI then picks a default name.
        public string Name;
        public int OverrideCount;
        public List<ThemeIssue> Issues = new List<ThemeIssue>();

        internal static ImportReport Analyze(string json)
        {
            ImportReport report = new ImportReport();
            switch (ThemeManager.TryParseImport(json, out Theme parsed))
            {
                case ThemeReadStatus.TooNew:
                    report.Status = ImportStatus.TooNew;
                    return report;
                case ThemeReadStatus.Invalid:
                    report.Status = ImportStatus.Invalid;
                    return report;
            }

            if (parsed.Overrides.Keys.Any(k => !k.StartsWith("--")))
            {
                report.Status = ImportStatus.Invalid;
                return report;
            }
            if (parsed.Overrides.Count == 0 && parsed.Palette.Count == 0)
            {
                report.Status = ImportStatus.Empty;
                return report;
            }

            report.Status = ImportStatus.Ok;
            report.Name = string.IsNullOrWhiteSpace(parsed.Name) ? null : parsed.Name.Trim();
            report.OverrideCount = parsed.Overrides.Count;
            report.Issues = ThemeValidator.Validate(parsed);
            return report;
        }

        public void Write(IJsonWriter writer)
        {
            writer.TypeBegin(GetType().FullName);
            writer.PropertyName("status");
            writer.Write((int)Status);
            writer.PropertyName("name");
            writer.Write(Name ?? "");
            writer.PropertyName("overrideCount");
            writer.Write(OverrideCount);
            writer.PropertyName("issues");
            ThemeValidator.WriteIssues(writer, Issues);
            writer.TypeEnd();
        }
    }
}
