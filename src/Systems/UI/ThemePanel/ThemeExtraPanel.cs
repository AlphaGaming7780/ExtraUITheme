using Colossal.UI.Binding;
using ExtraLib.Systems.UI.ExtraPanels;
using ExtraTheme.Helpers;
using Game;
using System.Collections.Generic;
using Unity.Mathematics;

namespace ExtraTheme.Systems.UI.ThemePanel
{
    internal partial class ThemeExtraPanel : ExtraPanelBase
    {
        public override GameMode gameMode => GameMode.Game | GameMode.Editor | GameMode.MainMenu;

        public override string Icon => Icons.ThemePanel;

        protected override bool m_CanFullScreen => true;

        public override float2 PanelMinSize => new float2(360, 300);

        private GetterValueBinding<List<CssDeclaration>> m_CssDeclarationsBinding;
        private GetterValueBinding<List<Theme>> m_AvailableThemesBinding;
        private GetterValueBinding<string> m_ActiveThemeNameBinding;
        private GetterValueBinding<bool> m_AutoSaveBinding;
        private GetterValueBinding<bool> m_HasUnsavedChangesBinding;
        private bool m_AutoSave = false;

        protected override void OnCreate()
        {
            base.OnCreate();
            ET.Logger.Info("ThemeExtraPanel OnCreate");

            ThemeManager.Initialize();
            ValidateActiveThemeName();

            AddBinding(m_CssDeclarationsBinding = new GetterValueBinding<List<CssDeclaration>>("ET", "CssDeclarations", CssVariableExtractor.ExtractAll, new ListWriter<CssDeclaration>()));
            AddBinding(m_AvailableThemesBinding = new GetterValueBinding<List<Theme>>("ET", "AvailableThemes", ThemeManager.GetAllThemes, new ListWriter<Theme>()));
            AddBinding(m_ActiveThemeNameBinding = new GetterValueBinding<string>("ET", "ActiveThemeName", () => ET.m_Setting.ActiveThemeName));
            AddBinding(m_AutoSaveBinding = new GetterValueBinding<bool>("ET", "AutoSave", () => m_AutoSave));
            AddBinding(m_HasUnsavedChangesBinding = new GetterValueBinding<bool>("ET", "HasUnsavedChanges", () => ThemeManager.GetTheme(ET.m_Setting.ActiveThemeName)?.IsDirty ?? false));
            AddBinding(new TriggerBinding<string>("ET", "SelectTheme", SelectTheme));
            AddBinding(new TriggerBinding<string>("ET", "RenameTheme", RenameTheme));
            AddBinding(new TriggerBinding("ET", "DeleteTheme", DeleteTheme));
            AddBinding(new TriggerBinding<string, string, bool>("ET", "ImportTheme", ImportTheme));
            AddBinding(new TriggerBinding<string, string>("ET", "SetOverride", SetOverride));
            AddBinding(new TriggerBinding<bool>("ET", "SetAutoSave", SetAutoSave));
            AddBinding(new TriggerBinding("ET", "SaveTheme", SaveTheme));

            SetPanelSize(new float2(640, 520));
        }

        // Falls back to Default if ET.m_Setting.ActiveThemeName doesn't name a theme ThemeManager
        // actually knows about (a theme fork's name used to be persisted to the settings file before
        // the fork itself was ever saved - if the game closed first, the setting survived pointing
        // at nothing; SetOverride no longer does that, but a settings file from an older build can
        // still have it). Called after every (re)load of the theme cache.
        private void ValidateActiveThemeName()
        {
            if (ThemeManager.GetTheme(ET.m_Setting.ActiveThemeName) != null) return;
            ET.m_Setting.ActiveThemeName = ThemeManager.DefaultThemeName;
            ET.m_Setting.ApplyAndSave();
        }

        private void SelectTheme(string name)
        {
            if (ThemeManager.GetTheme(name) == null) return;

            ET.m_Setting.ActiveThemeName = name;
            ET.m_Setting.ApplyAndSave();
            m_ActiveThemeNameBinding.Update();
        }

        // Renames the active theme - refuses built-ins, empty/unchanged names, and collisions with
        // any other known theme (ThemeManager.Rename).
        private void RenameTheme(string newName)
        {
            Theme active = ThemeManager.GetTheme(ET.m_Setting.ActiveThemeName);
            if (!ThemeManager.Rename(active, newName)) return;

            ET.m_Setting.ActiveThemeName = active.Name;
            ET.m_Setting.ApplyAndSave();
            m_ActiveThemeNameBinding.Update();
            m_AvailableThemesBinding.Update();
        }

        // Deletes the active theme (refuses built-ins, ThemeManager.Delete) and falls back to
        // Default - same reasoning as ValidateActiveThemeName, just triggered by the user instead
        // of a stale settings file. The confirm step lives entirely on the UI side
        // (DeleteThemeDialog) - by the time this fires the user has already agreed.
        private void DeleteTheme()
        {
            Theme active = ThemeManager.GetTheme(ET.m_Setting.ActiveThemeName);
            if (active == null || active.IsBuiltIn) return;

            ThemeManager.Delete(active);

            ET.m_Setting.ActiveThemeName = ThemeManager.DefaultThemeName;
            ET.m_Setting.ApplyAndSave();
            m_ActiveThemeNameBinding.Update();
            m_AvailableThemesBinding.Update();
            m_HasUnsavedChangesBinding.Update();
        }

        // Creates (or, with overwrite, replaces) a user theme from imported JSON (a plain
        // {"--var": "value", ...} map, see ExportImportDialogs.tsx) and switches to it. `overwrite`
        // is set only by ImportConflictDialog's "Overwrite", after the user explicitly chose that
        // over "Rename".
        private void ImportTheme(string name, string overridesJson, bool overwrite)
        {
            if (!ThemeManager.TryParseOverrides(overridesJson, out Dictionary<string, string> overrides)) return;
            Theme imported = ThemeManager.Import(name, overrides, overwrite);
            if (imported == null) return;

            ET.m_Setting.ActiveThemeName = imported.Name;
            ET.m_Setting.ApplyAndSave();
            m_ActiveThemeNameBinding.Update();
            m_AvailableThemesBinding.Update();
            m_HasUnsavedChangesBinding.Update();
        }

        // Applies one CSS variable's override to the active theme (visible immediately -
        // RegisterThemePanel.tsx applies AvailableThemes/ActiveThemeName live), forking a built-in
        // theme into a new (not-yet-saved) user theme first since built-ins are read-only. Only
        // reaches disk if autosave is on or the user hits Save (SaveTheme).
        private void SetOverride(string variableName, string rawValue)
        {
            Theme active = ThemeManager.GetTheme(ET.m_Setting.ActiveThemeName);
            if (active == null) return;

            if (active.IsBuiltIn)
            {
                active = ThemeManager.Fork(active);
                // In-memory only - this name has no theme file behind it until SaveTheme() actually
                // writes one. Persisting it to the settings file this early would leave a dangling
                // reference on disk if the game closes before that happens (see
                // ValidateActiveThemeName).
                ET.m_Setting.ActiveThemeName = active.Name;
                m_ActiveThemeNameBinding.Update();
            }

            active.SetOverride(variableName, rawValue);

            if (m_AutoSave)
            {
                SaveTheme();
            }
            else
            {
                m_AvailableThemesBinding.Update();
                m_HasUnsavedChangesBinding.Update();
            }
        }

        private void SetAutoSave(bool value)
        {
            m_AutoSave = value;
            m_AutoSaveBinding.Update();
            if (value) SaveTheme();
        }

        private void SaveTheme()
        {
            Theme active = ThemeManager.GetTheme(ET.m_Setting.ActiveThemeName);
            if (active == null || !active.IsDirty) return;
            if (!ThemeManager.Save(active)) return;

            // Now backed by a real file - safe to persist (see ValidateActiveThemeName/SetOverride).
            ET.m_Setting.ApplyAndSave();

            m_AvailableThemesBinding.Update();
            m_HasUnsavedChangesBinding.Update();
        }

        // Re-reads every theme file from disk - for the "Reload Theme" button in the mod settings
        // (new/edited user theme files on disk). Anything only in memory and never saved (a fork, an
        // in-progress rename on any theme, not just the active one) is lost - ThemeManager.Initialize
        // only knows what's actually on disk.
        internal void ReloadThemes()
        {
            ThemeManager.Initialize();
            ValidateActiveThemeName();
            m_ActiveThemeNameBinding.Update();
            m_AvailableThemesBinding.Update();
        }

        protected override void OnProcess()
        {
        }
    }
}
