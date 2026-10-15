using Colossal.UI.Binding;
using System;
using System.Collections.Generic;
using System.Linq;

namespace ExtraUITheme.Helpers.ThemeFormat
{
    // Same order/values as ThemeIssueKind in UI/src/mods/ThemeExtraPanel/ThemeTypes.tsx.
    internal enum ThemeIssueKind
    {
        // The game CSS no longer declares this variable - the override is applied but nothing reads it.
        Missing,
        // The theme value isn't any recognizable CSS value while the game expects a color/unit/number.
        InvalidValue,
        // Both sides are recognizable but of different kinds now, e.g. a color on a variable that became 12rem.
        KindChanged,
        // The theme value is var(--x) (or an rgba alpha var) and --x doesn't exist in the game CSS.
        BrokenReference,
        // Info only: the theme value equals the game default in both the modern and the legacy UI.
        Redundant,
    }

    internal sealed class ThemeIssue : IJsonWritable
    {
        public readonly string Name;
        public readonly ThemeIssueKind Kind;
        public readonly string ThemeValue;
        // Game default in effect for the modern UI, null when the variable is missing.
        public readonly string GameValue;

        internal ThemeIssue(string name, ThemeIssueKind kind, string themeValue, string gameValue)
        {
            Name = name;
            Kind = kind;
            ThemeValue = themeValue;
            GameValue = gameValue;
        }

        internal bool IsWarning => Kind != ThemeIssueKind.Redundant;

        public void Write(IJsonWriter writer)
        {
            writer.TypeBegin(GetType().FullName);
            writer.PropertyName("name");
            writer.Write(Name);
            writer.PropertyName("kind");
            writer.Write((int)Kind);
            writer.PropertyName("themeValue");
            writer.Write(ThemeValue ?? "");
            writer.PropertyName("gameValue");
            writer.Write(GameValue ?? "");
            writer.TypeEnd();
        }
    }

    // Checks a theme's overrides against the variables of the game's current index.css. Reports only - nothing is ever removed here.
    internal static class ThemeValidator
    {
        private const string kRootSelector = ":root";
        private const string kOverwriteLegacySelector = ":root .overwrite-legacy";
        private const int kMaxReferenceDepth = 8;

        private static Dictionary<string, List<CssDeclaration>> s_GameByName;

        // Set once from ThemeManager.Initialize; until then (or without index.css) nothing is validated.
        internal static void SetGameDeclarations(List<CssDeclaration> declarations)
        {
            s_GameByName = new Dictionary<string, List<CssDeclaration>>();
            foreach (CssDeclaration d in declarations)
            {
                if (!s_GameByName.TryGetValue(d.Name, out List<CssDeclaration> list)) s_GameByName[d.Name] = list = new List<CssDeclaration>();
                list.Add(d);
            }
        }

        internal static bool HasGameData => s_GameByName != null && s_GameByName.Count > 0;

        // Sorted by kind then name, so the report reads the same every time.
        internal static List<ThemeIssue> Validate(Theme theme)
        {
            List<ThemeIssue> issues = new List<ThemeIssue>();
            if (theme == null || !HasGameData) return issues;

            foreach (KeyValuePair<string, string> pair in theme.Overrides)
            {
                ThemeIssue issue = Check(pair.Key, pair.Value);
                if (issue != null) issues.Add(issue);
            }

            issues.Sort((a, b) => a.Kind != b.Kind ? a.Kind.CompareTo(b.Kind) : string.CompareOrdinal(a.Name, b.Name));
            return issues;
        }

        internal static void WriteIssues(IJsonWriter writer, List<ThemeIssue> issues)
        {
            writer.ArrayBegin(issues.Count);
            foreach (ThemeIssue issue in issues) issue.Write(writer);
            writer.ArrayEnd();
        }

        private static ThemeIssue Check(string name, string themeValue)
        {
            if (!s_GameByName.TryGetValue(name, out List<CssDeclaration> game))
                return new ThemeIssue(name, ThemeIssueKind.Missing, themeValue, null);

            string modernDefault = DefaultFor(game, modern: true)?.RawValue;
            CssDeclaration value = CssVariableExtractor.Classify(null, name, themeValue ?? "");

            string brokenRef = BrokenReference(value);
            if (brokenRef != null) return new ThemeIssue(name, ThemeIssueKind.BrokenReference, themeValue, modernDefault);

            // A keyword in the game CSS is free-form (font names, gradients, "none"...) - any theme value is plausible there.
            HashSet<CssDeclarationKind> gameKinds = new HashSet<CssDeclarationKind>(game.Select(Resolve));
            if (!gameKinds.Contains(CssDeclarationKind.Keyword))
            {
                CssDeclarationKind themeKind = Resolve(value);
                if (themeKind == CssDeclarationKind.Keyword)
                    return new ThemeIssue(name, ThemeIssueKind.InvalidValue, themeValue, modernDefault);
                if (!gameKinds.Any(k => Compatible(themeKind, k)))
                    return new ThemeIssue(name, ThemeIssueKind.KindChanged, themeValue, modernDefault);
            }

            CssDeclaration modern = DefaultFor(game, modern: true);
            CssDeclaration legacy = DefaultFor(game, modern: false);
            if (modern != null && legacy != null && SameValue(value, modern) && SameValue(value, legacy))
                return new ThemeIssue(name, ThemeIssueKind.Redundant, themeValue, modernDefault);

            return null;
        }

        // The default actually in effect: in the modern UI `:root .overwrite-legacy` wins over `:root`, in the legacy UI only `:root` applies.
        private static CssDeclaration DefaultFor(List<CssDeclaration> game, bool modern)
        {
            CssDeclaration result = null;
            foreach (CssDeclaration d in game)
            {
                if (d.Selector == kRootSelector && result == null) result = d;
                if (modern && d.Selector == kOverwriteLegacySelector) return d;
            }
            return result;
        }

        // Name of the first variable referenced by the value that the game doesn't declare, or null.
        private static string BrokenReference(CssDeclaration value)
        {
            string reference = value switch
            {
                CssVarReferenceDeclaration r => r.ReferencedVariable,
                CssColorDeclaration c => c.AlphaVarRef,
                _ => null,
            };
            return reference != null && !s_GameByName.ContainsKey(reference) ? reference : null;
        }

        // Follows var(--x) chains to the kind they finally hold; a cycle or a dead end counts as Keyword (free-form).
        private static CssDeclarationKind Resolve(CssDeclaration declaration)
        {
            for (int depth = 0; depth < kMaxReferenceDepth; depth++)
            {
                if (!(declaration is CssVarReferenceDeclaration r)) return declaration.Kind;
                if (!s_GameByName.TryGetValue(r.ReferencedVariable, out List<CssDeclaration> targets)) return CssDeclarationKind.Keyword;
                declaration = DefaultFor(targets, modern: true) ?? targets[0];
            }
            return CssDeclarationKind.Keyword;
        }

        // "0" is a valid length, and a unit-less number is how some numeric variables are written - so Number and Unit accept each other.
        private static bool Compatible(CssDeclarationKind theme, CssDeclarationKind game)
        {
            if (theme == game) return true;
            return (theme == CssDeclarationKind.Number && game == CssDeclarationKind.Unit)
                || (theme == CssDeclarationKind.Unit && game == CssDeclarationKind.Number);
        }

        // Colors compare by channel (#fff == rgb(255,255,255)); everything else by its text, ignoring case and spaces.
        private static bool SameValue(CssDeclaration a, CssDeclaration b)
        {
            if (a is CssColorDeclaration ca && b is CssColorDeclaration cb)
            {
                const double kEpsilon = 0.5 / 255.0;
                return Math.Abs(ca.R - cb.R) < kEpsilon && Math.Abs(ca.G - cb.G) < kEpsilon && Math.Abs(ca.B - cb.B) < kEpsilon
                    && Math.Abs(ca.A - cb.A) < kEpsilon && ca.AlphaVarRef == cb.AlphaVarRef;
            }
            return Normalize(a.RawValue) == Normalize(b.RawValue);
        }

        private static string Normalize(string value) => new string((value ?? "").Where(c => !char.IsWhiteSpace(c)).ToArray()).ToLowerInvariant();
    }
}
