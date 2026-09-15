import { RefObject, useEffect } from "react";
import { remToPx } from "./RemHelper";

// Tracks `panelRef`'s real size and publishes it as --etDialogMaxWidth/--etDialogMaxHeight on
// document.documentElement - so ANY dialog, wherever the game's own Dialog module actually mounts
// it in the DOM (its own full-screen PanelBackdrop, not necessarily inside our panel's own subtree
// - see ExtraThemeDialog.tsx), can still cap itself to "never bigger than the ExtraTheme panel" via
// a plain var() read. Same "write to documentElement, read anywhere" trick RegisterThemePanel.tsx
// already uses for live theme colors.
//
// Deliberately NOT the two-argument var(--name, fallback) form (unsupported in this engine, see
// ThemeExtraPanel.module.scss's own note on that) - set synchronously on mount (before the first
// ResizeObserver callback, which arrives asynchronously) so a dialog opened immediately still reads
// real values instead of an unset var().
//
// Subtracts a fixed allowance for the Dialog's own title bar + footer/buttons row + its outer
// margin from the panel's real height (title/footer aren't part of `children`, so a dialog whose
// BODY exactly matched the panel's full height would still overflow it once that chrome is added on
// top) - an estimate, not measured from the game's own Dialog chrome; retune kHeightAllowance if a
// dialog still pokes out toward the top/bottom in practice. Width doesn't need an equivalent
// allowance - see ExtraThemeDialog.module.scss's :global(.dialog_E8_) rule, which forces the whole
// outer chrome (not just the body) to exactly --etDialogMaxWidth.
const kHeightAllowance = 160; // rem-equivalent units, same "1 unit ~= 1px at 1920x1080" scale as the rest of this panel's CSS (see RemHelper.tsx) - written with an explicit `px` below, so no rem<->px conversion is needed (see that comment).
const kWidthMargin = 40;

export const usePanelDialogBounds = (panelRef: RefObject<HTMLElement>): void => {
    useEffect(() => {
        const el = panelRef.current;
        if (!el) return;

        // ResizeObserver reports real device pixels (not our rem-equivalent design unit) - but so
        // does a plain `px` CSS value, so writing the raw measurement straight through with a `px`
        // suffix needs no rem<->px conversion (unlike most of this panel's own CSS, which is
        // authored in rem and only converts when comparing against a JS measurement - see
        // RemHelper.tsx / useCompactWidth.tsx for that case).
        const apply = (width: number, height: number) => {
            const root = document.documentElement.style;
            // Capped at 650rem-equivalent (converted to real px via remToPx - this ONE value has to
            // be compared against the JS measurement, so it does need the conversion) either way -
            // the game's own `wide` Dialog never exceeds that itself, so a non-wide dialog on a huge
            // panel shouldn't either, rather than stretching edge-to-edge just because there's room.
            const width_ = Math.min(Math.max(0, width - kWidthMargin), remToPx(650));
            root.setProperty("--etDialogMaxWidth", `${width_}px`);
            root.setProperty("--etDialogMaxHeight", `${Math.max(0, height - kHeightAllowance)}px`);
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
