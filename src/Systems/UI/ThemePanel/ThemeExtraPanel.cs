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

        protected override void OnCreate()
        {
            base.OnCreate();
            ET.Logger.Info("ThemeExtraPanel OnCreate");

            AddBinding(m_CssDeclarationsBinding = new GetterValueBinding<List<CssDeclaration>>("ET", "CssDeclarations", CssVariableExtractor.ExtractAll, new ListWriter<CssDeclaration>()));
            AddBinding(m_AvailableThemesBinding = new GetterValueBinding<List<Theme>>("ET", "AvailableThemes", ThemeManager.GetAllThemes, new ListWriter<Theme>()));
            AddBinding(m_ActiveThemeNameBinding = new GetterValueBinding<string>("ET", "ActiveThemeName", () => ET.m_Setting.ActiveThemeName));
            AddBinding(new TriggerBinding<string>("ET", "SelectTheme", SelectTheme));

            SetPanelSize(new float2(640, 520));
        }

        private void SelectTheme(string name)
        {
            ET.m_Setting.ActiveThemeName = name;
            ET.m_Setting.ApplyAndSave();
            m_ActiveThemeNameBinding.Update();
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
