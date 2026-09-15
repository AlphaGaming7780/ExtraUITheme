import { ReactNode, useLayoutEffect, useRef, useState } from "react";
import { remToPx } from "../Helpers/RemHelper";

// cohtml 2.2.1.3 doesn't implement CSS multi-column (`column-width`/`column-count`) at all (silent
// no-op) - this is a JS masonry fallback instead: measure each item's rendered height, place it in
// the currently-shortest column, and recompute whenever the container is resized or an item's own
// height changes (e.g. a group's foldout opens/closes). Items render twice - once
// invisible/absolute at column width only (to get a real height via ResizeObserver), then
// repositioned via absolute left/top once heights are known.
//
// `minColumnWidth`/`gap` are in the same rem-equivalent design units as the rest of this panel's
// SCSS (see RemHelper.tsx), not real pixels - converted via remToPx() before the layout math, which
// otherwise works entirely in real pixels (ResizeObserver's contentRect already reports those).

interface MasonryItem {
    key: string;
    node: ReactNode;
}

export const Masonry = ({ items, minColumnWidth, gap }: { items: MasonryItem[]; minColumnWidth: number; gap: number }) => {
    const minColumnWidthPx = remToPx(minColumnWidth);
    const gapPx = remToPx(gap);
    const containerRef = useRef<HTMLDivElement>(null);
    const itemRefs = useRef(new Map<string, HTMLDivElement>());
    const [containerWidth, setContainerWidth] = useState(0);
    const [heights, setHeights] = useState<Map<string, number>>(new Map());

    useLayoutEffect(() => {
        if (!containerRef.current) return;
        const el = containerRef.current;
        // rAF-coalesced - a panel resize/drag can fire this callback many times before the browser
        // paints a frame, and each call previously triggered its own setContainerWidth + a full
        // masonry position recompute (below) synchronously. Only the latest width within a frame
        // matters, so keep it in a plain variable and flush at most once per frame.
        let latestWidth: number | null = null;
        let rafId: number | null = null;
        const observer = new ResizeObserver(([entry]) => {
            if (!entry) return;
            const width = entry.contentRect.width;
            if (width <= 0) return;
            latestWidth = width;
            if (rafId !== null) return;
            rafId = requestAnimationFrame(() => {
                rafId = null;
                if (latestWidth !== null) setContainerWidth(latestWidth);
            });
        });
        observer.observe(el);
        return () => {
            observer.disconnect();
            if (rafId !== null) cancelAnimationFrame(rafId);
        };
    }, []);

    useLayoutEffect(() => {
        // ONE shared ResizeObserver for every item, not one-per-item: Advanced mode alone produces
        // 258 groups (one per CSS selector), so N separate observers each firing their own callback
        // was a real source of lag on mode switch. A single observer batches every changed element
        // into one `entries` array per callback, so all height changes land in a single setHeights
        // call instead of up to 258 of them back to back.
        //
        // Also rAF-coalesced on top of that batching, for the same reason as the container-width
        // observer above: pending entries accumulate into `pendingHeights` across however many raw
        // callback firings happen within a frame, and only the single resulting setHeights update is
        // committed once per frame instead of once per callback.
        const elementToKey = new Map<Element, string>();
        const pendingHeights = new Map<string, number>();
        let rafId: number | null = null;
        const flush = () => {
            rafId = null;
            if (pendingHeights.size === 0) return;
            const toApply = new Map(pendingHeights);
            pendingHeights.clear();
            setHeights((prev) => {
                let changed = false;
                const next = new Map(prev);
                for (const [key, height] of toApply) {
                    if (next.get(key) !== height) {
                        next.set(key, height);
                        changed = true;
                    }
                }
                return changed ? next : prev;
            });
        };
        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const key = elementToKey.get(entry.target);
                if (!key) continue;
                pendingHeights.set(key, entry.contentRect.height);
            }
            if (rafId === null) rafId = requestAnimationFrame(flush);
        });
        for (const item of items) {
            const el = itemRefs.current.get(item.key);
            if (!el) continue;
            elementToKey.set(el, item.key);
            observer.observe(el);
        }
        return () => {
            observer.disconnect();
            if (rafId !== null) cancelAnimationFrame(rafId);
        };
        // Re-attach whenever the set of item keys changes (search/filter/mode changes the list) -
        // the refs map may point at stale/removed nodes otherwise.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [items.map((i) => i.key).join("|")]);

    const columnCount = Math.max(1, Math.floor((containerWidth + gapPx) / (minColumnWidthPx + gapPx)));
    const columnWidth = columnCount > 0 ? (containerWidth - gapPx * (columnCount - 1)) / columnCount : containerWidth;

    const columnHeights = new Array(columnCount).fill(0);
    const positions = new Map<string, { x: number; y: number }>();
    for (const item of items) {
        let shortest = 0;
        for (let c = 1; c < columnCount; c++) {
            if (columnHeights[c] < columnHeights[shortest]) shortest = c;
        }
        positions.set(item.key, { x: shortest * (columnWidth + gapPx), y: columnHeights[shortest] });
        const height = heights.get(item.key) ?? 0;
        columnHeights[shortest] += height + gapPx;
    }
    const totalHeight = Math.max(0, ...columnHeights.map((h) => (h > 0 ? h - gapPx : 0)));

    return (
        <div ref={containerRef} style={{ position: "relative", width: "100%", height: totalHeight }}>
            {items.map((item) => {
                const pos = positions.get(item.key) ?? { x: 0, y: 0 };
                return (
                    <div
                        key={item.key}
                        ref={(el) => { if (el) itemRefs.current.set(item.key, el); else itemRefs.current.delete(item.key); }}
                        style={{
                            position: "absolute",
                            left: pos.x,
                            top: pos.y,
                            width: columnWidth,
                        }}
                    >
                        {item.node}
                    </div>
                );
            })}
        </div>
    );
};
