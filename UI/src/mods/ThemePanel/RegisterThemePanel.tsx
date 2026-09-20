import { useEffect, useRef } from "react";
import { bindValue, useValue } from "cs2/api";
import { registry } from "index";
import { ThemeExtraPanel } from "mods/ThemeExtraPanel/ThemeExtraPanel";
import { Theme } from "mods/ThemeExtraPanel/ThemeTypes";

const availableThemes$ = bindValue<Theme[]>("EUT", "AvailableThemes");
const activeThemeName$ = bindValue<string>("EUT", "ActiveThemeName");

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
    const appliedPropertyNames = useRef<Set<string>>(new Set());

    useEffect(() => {
        if (!activeThemeName) return;
        const theme = availableThemes.find((t) => t.name === activeThemeName);
        if (!theme) return;

        const overrides = theme.overrides ?? {};

        const root = document.documentElement.style;
        const nextNames = new Set(Object.keys(overrides));

        console.log(`Applying theme "${activeThemeName}" with ${nextNames.size} overrides.`);

        for (const name of appliedPropertyNames.current) {
            if (!nextNames.has(name)) root.removeProperty(name);
        }
        for (const [name, value] of Object.entries(overrides)) {
            root.setProperty(name, value);
        }
        appliedPropertyNames.current = nextNames;
    }, [availableThemes, activeThemeName]);

    return null;
};
