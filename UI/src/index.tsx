import { ModRegistrar, ModuleRegistry } from "cs2/modding";
import { HelloWorldComponent } from "mods/hello-world";
import { RegisterThemePanel } from "mods/ThemePanel/RegisterThemePanel";

export var registry: ModuleRegistry;

const register: ModRegistrar = (moduleRegistry) => {

    registry = moduleRegistry;

    moduleRegistry.append('Menu', HelloWorldComponent);

    moduleRegistry.append('Menu', RegisterThemePanel);
    moduleRegistry.append('Game', RegisterThemePanel);
    moduleRegistry.append('Editor', RegisterThemePanel);
}

export default register;