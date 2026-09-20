using Colossal.UI.Binding;
using ExtraLib.Systems.UI.ExtraPanels;
using ExtraUITheme.Helpers;
using Game;
using System.Collections.Generic;
using Unity.Mathematics;

namespace ExtraUITheme.Systems.UI.ThemePanel
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
            EUT.Logger.Info("ThemeExtraPanel OnCreate");

            ThemeManager.Initialize();
            ValidateActiveThemeName();

            AddBinding(m_CssDeclarationsBinding = new GetterValueBinding<List<CssDeclaration>>("EUT", "CssDeclarations", CssVariableExtractor.ExtractAll, new ListWriter<CssDeclaration>()));
            AddBinding(m_AvailableThemesBinding = new GetterValueBinding<List<Theme>>("EUT", "AvailableThemes", ThemeManager.GetAllThemes, new ListWriter<Theme>()));
            AddBinding(m_ActiveThemeNameBinding = new GetterValueBinding<string>("EUT", "ActiveThemeName", () => EUT.m_Setting.ActiveThemeName));
            AddBinding(m_AutoSaveBinding = new GetterValueBinding<bool>("EUT", "AutoSave", () => m_AutoSave));
            AddBinding(m_HasUnsavedChangesBinding = new GetterValueBinding<bool>("EUT", "HasUnsavedChanges", () => ThemeManager.GetTheme(EUT.m_Setting.ActiveThemeName)?.IsDirty ?? false));
            AddBinding(new TriggerBinding<string>("EUT", "SelectTheme", SelectTheme));
            AddBinding(new TriggerBinding<string>("EUT", "RenameTheme", RenameTheme));
            AddBinding(new TriggerBinding("EUT", "DeleteTheme", DeleteTheme));
            AddBinding(new TriggerBinding<string, string, bool>("EUT", "ImportTheme", ImportTheme));
            AddBinding(new TriggerBinding<string, string>("EUT", "SetOverride", SetOverride));
            AddBinding(new TriggerBinding<bool>("EUT", "SetAutoSave", SetAutoSave));
            AddBinding(new TriggerBinding("EUT", "SaveTheme", SaveTheme));

            SetPanelSize(new float2(640, 520));
        }

        // Falls back to Default if the active theme name doesn't match any known theme (e.g. a stale settings file from an older build).
        private void ValidateActiveThemeName()
        {
            if (ThemeManager.GetTheme(EUT.m_Setting.ActiveThemeName) != null) return;
            EUT.m_Setting.ActiveThemeName = ThemeManager.DefaultThemeName;
            EUT.m_Setting.ApplyAndSave();
        }

        private void SelectTheme(string name)
        {
            if (ThemeManager.GetTheme(name) == null) return;

            EUT.m_Setting.ActiveThemeName = name;
            EUT.m_Setting.ApplyAndSave();
            m_ActiveThemeNameBinding.Update();
        }

        private void RenameTheme(string newName)
        {
            Theme active = ThemeManager.GetTheme(EUT.m_Setting.ActiveThemeName);
            if (!ThemeManager.Rename(active, newName)) return;

            EUT.m_Setting.ActiveThemeName = active.Name;
            EUT.m_Setting.ApplyAndSave();
            m_ActiveThemeNameBinding.Update();
            m_AvailableThemesBinding.Update();
        }

        // Confirmation already happened on the UI side (DeleteThemeDialog) by the time this fires.
        private void DeleteTheme()
        {
            Theme active = ThemeManager.GetTheme(EUT.m_Setting.ActiveThemeName);
            if (active == null || active.IsBuiltIn) return;

            ThemeManager.Delete(active);

            EUT.m_Setting.ActiveThemeName = ThemeManager.DefaultThemeName;
            EUT.m_Setting.ApplyAndSave();
            m_ActiveThemeNameBinding.Update();
            m_AvailableThemesBinding.Update();
            m_HasUnsavedChangesBinding.Update();
        }

        // `overwrite` is set only by ImportConflictDialog's "Overwrite", after the user explicitly chose that over "Rename".
        private void ImportTheme(string name, string overridesJson, bool overwrite)
        {
            if (!ThemeManager.TryParseOverrides(overridesJson, out Dictionary<string, string> overrides)) return;
            Theme imported = ThemeManager.Import(name, overrides, overwrite);
            if (imported == null) return;

            EUT.m_Setting.ActiveThemeName = imported.Name;
            EUT.m_Setting.ApplyAndSave();
            m_ActiveThemeNameBinding.Update();
            m_AvailableThemesBinding.Update();
            m_HasUnsavedChangesBinding.Update();
        }

        // Forks a built-in theme into a new user theme first, since built-ins are read-only.
        private void SetOverride(string variableName, string rawValue)
        {
            Theme active = ThemeManager.GetTheme(EUT.m_Setting.ActiveThemeName);
            if (active == null) return;

            if (active.IsBuiltIn)
            {
                active = ThemeManager.Fork(active);
                // In-memory only until SaveTheme() writes a file - not persisted to settings yet.
                EUT.m_Setting.ActiveThemeName = active.Name;
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
            Theme active = ThemeManager.GetTheme(EUT.m_Setting.ActiveThemeName);
            if (active == null || !active.IsDirty) return;
            if (!ThemeManager.Save(active)) return;

            // Now backed by a real file - safe to persist (see ValidateActiveThemeName/SetOverride).
            EUT.m_Setting.ApplyAndSave();

            m_AvailableThemesBinding.Update();
            m_HasUnsavedChangesBinding.Update();
        }

        // For the "Reload Theme" settings button - anything only in memory and never saved is lost.
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
