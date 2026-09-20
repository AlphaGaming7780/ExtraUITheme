import { RefObject, useEffect } from "react";
import { remToPx } from "./RemHelper";

// Tracks `panelRef`'s real size and publishes it as --eutDialogMaxWidth/--eutDialogMaxHeight on documentElement, so any dialog (wherever the game mounts it) can cap itself to the panel's size.
const kHeightAllowance = 160;
const kWidthMargin = 40;

export const usePanelDialogBounds = (panelRef: RefObject<HTMLElement>): void => {
    useEffect(() => {
        const el = panelRef.current;
        if (!el) return;

        const apply = (width: number, height: number) => {
            const root = document.documentElement.style;
            // Capped at 650rem-equivalent, since the game's own `wide` Dialog never exceeds that either.
            const width_ = Math.min(Math.max(0, width - kWidthMargin), remToPx(650));
            root.setProperty("--eutDialogMaxWidth", `${width_}px`);
            root.setProperty("--eutDialogMaxHeight", `${Math.max(0, height - kHeightAllowance)}px`);
        };

        const rect = el.getBoundingClientRect();
        apply(rect.width, rect.height);

        const observer = new ResizeObserver(([entry]) => {
            if (!entry) return;
            apply(entry.contentRect.width, entry.contentRect.height);
        });
        observer.observe(el);
        return () => observer.disconnect();
    }, [panelRef]);
};
