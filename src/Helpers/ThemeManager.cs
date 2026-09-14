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
            ET.Logger.Info("GetAllThemes");
            List<Theme> themes = LoadBuiltInThemes();
            themes.AddRange(LoadUserThemes());
            return themes;
        }

        // Returns false (without writing) if `name` collides with a built-in theme - the caller is
        // responsible for the Écraser/Renommer/Annuler conflict prompt for an existing user theme
        // (design doc), this only guards the built-in names which must never be shadowed.
        internal static bool SaveUserTheme(string name, Dictionary<string, string> overrides)
        {
            if (string.IsNullOrWhiteSpace(name)) return false;
            if (name == DefaultThemeName || BuiltInPresetNames.Contains(name)) return false;

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

        private static string SanitizeFileName(string name)
        {
            foreach (char c in Path.GetInvalidFileNameChars()) name = name.Replace(c, '_');
            return name;
        }
    }
}
