using Colossal.IO.AssetDatabase;
using Colossal.Logging;
using ExtraLib.Debugger;
using ExtraLib.Helpers;
using ExtraLib.Systems.UI.ExtraPanels;
using ExtraTheme.Systems.UI.ThemePanel;
using Game;
using Game.Modding;
using Game.SceneFlow;
using System.Reflection;

namespace ExtraTheme
{
    public class ET : IMod
    {
        private static readonly ILog log = LogManager.GetLogger($"{nameof(ExtraTheme)}.{nameof(ET)}").SetShowsErrorsInUI(false);
#if DEBUG
        internal static Logger Logger = new(log, true);
#else
        internal static Logger Logger = new(log, false);
#endif
        internal static Setting m_Setting;
        internal static ThemeExtraPanel m_ThemePanel;

        public void OnLoad(UpdateSystem updateSystem)
        {
            log.Info(nameof(OnLoad));

            if (GameManager.instance.modManager.TryGetExecutableAsset(this, out var asset))
                log.Info($"Current mod asset at {asset.path}");

            m_Setting = new Setting(this);
            m_Setting.RegisterInOptionsUI();

            AssetDatabase.global.LoadSettings(nameof(ExtraTheme), m_Setting, new Setting(this));

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
