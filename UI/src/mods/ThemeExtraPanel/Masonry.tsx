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
        const observer = new ResizeObserver(([entry]) => {
            if (!entry) return;
            const width = entry.contentRect.width;
            if (width > 0) setContainerWidth(width);
        });
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    useLayoutEffect(() => {
        // ONE shared ResizeObserver for every item, not one-per-item: Advanced mode alone produces
        // 258 groups (one per CSS selector), so N separate observers each firing their own callback
        // was a real source of lag on mode switch. A single observer batches every changed element
        // into one `entries` array per callback, so all height changes land in a single setHeights
        // call instead of up to 258 of them back to back.
        const elementToKey = new Map<Element, string>();
        const observer = new ResizeObserver((entries) => {
            setHeights((prev) => {
                let changed = false;
                const next = new Map(prev);
                for (const entry of entries) {
                    const key = elementToKey.get(entry.target);
                    if (!key) continue;
                    const height = entry.contentRect.height;
                    if (next.get(key) !== height) {
                        next.set(key, height);
                        changed = true;
                    }
                }
                return changed ? next : prev;
            });
        });
        for (const item of items) {
            const el = itemRefs.current.get(item.key);
            if (!el) continue;
            elementToKey.set(el, item.key);
            observer.observe(el);
        }
        return () => observer.disconnect();
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
