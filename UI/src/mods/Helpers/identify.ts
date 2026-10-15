import { setIdentifyOverride } from "./themeStyleSheet";

// Identify: hovering a palette group, a member or an Advanced color card flashes those variables in the whole UI.

const kFlashColor = "#ff00ff";
const kBlinkMs = 350;
// So sweeping the mouse across the panel doesn't flash every card.
const kStartDelayMs = 200;

let current: string[] | null = null;
let on = false;
let delayTimer: number | null = null;
let blinkTimer: number | null = null;
// Set while a color picker is open.
let blocked = false;

const clearTimers = () => {
    if (delayTimer !== null) clearTimeout(delayTimer);
    if (blinkTimer !== null) clearInterval(blinkTimer);
    delayTimer = blinkTimer = null;
};

const apply = () => setIdentifyOverride(current ?? [], current && on ? kFlashColor : null);

export const startIdentify = (names: string[]) => {
    if (blocked || names.length === 0) return;
    // Already flashing: switch at once, no new delay.
    const flashing = blinkTimer !== null;
    clearTimers();
    current = names;
    const begin = () => {
        delayTimer = null;
        on = true;
        apply();
        blinkTimer = window.setInterval(() => { on = !on; apply(); }, kBlinkMs);
    };
    if (flashing) begin();
    else delayTimer = window.setTimeout(begin, kStartDelayMs);
};

export const stopIdentify = () => {
    clearTimers();
    if (current === null) return;
    current = null;
    on = false;
    apply();
};

export const setIdentifyBlocked = (value: boolean) => {
    blocked = value;
    if (value) stopIdentify();
};
