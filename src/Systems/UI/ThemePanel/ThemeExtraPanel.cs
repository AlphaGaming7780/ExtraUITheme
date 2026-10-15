using Colossal.UI.Binding;
using ExtraLib.Systems.UI.ExtraPanels;
using ExtraUITheme.Helpers;
using ExtraUITheme.Helpers.ThemeFormat;
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
        private EventBinding<ImportReport> m_OnImportAnalyzed;

        protected override void OnCreate()
        {
            base.OnCreate();
            EUT.Logger.Info("ThemeExtraPanel OnCreate");

            ThemeManager.Initialize();
            ValidateActiveThemeName();

            AddBinding(m_CssDeclarationsBinding = new GetterValueBinding<List<CssDeclaration>>("EUT", "CssDeclarations", CssVariableExtractor.ExtractAll, new ListWriter<CssDeclaration>()));
            // Read once: index.css doesn't change while the game runs.
            AddBinding(new GetterValueBinding<CssVarUsages>("EUT", "CssVarUsages", CssVariableExtractor.ExtractUsages, new ValueWriter<CssVarUsages>()));
            AddBinding(m_AvailableThemesBinding =new GetterValueBinding<List<Theme>>("EUT", "AvailableThemes", ThemeManager.GetAllThemes, new ListWriter<Theme>()));
            AddBinding(m_ActiveThemeNameBinding = new GetterValueBinding<string>("EUT", "ActiveThemeName", () => EUT.m_Setting.ActiveThemeName));
            AddBinding(m_AutoSaveBinding = new GetterValueBinding<bool>("EUT", "AutoSave", () => m_AutoSave));
            AddBinding(m_HasUnsavedChangesBinding = new GetterValueBinding<bool>("EUT", "HasUnsavedChanges", () => ThemeManager.GetTheme(EUT.m_Setting.ActiveThemeName)?.IsDirty ?? false));
            AddBinding(new TriggerBinding<string>("EUT", "SelectTheme", SelectTheme));
            AddBinding(new TriggerBinding<string>("EUT", "RenameTheme", RenameTheme));
            AddBinding(new TriggerBinding("EUT", "DeleteTheme", DeleteTheme));
            AddBinding(new TriggerBinding("EUT", "CloneTheme", CloneTheme));
            AddBinding(new TriggerBinding<string, string, bool>("EUT", "ImportTheme", ImportTheme));
            AddBinding(new TriggerBinding<string>("EUT", "AnalyzeImport", AnalyzeImport));
            AddBinding(new TriggerBinding("EUT", "RemoveThemeIssues", RemoveThemeIssues));
            AddBinding(new TriggerBinding<string, string>("EUT", "SetOverride", SetOverride));
            AddBinding(new TriggerBinding<PaletteCommand>("EUT", "SetPaletteColor", SetPaletteColor));
            AddBinding(new TriggerBinding<PaletteCommand>("EUT", "ResetPaletteColor", ResetPaletteColor));
            AddBinding(new TriggerBinding<string, string>("EUT", "ReattachVariable", ReattachVariable));
            AddBinding(new TriggerBinding<PaletteCommand>("EUT", "SyncPalette", SyncPalette));
            AddBinding(new TriggerBinding<bool>("EUT", "SetAutoSave", SetAutoSave));
            AddBinding(new TriggerBinding("EUT", "SaveTheme", SaveTheme));
            AddBinding(new TriggerBinding("EUT", "Undo", Undo));
            AddBinding(new TriggerBinding("EUT", "Redo", Redo));

            AddBinding(m_OnUndoShortcut = new EventBinding<int>("EUT", "OnUndoShortcut"));
            AddBinding(m_OnRedoShortcut = new EventBinding<int>("EUT", "OnRedoShortcut"));
            AddBinding(m_OnImportAnalyzed = new EventBinding<ImportReport>("EUT", "OnImportAnalyzed", new ValueWriter<ImportReport>()));

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
        // `themeJson` is the pasted text as-is (any format version); `name` is the one the UI settled on, which may differ from the file's.
        private void ImportTheme(string name, string themeJson, bool overwrite)
        {
            if (ThemeManager.TryParseImport(themeJson, out Theme parsed) != ThemeReadStatus.Ok) return;
            Theme imported = ThemeManager.Import(name, parsed, overwrite);
            if (imported == null) return;

            EUT.m_Setting.ActiveThemeName = imported.Name;
            EUT.m_Setting.ApplyAndSave();
            ClearHistory();
            m_ActiveThemeNameBinding.Update();
            m_AvailableThemesBinding.Update();
            m_HasUnsavedChangesBinding.Update();
        }

        // Triggers have no return value, so the report comes back through the OnImportAnalyzed event.
        private void AnalyzeImport(string themeJson)
        {
            m_OnImportAnalyzed.Trigger(ImportReport.Analyze(themeJson));
        }

        // "Clean up": reverts every variable with a warning to the game default, as one undo step.
        private void RemoveThemeIssues()
        {
            Theme active = ThemeManager.GetTheme(EUT.m_Setting.ActiveThemeName);
            if (active == null || active.IsBuiltIn) return;

            List<ThemeIssue> warnings = ThemeValidator.Validate(active).FindAll(i => i.IsWarning);
            if (warnings.Count == 0) return;

            Edit(theme =>
            {
                foreach (ThemeIssue issue in warnings) theme.RemoveOverride(issue.Name);
            });
        }

        // Advanced mode: a hand edit, which detaches the variable from the palette (Theme.Manual).
        private void SetOverride(string variableName, string rawValue)
        {
            Edit(theme => theme.SetOverride(variableName, rawValue));
        }

        // Simple mode: one palette color and every value derived from it, computed UI-side (palette.ts).
        private void SetPaletteColor(PaletteCommand command)
        {
            if (command.Entry == null) return;
            Edit(theme => theme.SetPaletteColor(command.Entry, command.Values));
        }

        private void ResetPaletteColor(PaletteCommand command)
        {
            if (command.Entry == null) return;
            Edit(theme => theme.ResetPaletteColor(command.Entry, command.Names));
        }

        // `value`: the palette-derived value, or null for the game default.
        private void ReattachVariable(string variableName, string value)
        {
            Edit(theme => theme.ReattachVariable(variableName, value));
        }

        // Sent by the UI when the re-derived palette differs (game update); not an undo step, clears history.
        private void SyncPalette(PaletteCommand command)
        {
            Theme active = ThemeManager.GetTheme(EUT.m_Setting.ActiveThemeName);
            if (active == null || command.Palette == null) return;

            if (!active.SyncPalette(command.Palette, command.Values, command.Names)) return;
            ClearHistory();

            // Built-ins: re-derived values live in memory only.
            if (active.IsBuiltIn) active.IsDirty = false;
            Commit();
        }

        // Every user edit: forks a built-in first, then records one undo step.
        private void Edit(System.Action<Theme> change)
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

            ThemeState before = ThemeState.Capture(active);
            change(active);
            ThemeState after = ThemeState.Capture(active);
            if (!after.SameAs(before))
            {
                m_UndoStack.Add(new HistoryEntry(before, after));
                if (m_UndoStack.Count > kMaxHistory) m_UndoStack.RemoveAt(0);
                // A fresh edit clears the redo history.
                m_RedoStack.Clear();
            }

            Commit();
        }

        private void Commit()
        {
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

        private const int kMaxHistory = 200;

        // One undoable step: the theme's whole editable state on each side (ThemeState).
        private readonly struct HistoryEntry
        {
            internal readonly ThemeState Before;
            internal readonly ThemeState After;

            internal HistoryEntry(ThemeState before, ThemeState after)
            {
                Before = before;
                After = after;
            }
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
            entry.Before.RestoreTo(active);
            m_RedoStack.Add(entry);
            Commit();
        }

        private void Redo()
        {
            if (m_RedoStack.Count == 0) return;

            Theme active = ThemeManager.GetTheme(EUT.m_Setting.ActiveThemeName);
            if (active == null) return;

            HistoryEntry entry = m_RedoStack[^1];
            m_RedoStack.RemoveAt(m_RedoStack.Count - 1);
            entry.After.RestoreTo(active);
            m_UndoStack.Add(entry);
            Commit();
        }

        protected override void OnProcess()
        {
        }
    }
}
