using Colossal.UI.Binding;
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text.RegularExpressions;
using UnityEngine;

namespace ExtraTheme.Helpers
{
    internal enum CssDeclarationKind
    {
        Color,
        Unit,
        Number,
        VarReference,
        Keyword,
    }

    internal abstract class CssDeclaration : IJsonWritable, IEquatable<CssDeclaration>
    {
        // Full selector this value is declared under, including any enclosing @-rule context
        // (e.g. ":root", ".dark-theme", "@media (prefers-color-scheme: dark) :root"). The same
        // variable Name can appear multiple times with different Selector/RawValue pairs - that's
        // how the game's light/dark (and other) themes each override the same variables.
        public readonly string Selector;
        public readonly string Name;
        public readonly string RawValue;

        protected CssDeclaration(string selector, string name, string rawValue)
        {
            Selector = selector;
            Name = name;
            RawValue = rawValue;
        }

        public abstract CssDeclarationKind Kind { get; }

        public void Write(IJsonWriter writer)
        {
            // Full type name (not just the short class name) - matches the convention already used
            // for ExtraPanel content (ExtraPanelBase.ID => GetType().FullName), so the UI side can key
            // a components map by this exact string and pick the right renderer per concrete
            // CssDeclaration subclass via TypedRenderer, the same way ExtraPanelsRoot does for panel
            // content.
            writer.TypeBegin(GetType().FullName);
            writer.PropertyName("selector");
            writer.Write(Selector);
            writer.PropertyName("name");
            writer.Write(Name);
            writer.PropertyName("rawValue");
            writer.Write(RawValue);
            writer.PropertyName("kind");
            writer.Write((int)Kind);
            WriteFields(writer);
            writer.TypeEnd();
        }

        protected abstract void WriteFields(IJsonWriter writer);

        // Every subclass's extra fields (R/G/B/A, Number/Unit, ...) are deterministically parsed
        // from RawValue (see Classify()), so Selector+Name+RawValue+concrete type is enough to
        // decide equality - needed so GetterValueBinding's default comparer can tell two
        // structurally-identical extraction passes apart from a genuinely changed one, instead of
        // always treating a freshly-allocated List<CssDeclaration> as "changed" by reference.
        public bool Equals(CssDeclaration other)
        {
            if (other is null) return false;
            if (ReferenceEquals(this, other)) return true;
            return GetType() == other.GetType() && Selector == other.Selector && Name == other.Name && RawValue == other.RawValue;
        }

        public override bool Equals(object obj) => Equals(obj as CssDeclaration);

        public override int GetHashCode()
        {
            unchecked
            {
                int hash = 17;
                hash = hash * 31 + GetType().GetHashCode();
                hash = hash * 31 + (Selector?.GetHashCode() ?? 0);
                hash = hash * 31 + (Name?.GetHashCode() ?? 0);
                hash = hash * 31 + (RawValue?.GetHashCode() ?? 0);
                return hash;
            }
        }
    }

    internal sealed class CssColorDeclaration : CssDeclaration
    {
        public readonly double R, G, B, A;

        public CssColorDeclaration(string selector, string name, string rawValue, double r, double g, double b, double a)
            : base(selector, name, rawValue)
        {
            R = r; G = g; B = b; A = a;
        }

        public override CssDeclarationKind Kind => CssDeclarationKind.Color;

        protected override void WriteFields(IJsonWriter writer)
        {
            writer.PropertyName("r");
            writer.Write(R);
            writer.PropertyName("g");
            writer.Write(G);
            writer.PropertyName("b");
            writer.Write(B);
            writer.PropertyName("a");
            writer.Write(A);
        }
    }

    internal sealed class CssUnitDeclaration : CssDeclaration
    {
        public readonly double Number;
        public readonly string Unit;

        public CssUnitDeclaration(string selector, string name, string rawValue, double number, string unit)
            : base(selector, name, rawValue)
        {
            Number = number;
            Unit = unit;
        }

        public override CssDeclarationKind Kind => CssDeclarationKind.Unit;

        protected override void WriteFields(IJsonWriter writer)
        {
            writer.PropertyName("number");
            writer.Write(Number);
            writer.PropertyName("unit");
            writer.Write(Unit);
        }
    }

    internal sealed class CssNumberDeclaration : CssDeclaration
    {
        public readonly double Number;

        public CssNumberDeclaration(string selector, string name, string rawValue, double number)
            : base(selector, name, rawValue)
        {
            Number = number;
        }

        public override CssDeclarationKind Kind => CssDeclarationKind.Number;

        protected override void WriteFields(IJsonWriter writer)
        {
            writer.PropertyName("number");
            writer.Write(Number);
        }
    }

    internal sealed class CssVarReferenceDeclaration : CssDeclaration
    {
        public readonly string ReferencedVariable;

        public CssVarReferenceDeclaration(string selector, string name, string rawValue, string referencedVariable)
            : base(selector, name, rawValue)
        {
            ReferencedVariable = referencedVariable;
        }

        public override CssDeclarationKind Kind => CssDeclarationKind.VarReference;

        protected override void WriteFields(IJsonWriter writer)
        {
            writer.PropertyName("referencedVariable");
            writer.Write(ReferencedVariable);
        }
    }

    internal sealed class CssKeywordDeclaration : CssDeclaration
    {
        public CssKeywordDeclaration(string selector, string name, string rawValue)
            : base(selector, name, rawValue)
        {
        }

        public override CssDeclarationKind Kind => CssDeclarationKind.Keyword;

        protected override void WriteFields(IJsonWriter writer)
        {
        }
    }

    // Extracts the game's CSS custom properties ("--variables") straight from its compiled
    // stylesheet on disk. cohtml's CSSRuleList only exposes `.length` (no item()/[] - confirmed
    // even in Coherent's current Gameface API reference, not just this game's older cohtml build),
    // so there is no way to enumerate these from the mod's own JS/React side at runtime. Reading
    // the shipped CSS file directly from C# sidesteps that limitation entirely - this is plain
    // disk I/O, nothing to do with cohtml's JS bindings.
    internal static class CssVariableExtractor
    {
        // Relative to Application.dataPath (i.e. ".../Cities2_Data"), so this resolves correctly
        // regardless of where Steam installed the game.
        private const string kRelativeCssPath = "Content/Game/UI/index.css";

        private static readonly Regex kDeclarationPattern = new Regex(
            @"(--[a-zA-Z0-9_-]+)\s*:\s*([^;{}]+);",
            RegexOptions.Compiled);

        private static readonly Regex kVarRefPattern = new Regex(
            @"^var\(\s*(--[a-zA-Z0-9_-]+)\s*(?:,.*)?\)$",
            RegexOptions.Compiled);

        private static readonly Regex kHexColorPattern = new Regex(
            @"^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$",
            RegexOptions.Compiled);

        private static readonly Regex kRgbPattern = new Regex(
            @"^rgba?\(\s*([\d.]+%?)\s*,\s*([\d.]+%?)\s*,\s*([\d.]+%?)\s*(?:,\s*([\d.]+%?)\s*)?\)$",
            RegexOptions.Compiled | RegexOptions.IgnoreCase);

        private static readonly Regex kHslPattern = new Regex(
            @"^hsla?\(\s*([\d.]+)(?:deg)?\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*(?:,\s*([\d.]+%?)\s*)?\)$",
            RegexOptions.Compiled | RegexOptions.IgnoreCase);

        private static readonly Regex kUnitPattern = new Regex(
            @"^(-?\d+(?:\.\d+)?)(px|rem|em|%|deg|rad|grad|turn|s|ms|vh|vw|vmin|vmax|fr|ch|q|cm|mm|in|pt|pc)$",
            RegexOptions.Compiled | RegexOptions.IgnoreCase);

        private static readonly Regex kNumberPattern = new Regex(
            @"^-?\d+(?:\.\d+)?$",
            RegexOptions.Compiled);

        public static string ResolveCssPath()
        {
            return Path.Combine(Application.dataPath, kRelativeCssPath.Replace('/', Path.DirectorySeparatorChar));
        }

        public static List<CssDeclaration> ExtractAll()
        {
            ET.Logger.Info("ExtractAll");
            var results = new List<CssDeclaration>();

            string path = ResolveCssPath();
            if (!File.Exists(path))
            {
                ET.Logger.Warn($"CssVariableExtractor: file not found at {path}");
                return results;
            }

            string css = File.ReadAllText(path);
            ParseRules(css, null, results);

            return results;
        }

        // Minimal brace-aware CSS scanner (the shipped file is minified onto a single line, so a
        // line-based approach doesn't work). Finds "<selector>{<body>}" blocks by matching braces
        // (handling arbitrary nesting depth for @media/@supports etc.); when a block's body itself
        // contains nested rules it recurses with the outer selector kept as context, otherwise the
        // body is scanned directly for "--name: value;" declarations. Doesn't special-case
        // @charset/@import (bodiless at-rules ending in ";" instead of "{...}") - if the game's CSS
        // ever has one, it just gets glued onto the following selector's label, which is cosmetic
        // only (declaration extraction inside the next real block is unaffected).
        private static void ParseRules(string css, string context, List<CssDeclaration> results)
        {
            int i = 0;
            while (i < css.Length)
            {
                int braceStart = css.IndexOf('{', i);
                if (braceStart < 0) break;

                string selector = css.Substring(i, braceStart - i).Trim();

                int depth = 1;
                int j = braceStart + 1;
                while (j < css.Length && depth > 0)
                {
                    char c = css[j];
                    if (c == '{') depth++;
                    else if (c == '}') depth--;
                    j++;
                }
                // body excludes the final matching '}' (at index j - 1)
                string body = css.Substring(braceStart + 1, (j - 1) - (braceStart + 1));

                string fullSelector = context == null ? selector : $"{context} {selector}";

                if (body.IndexOf('{') >= 0)
                {
                    ParseRules(body, fullSelector, results);
                }
                else
                {
                    foreach (Match match in kDeclarationPattern.Matches(body))
                    {
                        string name = match.Groups[1].Value;
                        string rawValue = match.Groups[2].Value.Trim();
                        results.Add(Classify(fullSelector, name, rawValue));
                    }
                }

                i = j;
            }
        }

        private static CssDeclaration Classify(string selector, string name, string rawValue)
        {
            string value = rawValue.Trim();
            Match m;

            m = kVarRefPattern.Match(value);
            if (m.Success) return new CssVarReferenceDeclaration(selector, name, rawValue, m.Groups[1].Value);

            m = kHexColorPattern.Match(value);
            if (m.Success) return ParseHexColor(selector, name, rawValue, m.Groups[1].Value);

            m = kRgbPattern.Match(value);
            if (m.Success) return ParseRgbColor(selector, name, rawValue, m);

            m = kHslPattern.Match(value);
            if (m.Success) return ParseHslColor(selector, name, rawValue, m);

            m = kUnitPattern.Match(value);
            if (m.Success)
            {
                double number = double.Parse(m.Groups[1].Value, CultureInfo.InvariantCulture);
                string unit = m.Groups[2].Value.ToLowerInvariant();
                return new CssUnitDeclaration(selector, name, rawValue, number, unit);
            }

            m = kNumberPattern.Match(value);
            if (m.Success) return new CssNumberDeclaration(selector, name, rawValue, double.Parse(value, CultureInfo.InvariantCulture));

            return new CssKeywordDeclaration(selector, name, rawValue);
        }

        private static CssColorDeclaration ParseHexColor(string selector, string name, string rawValue, string hex)
        {
            int r, g, b, a = 255;
            switch (hex.Length)
            {
                case 3: // RGB shorthand, e.g. "f0a"
                    r = Convert.ToInt32(new string(hex[0], 2), 16);
                    g = Convert.ToInt32(new string(hex[1], 2), 16);
                    b = Convert.ToInt32(new string(hex[2], 2), 16);
                    break;
                case 4: // RGBA shorthand
                    r = Convert.ToInt32(new string(hex[0], 2), 16);
                    g = Convert.ToInt32(new string(hex[1], 2), 16);
                    b = Convert.ToInt32(new string(hex[2], 2), 16);
                    a = Convert.ToInt32(new string(hex[3], 2), 16);
                    break;
                case 6:
                    r = Convert.ToInt32(hex.Substring(0, 2), 16);
                    g = Convert.ToInt32(hex.Substring(2, 2), 16);
                    b = Convert.ToInt32(hex.Substring(4, 2), 16);
                    break;
                case 8:
                    r = Convert.ToInt32(hex.Substring(0, 2), 16);
                    g = Convert.ToInt32(hex.Substring(2, 2), 16);
                    b = Convert.ToInt32(hex.Substring(4, 2), 16);
                    a = Convert.ToInt32(hex.Substring(6, 2), 16);
                    break;
                default:
                    r = g = b = 0;
                    break;
            }
            return new CssColorDeclaration(selector, name, rawValue, r / 255.0, g / 255.0, b / 255.0, a / 255.0);
        }

        private static double ParseColorComponent(string token, bool isAlpha)
        {
            token = token.Trim();
            if (token.EndsWith("%"))
            {
                double pct = double.Parse(token.TrimEnd('%'), CultureInfo.InvariantCulture);
                return pct / 100.0;
            }
            double value = double.Parse(token, CultureInfo.InvariantCulture);
            return isAlpha ? value : value / 255.0;
        }

        private static CssColorDeclaration ParseRgbColor(string selector, string name, string rawValue, Match m)
        {
            double r = ParseColorComponent(m.Groups[1].Value, false);
            double g = ParseColorComponent(m.Groups[2].Value, false);
            double b = ParseColorComponent(m.Groups[3].Value, false);
            double a = m.Groups[4].Success ? ParseColorComponent(m.Groups[4].Value, true) : 1.0;
            return new CssColorDeclaration(selector, name, rawValue, r, g, b, a);
        }

        private static CssColorDeclaration ParseHslColor(string selector, string name, string rawValue, Match m)
        {
            double h = double.Parse(m.Groups[1].Value, CultureInfo.InvariantCulture);
            double s = double.Parse(m.Groups[2].Value, CultureInfo.InvariantCulture) / 100.0;
            double l = double.Parse(m.Groups[3].Value, CultureInfo.InvariantCulture) / 100.0;
            double a = m.Groups[4].Success ? ParseColorComponent(m.Groups[4].Value, true) : 1.0;

            HslToRgb(h, s, l, out double r, out double g, out double b);
            return new CssColorDeclaration(selector, name, rawValue, r, g, b, a);
        }

        private static void HslToRgb(double h, double s, double l, out double r, out double g, out double b)
        {
            h = ((h % 360) + 360) % 360;
            double c = (1 - Math.Abs(2 * l - 1)) * s;
            double x = c * (1 - Math.Abs((h / 60.0) % 2 - 1));
            double m = l - c / 2;
            double r1, g1, b1;

            if (h < 60) { r1 = c; g1 = x; b1 = 0; }
            else if (h < 120) { r1 = x; g1 = c; b1 = 0; }
            else if (h < 180) { r1 = 0; g1 = c; b1 = x; }
            else if (h < 240) { r1 = 0; g1 = x; b1 = c; }
            else if (h < 300) { r1 = x; g1 = 0; b1 = c; }
            else { r1 = c; g1 = 0; b1 = x; }

            r = r1 + m;
            g = g1 + m;
            b = b1 + m;
        }
    }
}
