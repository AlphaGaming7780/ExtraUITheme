using Colossal.Json;
using Colossal.PSI.Environment;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;

namespace ExtraUITheme.Helpers
{
    // Loads/saves Theme objects: built-ins ship embedded in the DLL, user themes live under ModsData/ExtraUITheme/Themes/*.json or *.eutjson, and other mods can bundle read-only *.eutjson themes under the Paradox Mods cache.
    internal static class ThemeManager
    {
        internal const string DefaultThemeName = "Default";
        private static readonly string[] BuiltInPresetNames = { "BrightBlue", "DarkGreyOrange" };

        private const string PreferredExtension = ".eutjson";
        private const string LegacyExtension = ".json";
        private static readonly string[] SupportedExtensions = { LegacyExtension, PreferredExtension };

        private static readonly string UserThemesFolder =
            Path.Combine(EnvPath.kUserDataPath, "ModsData", nameof(ExtraUITheme), "Themes");

        private static readonly string SharedThemesFolder =
            Path.Combine(EnvPath.kCacheDataPath, "Mods", "pdx_mods");

        private static Dictionary<string, Theme> m_Themes;

        // (Re)scans built-ins + shared + UserThemesFolder into m_Themes from scratch - anything unsaved is lost.
        internal static void Initialize()
        {
            m_Themes = new Dictionary<string, Theme>();

            foreach (Theme theme in LoadBuiltInThemes()) m_Themes[theme.Name] = theme;
            foreach (Theme theme in LoadSharedThemes()) m_Themes[theme.Name] = theme;

            MigrateLegacyThemeFiles();

            if (Directory.Exists(UserThemesFolder))
            {
                foreach (string extension in SupportedExtensions)
                {
                    foreach (string path in Directory.EnumerateFiles(UserThemesFolder, "*" + extension))
                    {
                        Theme theme = LoadUserTheme(path, isReadOnly: false);
                        if (theme != null) m_Themes[theme.Name] = theme;
                    }
                }
            }
        }

        // Renames every leftover *.json in UserThemesFolder to *.eutjson, skipping (never overwriting) a file whose *.eutjson name already exists or whose rename fails.
        private static void MigrateLegacyThemeFiles()
        {
            if (!Directory.Exists(UserThemesFolder)) return;

            foreach (string path in Directory.EnumerateFiles(UserThemesFolder, "*" + LegacyExtension))
            {
                string target = Path.ChangeExtension(path, PreferredExtension);
                if (File.Exists(target))
                {
                    EUT.Logger.Warn($"Not migrating '{path}' to {PreferredExtension} - a file with that name already exists.");
                    continue;
                }

                try
                {
                    File.Move(path, target);
                }
                catch (Exception ex)
                {
                    EUT.Logger.Error($"Failed to migrate '{path}' to {PreferredExtension}: {ex}");
                }
            }
        }

        // Scans every mod folder under the Paradox Mods cache for bundled *.eutjson theme files only - that folder is full of unrelated JSON from other mods.
        private static List<Theme> LoadSharedThemes()
        {
            List<Theme> themes = new List<Theme>();
            if (!Directory.Exists(SharedThemesFolder)) return themes;

            try
            {
                foreach (string path in Directory.EnumerateFiles(SharedThemesFolder, "*" + PreferredExtension, SearchOption.AllDirectories))
                {
                    Theme theme = LoadUserTheme(path, isReadOnly: true);
                    if (theme != null) themes.Add(theme);
                }
            }
            catch (Exception ex)
            {
                EUT.Logger.Error($"Failed to scan shared themes folder: {ex}");
            }

            return themes;
        }

        internal static List<Theme> GetAllThemes() => m_Themes.Values.ToList();

        internal static Theme GetTheme(string name) =>
            name != null && m_Themes.TryGetValue(name, out Theme theme) ? theme : null;

        internal static bool IsBuiltInName(string name) => name == DefaultThemeName || BuiltInPresetNames.Contains(name);

        private static List<Theme> LoadBuiltInThemes()
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
                        EUT.Logger.Error($"Missing embedded theme resource '{resourceName}'.");
                        continue;
                    }
                    using StreamReader reader = new StreamReader(stream);
                    Dictionary<string, string> overrides = Decoder.Decode(reader.ReadToEnd()).Make<Dictionary<string, string>>();
                    themes.Add(new Theme { Name = presetName, IsBuiltIn = true, Overrides = overrides });
                }
                catch (Exception ex)
                {
                    EUT.Logger.Error($"Failed to load embedded theme '{presetName}': {ex}");
                }
            }

            return themes;
        }

        // The file's own Name field is the source of truth for display, not the filename; isReadOnly marks mod-bundled themes as built-in-like (fork-on-edit, no rename/delete).
        private static Theme LoadUserTheme(string path, bool isReadOnly)
        {
            string fileName = Path.GetFileNameWithoutExtension(path);

            try
            {
                Theme theme = Decoder.Decode(File.ReadAllText(path)).Make<Theme>();
                theme.IsBuiltIn = isReadOnly;
                theme.FileName = fileName;
                theme.FileExtension = Path.GetExtension(path);
                return theme;
            }
            catch (Exception ex)
            {
                EUT.Logger.Error($"Failed to load user theme from {path}: {ex}");
                return null;
            }
        }

        // FileName/FileExtension are assigned once on the first save and never change again, so a later rename can leave the filename not matching the display name.
        internal static bool Save(Theme theme)
        {
            if (theme == null || theme.IsBuiltIn) return false;

            theme.FileExtension ??= PreferredExtension;

            if (theme.FileName == null)
            {
                string baseName = SanitizeFileName(theme.Name);
                string candidate = baseName;
                for (int n = 2; File.Exists(Path.Combine(UserThemesFolder, candidate + theme.FileExtension)); n++)
                    candidate = $"{baseName} ({n})";
                theme.FileName = candidate;
            }

            if (!Directory.Exists(UserThemesFolder)) Directory.CreateDirectory(UserThemesFolder);

            string path = Path.Combine(UserThemesFolder, theme.FileName + theme.FileExtension);
            File.WriteAllText(path, Encoder.Encode(theme, EncodeOptions.None));

            theme.IsDirty = false;
            return true;
        }

        // "<source.Name> (copy)", "(copy 2)", ... - registered in the cache immediately, IsDirty, no FileName until it's ever saved.
        internal static Theme Fork(Theme source)
        {
            string baseName = $"{source.Name} (copy)";
            string name = baseName;
            for (int n = 2; m_Themes.ContainsKey(name); n++) name = $"{baseName} {n}";

            Theme forked = new Theme
            {
                Name = name,
                IsBuiltIn = false,
                Overrides = new Dictionary<string, string>(source.Overrides),
                IsDirty = true,
            };
            m_Themes[name] = forked;
            return forked;
        }

        // False if newName is empty, theme is built-in, or newName collides with any other known theme.
        internal static bool Rename(Theme theme, string newName)
        {
            if (theme == null || theme.IsBuiltIn) return false;
            if (string.IsNullOrWhiteSpace(newName) || newName == theme.Name) return false;
            if (m_Themes.ContainsKey(newName)) return false;

            m_Themes.Remove(theme.Name);
            theme.Rename(newName);
            m_Themes[newName] = theme;
            return true;
        }

        // Creates a new theme (or replaces an existing one's overrides in place, with overwrite) and saves it immediately.
        internal static Theme Import(string name, Dictionary<string, string> overrides, bool overwrite)
        {
            if (string.IsNullOrWhiteSpace(name) || IsBuiltInName(name)) return null;

            Theme existing = GetTheme(name);
            if (existing != null && !overwrite) return null;

            Theme theme = existing ?? new Theme { Name = name, IsBuiltIn = false };
            theme.Overrides = overrides;
            theme.IsDirty = true;
            m_Themes[name] = theme;

            if (!Save(theme)) return null;
            return theme;
        }

        internal static void Delete(Theme theme)
        {
            if (theme == null || theme.IsBuiltIn) return;
            if (theme.FileName != null)
            {
                string path = Path.Combine(UserThemesFolder, theme.FileName + (theme.FileExtension ?? PreferredExtension));
                if (File.Exists(path)) File.Delete(path);
            }
            m_Themes.Remove(theme.Name);
        }

        // False (nothing decoded) if the JSON doesn't decode to a plain string->string map.
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
