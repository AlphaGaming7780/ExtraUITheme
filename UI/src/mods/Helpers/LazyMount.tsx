import { ReactNode, RefObject, useEffect, useRef, useState } from "react";

// Defers mounting `children` until this wrapper has been visible at least once, then keeps them
// mounted for good (no unmount-on-scroll-away) - same "mount once, never re-hide" idea as
// ThemeExtraPanel.tsx's everExpandedGroups, just per-item instead of per-group. Advanced mode's flat
// card grid uses this to avoid mounting every ColorField (a heavy native color-picker component) at
// once - ~180 of the ~300 :root variables are Color kind, all mounted simultaneously the moment the
// old per-selector Foldout gating went away. Simple mode doesn't need this: its groups already gate
// mounting via everExpandedGroups.
//
// IntersectionObserver isn't used anywhere in the game's own UI bundle (checked - zero references),
// so whether cohtml 2.2.1.3 actually implements it is unconfirmed, like several other browser APIs
// that turned out missing on this project (CSSRuleList indexing, clipboard read, Element.click()...).
// Feature-detected: falls back to mounting immediately (today's behavior) if unavailable, rather
// than risking `new IntersectionObserver(...)` throwing and taking the whole tab down with it.
//
// The placeholder's height only has to be roughly right - Masonry already re-measures every item's
// real height via its own shared ResizeObserver and reflows on change (the same mechanism that
// already handles a FoldoutItem expanding/collapsing in Simple mode), so swapping the placeholder
// for real content just triggers one more of those reflows.
export const LazyMount = ({
    placeholderHeight,
    root,
    children,
}: {
    placeholderHeight: number;
    root?: RefObject<Element>;
    children: ReactNode;
}) => {
    const ref = useRef<HTMLDivElement>(null);
    const [mounted, setMounted] = useState(typeof IntersectionObserver === "undefined");

    useEffect(() => {
        if (mounted || !ref.current) return;
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries.some((e) => e.isIntersecting)) {
                    setMounted(true);
                    observer.disconnect();
                }
            },
            { root: root?.current ?? null, rootMargin: "200px 0px" }
        );
        observer.observe(ref.current);
        return () => observer.disconnect();
    }, [mounted, root]);

    if (mounted) return <>{children}</>;
    return <div ref={ref} style={{ height: placeholderHeight }} />;
};
