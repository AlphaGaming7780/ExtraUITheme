using Colossal;
using Colossal.IO.AssetDatabase;
using ExtraUITheme.Helpers;
using Game.Input;
using Game.Modding;
using Game.Settings;
using Game.UI;
using Game.UI.Widgets;
using System.Collections.Generic;

namespace ExtraUITheme
{
    [FileLocation(nameof(ExtraUITheme))]
    [SettingsUIGroupOrder(kThemesGroup, kKeybindingGroup)]
    [SettingsUIShowGroupName(kThemesGroup, kKeybindingGroup)]
    [SettingsUIKeyboardAction(nameof(UndoBinding), kUsage)]
    [SettingsUIKeyboardAction(nameof(RedoBinding), kUsage)]
    public class Setting : ModSetting
    {
        public const string kMainSection = "Main";
        public const string kThemesGroup = "Themes";
        public const string kKeybindingGroup = "KeyBinding";
        public const string kUsage = "EUT.ThemePanel";

        public Setting(IMod mod) : base(mod)
        {

        }

        [SettingsUIHidden]
        public string ActiveThemeName { get; set; } = ThemeManager.DefaultThemeName;

        [SettingsUIKeyboardBinding(BindingKeyboard.Z, nameof(UndoBinding), ctrl: true)]
        [SettingsUISection(kMainSection, kKeybindingGroup)]
        public ProxyBinding UndoBinding { get; set; }

        [SettingsUIKeyboardBinding(BindingKeyboard.Y, nameof(RedoBinding), ctrl: true)]
        [SettingsUISection(kMainSection, kKeybindingGroup)]
        public ProxyBinding RedoBinding { get; set; }

        [SettingsUIButton]
        [SettingsUISection(kMainSection, kThemesGroup)]
        public bool ReloadThemes { set { EUT.m_ThemePanel?.ReloadThemes(); } }

        public override void SetDefaults()
        {
            ActiveThemeName = ThemeManager.DefaultThemeName;
        }
    }
}
