using Colossal.IO.AssetDatabase;
using Colossal.Logging;
using ExtraLib.Debugger;
using ExtraLib.Helpers;
using ExtraLib.Systems.UI.ExtraPanels;
using ExtraUITheme.Helpers;
using ExtraUITheme.Systems.UI.ThemePanel;
using Game;
using Game.Modding;
using Game.SceneFlow;
using System.IO;
using System.Reflection;

namespace ExtraUITheme
{
    public class EUT : IMod
    {
        private static readonly ILog log = LogManager.GetLogger($"{nameof(ExtraUITheme)}.{nameof(EUT)}").SetShowsErrorsInUI(false);
#if DEBUG
        internal static Logger Logger = new(log, true);
#else
        internal static Logger Logger = new(log, false);
#endif
        internal static Setting m_Setting;
        internal static ThemeExtraPanel m_ThemePanel;

        public void OnLoad(UpdateSystem updateSystem)
        {
            EUT.Logger.Info(nameof(OnLoad));

            if (GameManager.instance.modManager.TryGetExecutableAsset(this, out var asset))
            {
                EUT.Logger.Info($"Current mod asset at {asset.path}");
                ExtraUITheme.Helpers.Icons.LoadIcons(new FileInfo(asset.path).DirectoryName);
            }
            else
            {
                EUT.Logger.Warn("Failed to get the executable.");
            }

            m_Setting = new Setting(this);
            m_Setting.RegisterInOptionsUI();
            m_Setting.RegisterKeyBindings();

            AssetDatabase.global.LoadSettings(nameof(ExtraUITheme), m_Setting, new Setting(this));

            ExtraLocalization.LoadLocalization(Logger, Assembly.GetExecutingAssembly(), false);

            ExtraPanelsUISystem extraPanelsUISystem = updateSystem.World.GetOrCreateSystemManaged<ExtraPanelsUISystem>();
            m_ThemePanel = extraPanelsUISystem.AddExtraPanel<ThemeExtraPanel>();
        }

        public void OnDispose()
        {
            log.Info(nameof(OnDispose));
            if (m_Setting != null)
            {
                m_Setting.UnregisterInOptionsUI();
                m_Setting = null;
            }
            m_ThemePanel = null;
        }
    }
}
