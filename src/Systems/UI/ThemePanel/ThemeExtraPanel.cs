using Colossal.UI.Binding;
using ExtraLib.Systems.UI.ExtraPanels;
using ExtraTheme.Helpers;
using Game;
using System.Collections.Generic;
using System.ComponentModel;
using System.Linq;
using Unity.Mathematics;

namespace ExtraTheme.Systems.UI.ThemePanel
{
    internal partial class ThemeExtraPanel : ExtraPanelBase
    {
        public override GameMode gameMode => GameMode.Game | GameMode.Editor | GameMode.MainMenu;

        protected override bool m_CanFullScreen => true;

        public override float2 PanelMinSize => new float2(360, 300);

        private GetterValueBinding<List<CssDeclaration>> m_CssDeclarationsBinding;
        private GetterValueBinding<List<Theme>> m_AvailableThemesBinding;
        private GetterValueBinding<string> m_ActiveThemeNameBinding;
        private GetterValueBinding<bool> m_AutoSaveBinding;
        private GetterValueBinding<bool> m_HasUnsavedChangesBinding;

        // Edits (SetOverride) apply to this in-memory copy immediately, but only reach disk when
        // autosave is on or Save is triggered - see SetOverride/SaveTheme. Null when there's nothing
        // unsaved. m_PendingThemeName may name a theme that doesn't exist as a file yet at all (a
        // freshly-forked built-in), not just an edited existing user theme.
        private Dictionary<string, string> m_PendingOverrides;
        private string m_PendingThemeName;
        private bool m_AutoSave = false;

        protected override void OnCreate()
        {
            base.OnCreate();
            ET.Logger.Info("ThemeExtraPanel OnCreate");

            // A theme fork's name used to be written to ET.m_Setting.ActiveThemeName (and, via
            // ApplyAndSave, the settings file on disk) immediately on the first edit - before the
            // fork itself was ever saved to a theme file. If the game closed before Save/autosave
            // ran, that name survived on disk with nothing backing it, and every future launch
            // found no matching theme (SetOverride no longer persists ActiveThemeName this early,
            // but a settings file written by an older build can still have this). Falls back to
            // Default rather than leaving the panel pointed at a theme that doesn't exist.
            if (!ThemeManager.IsBuiltInName(ET.m_Setting.ActiveThemeName) && !ThemeManager.UserThemeExists(ET.m_Setting.ActiveThemeName))
            {
                ET.m_Setting.ActiveThemeName = ThemeManager.DefaultThemeName;
                ET.m_Setting.ApplyAndSave();
            }

            AddBinding(m_CssDeclarationsBinding = new GetterValueBinding<List<CssDeclaration>>("ET", "CssDeclarations", CssVariableExtractor.ExtractAll, new ListWriter<CssDeclaration>()));
            AddBinding(m_AvailableThemesBinding = new GetterValueBinding<List<Theme>>("ET", "AvailableThemes", GetAvailableThemes, new ListWriter<Theme>()));
            AddBinding(m_ActiveThemeNameBinding = new GetterValueBinding<string>("ET", "ActiveThemeName", () => ET.m_Setting.ActiveThemeName));
            AddBinding(m_AutoSaveBinding = new GetterValueBinding<bool>("ET", "AutoSave", () => m_AutoSave));
            AddBinding(m_HasUnsavedChangesBinding = new GetterValueBinding<bool>("ET", "HasUnsavedChanges", () => m_PendingOverrides != null));
            AddBinding(new TriggerBinding<string>("ET", "SelectTheme", SelectTheme));
            AddBinding(new TriggerBinding<string>("ET", "RenameTheme", RenameTheme));
            AddBinding(new TriggerBinding<string, string, bool>("ET", "ImportTheme", ImportTheme));
            AddBinding(new TriggerBinding<string, string>("ET", "SetOverride", SetOverride));
            AddBinding(new TriggerBinding<bool>("ET", "SetAutoSave", SetAutoSave));
            AddBinding(new TriggerBinding("ET", "SaveTheme", SaveTheme));

            SetPanelSize(new float2(640, 520));
        }

        // Patches in m_PendingOverrides over the disk-backed theme list, so the UI sees unsaved
        // edits without them having been written to disk yet - GetAllThemes() itself always reflects
        // only what's actually on disk.
        private List<Theme> GetAvailableThemes()
        {
            List<Theme> themes = ThemeManager.GetAllThemes();
            if (m_PendingOverrides == null) return themes;

            Theme pendingTheme = themes.FirstOrDefault(t => t.Name == m_PendingThemeName);
            if (pendingTheme != null)
            {
                pendingTheme.Overrides = m_PendingOverrides;
            }
            else
            {
                // A freshly-forked theme not saved to disk at all yet.
                themes.Add(new Theme { Name = m_PendingThemeName, IsBuiltIn = false, Overrides = m_PendingOverrides });
            }
            return themes;
        }

        private void SelectTheme(string name)
        {
            // Switching theme discards any unsaved edits on the one being left - there's no
            // multi-theme pending-edit tracking, just a single slot for whichever theme was last
            // touched.
            m_PendingOverrides = null;
            m_PendingThemeName = null;
            m_HasUnsavedChangesBinding.Update();

            ET.m_Setting.ActiveThemeName = name;
            ET.m_Setting.ApplyAndSave();
            m_ActiveThemeNameBinding.Update();
        }

        // Renames the active theme - refuses built-ins, empty names, and collisions with another
        // theme (ThemeManager.RenameUserTheme). A still-unsaved forked theme (m_PendingThemeName set,
        // no file on disk yet) just gets its in-memory name updated instead of touching disk at all.
        private void RenameTheme(string newName)
        {
            if (string.IsNullOrWhiteSpace(newName)) return;
            string oldName = ET.m_Setting.ActiveThemeName;
            if (newName == oldName) return;
            if (ThemeManager.IsBuiltInName(newName) || ThemeManager.UserThemeExists(newName)) return;

            bool unsavedFork = m_PendingThemeName == oldName && !ThemeManager.UserThemeExists(oldName);
            if (!unsavedFork)
            {
                Theme active = ThemeManager.GetAllThemes().FirstOrDefault(t => t.Name == oldName);
                if (active == null || active.IsBuiltIn) return;
                if (!ThemeManager.RenameUserTheme(oldName, newName)) return;
            }

            if (m_PendingThemeName == oldName) m_PendingThemeName = newName;

            ET.m_Setting.ActiveThemeName = newName;
            ET.m_Setting.ApplyAndSave();
            m_ActiveThemeNameBinding.Update();
            m_AvailableThemesBinding.Update();
        }

        // Creates (or, with overwrite, replaces) a user theme from imported JSON (a plain
        // {"--var": "value", ...} map, see ExportImportDialogs.tsx) and switches to it. Refuses a
        // built-in name always; refuses an already-taken name unless overwrite is set (the conflict
        // dialog - ImportConflictDialog - is what sets it, after the user explicitly chose
        // "Overwrite" over "Rename"). Discards any unsaved pending edits on whatever theme was
        // active before, same as SelectTheme.
        private void ImportTheme(string name, string overridesJson, bool overwrite)
        {
            if (string.IsNullOrWhiteSpace(name)) return;
            if (ThemeManager.IsBuiltInName(name)) return;
            if (!overwrite && ThemeManager.UserThemeExists(name)) return;
            if (!ThemeManager.TryParseOverrides(overridesJson, out Dictionary<string, string> overrides)) return;

            m_PendingOverrides = null;
            m_PendingThemeName = null;

            ThemeManager.SaveUserTheme(name, overrides);

            ET.m_Setting.ActiveThemeName = name;
            ET.m_Setting.ApplyAndSave();
            m_ActiveThemeNameBinding.Update();
            m_AvailableThemesBinding.Update();
            m_HasUnsavedChangesBinding.Update();
        }

        // Applies one CSS variable's override to the active theme in memory (visible immediately -
        // RegisterThemePanel.tsx applies AvailableThemes/ActiveThemeName live), forking a built-in
        // theme into a new (not-yet-saved) user theme name first since built-ins are read-only. Only
        // reaches disk if autosave is on or the user hits Save (SaveTheme).
        private void SetOverride(string variableName, string rawValue)
        {
            string themeName = m_PendingThemeName ?? ET.m_Setting.ActiveThemeName;
            Theme active = ThemeManager.GetAllThemes().FirstOrDefault(t => t.Name == themeName);

            Dictionary<string, string> overrides = new Dictionary<string, string>(
                m_PendingOverrides ?? active?.Overrides ?? new Dictionary<string, string>());

            if (m_PendingThemeName == null && (active?.IsBuiltIn ?? false))
            {
                themeName = ThemeManager.GenerateForkName(active.Name);
                // In-memory only, not ApplyAndSave'd yet - this name has no theme file behind it
                // until SaveTheme() actually writes one (autosave or the Save button). Persisting it
                // to the settings file this early would leave a dangling reference on disk if the
                // game closes first (see the OnCreate comment above).
                ET.m_Setting.ActiveThemeName = themeName;
                m_ActiveThemeNameBinding.Update();
            }

            overrides[variableName] = rawValue;
            m_PendingOverrides = overrides;
            m_PendingThemeName = themeName;

            if (m_AutoSave)
            {
                SaveTheme();
            }
            else
            {
                m_AvailableThemesBinding.Update();
                m_HasUnsavedChangesBinding.Update();
            }
            ET.Logger.Info($"SetOverride: variable=\"{variableName}\", value=\"{rawValue}\", theme=\"{themeName}\".");
        }

        private void SetAutoSave(bool value)
        {
            m_AutoSave = value;
            m_AutoSaveBinding.Update();
            if (value) SaveTheme();
        }

        private void SaveTheme()
        {
            if (m_PendingOverrides == null || m_PendingThemeName == null) return;

            ThemeManager.SaveUserTheme(m_PendingThemeName, m_PendingOverrides);
            m_PendingOverrides = null;
            m_PendingThemeName = null;

            // A fork's ActiveThemeName is only set in memory (see SetOverride) until this point -
            // now that a real file backs it, it's safe to persist.
            ET.m_Setting.ApplyAndSave();

            m_AvailableThemesBinding.Update();
            m_HasUnsavedChangesBinding.Update();
        }

        // ThemeManager.GetAllThemes() already re-reads every file from disk on every call (no
        // caching) - reloading is just re-pushing the binding so the UI re-pulls it, for the
        // "Reload Theme" button in the mod settings (new/edited user theme files on disk).
        internal void ReloadThemes()
        {
            m_AvailableThemesBinding.Update();
        }

        protected override void OnProcess()
        {
        }
    }
}
