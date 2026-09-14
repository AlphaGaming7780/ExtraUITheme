using Colossal.Json;
using Colossal.PSI.Environment;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;

namespace ExtraTheme.Helpers
{
    // Loads/saves Theme objects (see Theme.cs) from two sources, per the plan agreed on in
    // docs/ThemePanel-Design.md:
    // - Built-in themes (Default + the two legacy presets) ship embedded in the DLL
    //   (embedded/Themes/*.json), read-only, never renamed/deleted from the UI.
    // - User themes are plain files under ModsData/ExtraTheme/Themes/*.json, the theme's Name is
    //   its filename (no separate GUID/CID - see conversation: simpler to use, the tradeoff being
    //   name collisions are handled explicitly here rather than being impossible by construction).
    internal static class ThemeManager
    {
        internal const string DefaultThemeName = "Default";
        private static readonly string[] BuiltInPresetNames = { "BrightBlue", "DarkGreyOrange" };

        private static readonly string UserThemesFolder =
            Path.Combine(EnvPath.kUserDataPath, "ModsData", nameof(ExtraTheme), "Themes");

        internal static List<Theme> LoadBuiltInThemes()
        {
            List<Theme> themes = new List<Theme>
            {
                new Theme { Name = DefaultThemeName, IsBuiltIn = true, Overrides = new Dictionary<string, string>() }
            };

            Assembly assembly = Assembly.GetExecutingAssembly();
            string namespaceName = assembly.GetName().Name;

            foreach (string presetName in BuiltInPresetNames)
            {
                string resourceName = $"{namespaceName}.embedded.Themes.{presetName}.json";
                try
                {
                    using Stream stream = assembly.GetManifestResourceStream(resourceName);
                    if (stream == null)
                    {
                        ET.Logger.Error($"Missing embedded theme resource '{resourceName}'.");
                        continue;
                    }
                    using StreamReader reader = new StreamReader(stream);
                    Dictionary<string, string> overrides = Decoder.Decode(reader.ReadToEnd()).Make<Dictionary<string, string>>();
                    themes.Add(new Theme { Name = presetName, IsBuiltIn = true, Overrides = overrides });
                }
                catch (Exception ex)
                {
                    ET.Logger.Error($"Failed to load embedded theme '{presetName}': {ex}");
                }
            }

            return themes;
        }

        internal static List<Theme> LoadUserThemes()
        {
            List<Theme> themes = new List<Theme>();

            if (!Directory.Exists(UserThemesFolder)) return themes;

            foreach (string path in Directory.EnumerateFiles(UserThemesFolder, "*.json"))
            {
                string name = Path.GetFileNameWithoutExtension(path);
                try
                {
                    Dictionary<string, string> overrides = Decoder.Decode(File.ReadAllText(path)).Make<Dictionary<string, string>>();
                    themes.Add(new Theme { Name = name, IsBuiltIn = false, Overrides = overrides });
                }
                catch (Exception ex)
                {
                    ET.Logger.Error($"Failed to load user theme '{name}' from {path}: {ex}");
                }
            }

            return themes.OrderBy(t => t.Name, StringComparer.OrdinalIgnoreCase).ToList();
        }

        internal static List<Theme> GetAllThemes()
        {
            List<Theme> themes = LoadBuiltInThemes();
            themes.AddRange(LoadUserThemes());
            return themes;
        }

        internal static bool IsBuiltInName(string name) => name == DefaultThemeName || BuiltInPresetNames.Contains(name);

        internal static bool UserThemeExists(string name) =>
            File.Exists(Path.Combine(UserThemesFolder, SanitizeFileName(name) + ".json"));

        // Returns false (without writing) if `name` collides with a built-in theme - the caller is
        // responsible for the Écraser/Renommer/Annuler conflict prompt for an existing user theme
        // (design doc), this only guards the built-in names which must never be shadowed.
        internal static bool SaveUserTheme(string name, Dictionary<string, string> overrides)
        {
            if (string.IsNullOrWhiteSpace(name)) return false;
            if (IsBuiltInName(name)) return false;

            if (!Directory.Exists(UserThemesFolder)) Directory.CreateDirectory(UserThemesFolder);

            string path = Path.Combine(UserThemesFolder, SanitizeFileName(name) + ".json");
            File.WriteAllText(path, Encoder.Encode(overrides, EncodeOptions.None));
            return true;
        }

        internal static void DeleteUserTheme(string name)
        {
            string path = Path.Combine(UserThemesFolder, SanitizeFileName(name) + ".json");
            if (File.Exists(path)) File.Delete(path);
        }

        // False (without writing) if newName is a built-in name, already taken by another user
        // theme, or oldName has no file on disk (a still-unsaved forked theme - the caller handles
        // that case itself, see ThemeExtraPanel.RenameTheme).
        internal static bool RenameUserTheme(string oldName, string newName)
        {
            if (string.IsNullOrWhiteSpace(newName)) return false;
            if (IsBuiltInName(newName)) return false;
            if (UserThemeExists(newName)) return false;

            string oldPath = Path.Combine(UserThemesFolder, SanitizeFileName(oldName) + ".json");
            if (!File.Exists(oldPath)) return false;

            string newPath = Path.Combine(UserThemesFolder, SanitizeFileName(newName) + ".json");
            File.Move(oldPath, newPath);
            return true;
        }

        // Editing a value while a built-in theme is active forks it into a new user theme first
        // (built-ins are read-only) - "<sourceName> (copy)", "<sourceName> (copy 2)", ... until a
        // free name is found. Only picks the name, doesn't write anything - the caller decides
        // whether/when to persist (see ThemeExtraPanel's pending-save state).
        internal static string GenerateForkName(string sourceName)
        {
            string baseName = $"{sourceName} (copy)";
            string name = baseName;
            for (int n = 2; UserThemeExists(name); n++) name = $"{baseName} {n}";
            return name;
        }

        // False (with `overrides` null) if the JSON doesn't decode to a plain string->string map.
        internal static bool TryParseOverrides(string json, out Dictionary<string, string> overrides)
        {
            try
            {
                overrides = Decoder.Decode(json).Make<Dictionary<string, string>>();
                return overrides != null;
            }
            catch
            {
                overrides = null;
                return false;
            }
        }

        private static string SanitizeFileName(string name)
        {
            foreach (char c in Path.GetInvalidFileNameChars()) name = name.Replace(c, '_');
            return name;
        }
    }
}
