using Colossal.UI.Binding;
using ExtraLib.Systems.UI.ExtraPanels;
using ExtraUITheme.Helpers;
using Game;
using Game.Input;
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

        private readonly List<HistoryEntry> m_UndoStack = new();
        private readonly List<HistoryEntry> m_RedoStack = new();

        private ProxyAction m_UndoAction, m_RedoAction;
        private EventBinding<int> m_OnUndoShortcut, m_OnRedoShortcut;

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
            AddBinding(new TriggerBinding("EUT", "CloneTheme", CloneTheme));
            AddBinding(new TriggerBinding<string, string, bool>("EUT", "ImportTheme", ImportTheme));
            AddBinding(new TriggerBinding<string, string>("EUT", "SetOverride", SetOverride));
            AddBinding(new TriggerBinding<bool>("EUT", "SetAutoSave", SetAutoSave));
            AddBinding(new TriggerBinding("EUT", "SaveTheme", SaveTheme));
            AddBinding(new TriggerBinding("EUT", "Undo", Undo));
            AddBinding(new TriggerBinding("EUT", "Redo", Redo));

            AddBinding(m_OnUndoShortcut = new EventBinding<int>("EUT", "OnUndoShortcut"));
            AddBinding(m_OnRedoShortcut = new EventBinding<int>("EUT", "OnRedoShortcut"));

            m_UndoAction = EUT.m_Setting.GetAction(EUT.m_Setting.UndoBinding.actionName);
            m_RedoAction = EUT.m_Setting.GetAction(EUT.m_Setting.RedoBinding.actionName);
            m_UndoAction.shouldBeEnabled = true;
            m_RedoAction.shouldBeEnabled = true;

            SetPanelSize(new float2(640, 520));
        }

        protected override void OnDestroy()
        {
            m_UndoAction.shouldBeEnabled = false;
            m_RedoAction.shouldBeEnabled = false;
            base.OnDestroy();
        }

        protected override void OnPreProcess()
        {
            if (m_UndoAction.WasPressedThisFrame()) m_OnUndoShortcut.Trigger(0);
            if (m_RedoAction.WasPressedThisFrame()) m_OnRedoShortcut.Trigger(0);
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
            ClearHistory();
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
            ClearHistory();
            m_ActiveThemeNameBinding.Update();
            m_AvailableThemesBinding.Update();
            m_HasUnsavedChangesBinding.Update();
        }

        // Duplicates the active theme (built-in or user) into a new "(copy)" entry - same Fork() a built-in already goes through on its first edit (SetOverride below).
        private void CloneTheme()
        {
            Theme active = ThemeManager.GetTheme(EUT.m_Setting.ActiveThemeName);
            if (active == null) return;

            Theme cloned = ThemeManager.Fork(active);

            EUT.m_Setting.ActiveThemeName = cloned.Name;
            ClearHistory();
            m_ActiveThemeNameBinding.Update();
            m_AvailableThemesBinding.Update();
            m_HasUnsavedChangesBinding.Update();

            if (m_AutoSave) SaveTheme();
        }

        // `overwrite` is set only by ImportConflictDialog's "Overwrite", after the user explicitly chose that over "Rename".
        private void ImportTheme(string name, string overridesJson, bool overwrite)
        {
            if (!ThemeManager.TryParseOverrides(overridesJson, out Dictionary<string, string> overrides)) return;
            Theme imported = ThemeManager.Import(name, overrides, overwrite);
            if (imported == null) return;

            EUT.m_Setting.ActiveThemeName = imported.Name;
            EUT.m_Setting.ApplyAndSave();
            ClearHistory();
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

            active.Overrides.TryGetValue(variableName, out string previousValue);
            PushHistory(variableName, previousValue, rawValue);

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
            ClearHistory();
            m_ActiveThemeNameBinding.Update();
            m_AvailableThemesBinding.Update();
        }

        // One undoable step; PreviousValue is null when the variable had no override before the edit, meaning Undo must remove it rather than restore a value.
        private readonly struct HistoryEntry
        {
            internal readonly string VariableName;
            internal readonly string PreviousValue;
            internal readonly string NewValue;

            internal HistoryEntry(string variableName, string previousValue, string newValue)
            {
                VariableName = variableName;
                PreviousValue = previousValue;
                NewValue = newValue;
            }
        }

        // A fresh edit invalidates whatever redo history existed - standard undo/redo semantics.
        private void PushHistory(string variableName, string previousValue, string newValue)
        {
            m_UndoStack.Add(new HistoryEntry(variableName, previousValue, newValue));
            m_RedoStack.Clear();
        }

        private void ClearHistory()
        {
            m_UndoStack.Clear();
            m_RedoStack.Clear();
        }

        private void Undo()
        {
            if (m_UndoStack.Count == 0) return;

            Theme active = ThemeManager.GetTheme(EUT.m_Setting.ActiveThemeName);
            if (active == null) return;

            HistoryEntry entry = m_UndoStack[^1];
            m_UndoStack.RemoveAt(m_UndoStack.Count - 1);
            if (entry.PreviousValue == null) active.RemoveOverride(entry.VariableName);
            else active.SetOverride(entry.VariableName, entry.PreviousValue);
            m_RedoStack.Add(entry);

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

        private void Redo()
        {
            if (m_RedoStack.Count == 0) return;

            Theme active = ThemeManager.GetTheme(EUT.m_Setting.ActiveThemeName);
            if (active == null) return;

            HistoryEntry entry = m_RedoStack[^1];
            m_RedoStack.RemoveAt(m_RedoStack.Count - 1);
            active.SetOverride(entry.VariableName, entry.NewValue);
            m_UndoStack.Add(entry);

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

        protected override void OnProcess()
        {
        }
    }
}
