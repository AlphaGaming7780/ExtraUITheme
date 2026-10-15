import { RefObject, useLayoutEffect } from "react";
import { remToPx } from "./RemHelper";

// Tracks `panelRef`'s real size and publishes it as --eutDialogMaxWidth/--eutDialogMaxHeight on documentElement, so any dialog (wherever the game mounts it) can cap itself to the panel's size.
const kHeightAllowance = 160;
const kWidthMargin = 40;

// Only while `active` (a dialog is open): a variable on <html> restyles the whole UI.
export const usePanelDialogBounds = (panelRef: RefObject<HTMLElement>, active: boolean): void => {
    // Layout effect: the values are set before the dialog's first paint.
    useLayoutEffect(() => {
        const el = panelRef.current;
        if (!active || !el) return;

        let lastWidth = "";
        let lastHeight = "";
        const apply = (width: number, height: number) => {
            const root = document.documentElement.style;
            // Capped at 650rem-equivalent, since the game's own `wide` Dialog never exceeds that either.
            const nextWidth = `${Math.round(Math.min(Math.max(0, width - kWidthMargin), remToPx(650)))}px`;
            const nextHeight = `${Math.round(Math.max(0, height - kHeightAllowance))}px`;
            if (nextWidth !== lastWidth) root.setProperty("--eutDialogMaxWidth", (lastWidth = nextWidth));
            if (nextHeight !== lastHeight) root.setProperty("--eutDialogMaxHeight", (lastHeight = nextHeight));
        };

        const rect = el.getBoundingClientRect();
        apply(rect.width, rect.height);

        // rAF-coalesced: only the last size of a frame matters.
        let rafId: number | null = null;
        const observer = new ResizeObserver(() => {
            if (rafId !== null) return;
            rafId = requestAnimationFrame(() => {
                rafId = null;
                const r = el.getBoundingClientRect();
                apply(r.width, r.height);
            });
        });
        observer.observe(el);
        return () => {
            observer.disconnect();
            if (rafId !== null) cancelAnimationFrame(rafId);
        };
    }, [panelRef, active]);
};
