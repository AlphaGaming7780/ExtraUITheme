using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text.RegularExpressions;
using UnityEngine;

namespace ExtraTheme.Helpers
{
    // Extracts the game's CSS custom properties ("--variables") straight from its compiled
    // stylesheet on disk. cohtml's CSSRuleList only exposes `.length` (no item()/[]), so there is no
    // way to enumerate these from the mod's own JS/React side at runtime - reading the shipped CSS
    // file directly from C# sidesteps that entirely.
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

        // Alpha (group 4 or 5) accepts a var() reference as well as a literal number/percent - a
        // handful of the game's own variables (--panelColorNormal and friends) tie their alpha to
        // another variable, e.g. "rgba(42,55,83,var(--panelOpacityNormal))", instead of a fixed
        // value. Group 4 wins when the alpha is a literal; group 5 carries the var() name otherwise.
        private static readonly Regex kRgbPattern = new Regex(
            @"^rgba?\(\s*([\d.]+%?)\s*,\s*([\d.]+%?)\s*,\s*([\d.]+%?)\s*(?:,\s*(?:([\d.]+%?)|var\(\s*(--[a-zA-Z0-9_-]+)\s*\))\s*)?\)$",
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

        // The standard CSS named colors, as hex - reusing ParseHexColor below rather than a
        // separate code path. A UI-side alternative (asking the engine to resolve a color keyword
        // itself via getComputedStyle, no table to maintain here) was tried and confirmed broken in
        // cohtml: it returns a "valid-looking" black for EVERY value regardless of whether the
        // engine actually recognized it - "ease" and "none" got misclassified as colors too, and
        // real colors like "white" came back black. So: a table it is, only "black"/"white"/
        // "transparent" actually occur in this game's own :root today, but the full set costs
        // nothing extra and avoids silently missing one after a future game update. Looked up
        // case-insensitively (kept lowercase here) - CSS keywords are themselves case-insensitive.
        private static readonly Dictionary<string, string> kNamedColors = new Dictionary<string, string>
        {
            ["transparent"] = "00000000",
            ["aliceblue"] = "F0F8FF", ["antiquewhite"] = "FAEBD7", ["aqua"] = "00FFFF", ["aquamarine"] = "7FFFD4",
            ["azure"] = "F0FFFF", ["beige"] = "F5F5DC", ["bisque"] = "FFE4C4", ["black"] = "000000",
            ["blanchedalmond"] = "FFEBCD", ["blue"] = "0000FF", ["blueviolet"] = "8A2BE2", ["brown"] = "A52A2A",
            ["burlywood"] = "DEB887", ["cadetblue"] = "5F9EA0", ["chartreuse"] = "7FFF00", ["chocolate"] = "D2691E",
            ["coral"] = "FF7F50", ["cornflowerblue"] = "6495ED", ["cornsilk"] = "FFF8DC", ["crimson"] = "DC143C",
            ["cyan"] = "00FFFF", ["darkblue"] = "00008B", ["darkcyan"] = "008B8B", ["darkgoldenrod"] = "B8860B",
            ["darkgray"] = "A9A9A9", ["darkgreen"] = "006400", ["darkgrey"] = "A9A9A9", ["darkkhaki"] = "BDB76B",
            ["darkmagenta"] = "8B008B", ["darkolivegreen"] = "556B2F", ["darkorange"] = "FF8C00", ["darkorchid"] = "9932CC",
            ["darkred"] = "8B0000", ["darksalmon"] = "E9967A", ["darkseagreen"] = "8FBC8F", ["darkslateblue"] = "483D8B",
            ["darkslategray"] = "2F4F4F", ["darkslategrey"] = "2F4F4F", ["darkturquoise"] = "00CED1", ["darkviolet"] = "9400D3",
            ["deeppink"] = "FF1493", ["deepskyblue"] = "00BFFF", ["dimgray"] = "696969", ["dimgrey"] = "696969",
            ["dodgerblue"] = "1E90FF", ["firebrick"] = "B22222", ["floralwhite"] = "FFFAF0", ["forestgreen"] = "228B22",
            ["fuchsia"] = "FF00FF", ["gainsboro"] = "DCDCDC", ["ghostwhite"] = "F8F8FF", ["gold"] = "FFD700",
            ["goldenrod"] = "DAA520", ["gray"] = "808080", ["grey"] = "808080", ["green"] = "008000",
            ["greenyellow"] = "ADFF2F", ["honeydew"] = "F0FFF0", ["hotpink"] = "FF69B4", ["indianred"] = "CD5C5C",
            ["indigo"] = "4B0082", ["ivory"] = "FFFFF0", ["khaki"] = "F0E68C", ["lavender"] = "E6E6FA",
            ["lavenderblush"] = "FFF0F5", ["lawngreen"] = "7CFC00", ["lemonchiffon"] = "FFFACD", ["lightblue"] = "ADD8E6",
            ["lightcoral"] = "F08080", ["lightcyan"] = "E0FFFF", ["lightgoldenrodyellow"] = "FAFAD2", ["lightgray"] = "D3D3D3",
            ["lightgreen"] = "90EE90", ["lightgrey"] = "D3D3D3", ["lightpink"] = "FFB6C1", ["lightsalmon"] = "FFA07A",
            ["lightseagreen"] = "20B2AA", ["lightskyblue"] = "87CEFA", ["lightslategray"] = "778899", ["lightslategrey"] = "778899",
            ["lightsteelblue"] = "B0C4DE", ["lightyellow"] = "FFFFE0", ["lime"] = "00FF00", ["limegreen"] = "32CD32",
            ["linen"] = "FAF0E6", ["magenta"] = "FF00FF", ["maroon"] = "800000", ["mediumaquamarine"] = "66CDAA",
            ["mediumblue"] = "0000CD", ["mediumorchid"] = "BA55D3", ["mediumpurple"] = "9370DB", ["mediumseagreen"] = "3CB371",
            ["mediumslateblue"] = "7B68EE", ["mediumspringgreen"] = "00FA9A", ["mediumturquoise"] = "48D1CC", ["mediumvioletred"] = "C71585",
            ["midnightblue"] = "191970", ["mintcream"] = "F5FFFA", ["mistyrose"] = "FFE4E1", ["moccasin"] = "FFE4B5",
            ["navajowhite"] = "FFDEAD", ["navy"] = "000080", ["oldlace"] = "FDF5E6", ["olive"] = "808000",
            ["olivedrab"] = "6B8E23", ["orange"] = "FFA500", ["orangered"] = "FF4500", ["orchid"] = "DA70D6",
            ["palegoldenrod"] = "EEE8AA", ["palegreen"] = "98FB98", ["paleturquoise"] = "AFEEEE", ["palevioletred"] = "DB7093",
            ["papayawhip"] = "FFEFD5", ["peachpuff"] = "FFDAB9", ["peru"] = "CD853F", ["pink"] = "FFC0CB",
            ["plum"] = "DDA0DD", ["powderblue"] = "B0E0E6", ["purple"] = "800080", ["rebeccapurple"] = "663399",
            ["red"] = "FF0000", ["rosybrown"] = "BC8F8F", ["royalblue"] = "4169E1", ["saddlebrown"] = "8B4513",
            ["salmon"] = "FA8072", ["sandybrown"] = "F4A460", ["seagreen"] = "2E8B57", ["seashell"] = "FFF5EE",
            ["sienna"] = "A0522D", ["silver"] = "C0C0C0", ["skyblue"] = "87CEEB", ["slateblue"] = "6A5ACD",
            ["slategray"] = "708090", ["slategrey"] = "708090", ["snow"] = "FFFAFA", ["springgreen"] = "00FF7F",
            ["steelblue"] = "4682B4", ["tan"] = "D2B48C", ["teal"] = "008080", ["thistle"] = "D8BFD8",
            ["tomato"] = "FF6347", ["turquoise"] = "40E0D0", ["violet"] = "EE82EE", ["wheat"] = "F5DEB3",
            ["white"] = "FFFFFF", ["whitesmoke"] = "F5F5F5", ["yellow"] = "FFFF00", ["yellowgreen"] = "9ACD32",
        };

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

            if (kNamedColors.TryGetValue(value.ToLowerInvariant(), out string namedHex))
                return ParseHexColor(selector, name, rawValue, namedHex);

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
            // Group 5 (var() alpha, e.g. "rgba(42,55,83,var(--panelOpacityNormal))") has no literal
            // to parse - 1.0 is just a display stand-in, see CssColorDeclaration.AlphaVarRef.
            double a = m.Groups[4].Success ? ParseColorComponent(m.Groups[4].Value, true) : 1.0;
            string alphaVarRef = m.Groups[5].Success ? m.Groups[5].Value : null;
            return new CssColorDeclaration(selector, name, rawValue, r, g, b, a, alphaVarRef);
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
