namespace ExtraUITheme.Helpers
{
    // Registers Resources/Icons as a coui:// host location so <img src="coui://extratheme/Icons/..."> resolves in the UI.
    internal static class Icons
    {
        internal const string IconsResourceKey = "extratheme";
        internal static readonly string COUIBaseLocation = $"coui://{IconsResourceKey}";

        public static readonly string ThemePanel = $"{COUIBaseLocation}/Icons/ThemePanel/Icon.svg";

        internal static void LoadIcons(string path)
        {
            ExtraLib.Helpers.Icons.LoadIconsFolder(IconsResourceKey, path);
        }
    }
}
