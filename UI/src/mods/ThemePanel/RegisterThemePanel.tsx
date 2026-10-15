import { useEffect, useMemo, useRef } from "react";
import { bindValue, trigger, useValue } from "cs2/api";
import { registry } from "index";
import { ThemeExtraPanel } from "mods/ThemeExtraPanel/ThemeExtraPanel";
import { Theme } from "mods/ThemeExtraPanel/ThemeTypes";
import { setThemeOverrides } from "mods/Helpers/themeStyleSheet";
import { CssDeclaration } from "mods/ThemeExtraPanel/DeclarationRow/CssDeclarationTypes";
import { analyzeGamePalette, planPaletteSync } from "mods/Helpers/palette";

const availableThemes$ = bindValue<Theme[]>("EUT", "AvailableThemes");
const activeThemeName$ = bindValue<string>("EUT", "ActiveThemeName");
const cssDeclarations$ = bindValue<CssDeclaration[]>("EUT", "CssDeclarations");
const cssVarUsages$ = bindValue<Record<string, number>>("EUT", "CssVarUsages");

export const RegisterThemePanel = () => {

    useEffect(() => {
        console.log("Registering ThemeExtraPanel...");
        if (registry.registry.has("ExtraLib/ExtraPanels/ExtraPanelsRoot/ExtraPanelsRoot"))
        {
            registry.extend("ExtraLib/ExtraPanels/ExtraPanelsRoot/ExtraPanelsRoot", "extraPanelsComponents", ThemeExtraPanel)
            console.log("ThemeExtraPanel registered.");
        }
        else
            console.warn("ExtraPanelsRoot not found, ThemeExtraPanel will not be loaded");
    }, []);

    // Applies the active theme's overrides to the live UI regardless of whether ThemeExtraPanel itself is open.
    const availableThemes = useValue(availableThemes$) ?? [];
    const activeThemeName = useValue(activeThemeName$);

    useEffect(() => {
        if (!activeThemeName) return;
        const theme = availableThemes.find((t) => t.name === activeThemeName);
        if (!theme) return;

        const overrides = theme.overrides ?? {};
        console.log(`Applying theme "${activeThemeName}" with ${Object.keys(overrides).length} overrides.`);
        setThemeOverrides(overrides);
    }, [availableThemes, activeThemeName]);

    // Palette sync: re-derives the active theme's palette against the current game CSS, even with the panel closed.
    const declarations = useValue(cssDeclarations$);
    const usages = useValue(cssVarUsages$);
    const groups = useMemo(() => analyzeGamePalette(declarations, usages), [declarations, usages]);
    // Never sends the same payload twice for a theme, so a rejected sync can't loop.
    const lastSync = useRef("");

    useEffect(() => {
        const theme = availableThemes.find((t) => t.name === activeThemeName);
        if (!groups || !theme) return;
        const sync = planPaletteSync(theme, groups);
        if (!sync) return;
        const key = `${activeThemeName}|${JSON.stringify(sync)}`;
        if (key === lastSync.current) return;
        lastSync.current = key;
        console.log(`Syncing the palette of "${activeThemeName}": ${Object.keys(sync.Values).length} values, ${sync.Names.length} removed.`);
        trigger("EUT", "SyncPalette", sync);
    }, [groups, availableThemes, activeThemeName]);

    return null;
};
