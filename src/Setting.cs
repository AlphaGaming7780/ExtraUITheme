using Colossal;
using Colossal.IO.AssetDatabase;
using ExtraTheme.Helpers;
using Game.Modding;
using Game.Settings;
using Game.UI;
using Game.UI.Widgets;
using System.Collections.Generic;

namespace ExtraTheme
{
    [FileLocation(nameof(ExtraTheme))]
    [SettingsUIGroupOrder(kThemesGroup)]
    [SettingsUIShowGroupName(kThemesGroup)]
    public class Setting : ModSetting
    {
        public const string kMainSection = "Main";
        public const string kThemesGroup = "Themes";

        public Setting(IMod mod) : base(mod)
        {

        }

        [SettingsUIHidden]
        public string ActiveThemeName { get; set; } = ThemeManager.DefaultThemeName;

        [SettingsUIButton]
        [SettingsUISection(kMainSection, kThemesGroup)]
        public bool ReloadThemes { set { ET.m_ThemePanel?.ReloadThemes(); } }

        public override void SetDefaults()
        {
            ActiveThemeName = ThemeManager.DefaultThemeName;
        }
    }
}
