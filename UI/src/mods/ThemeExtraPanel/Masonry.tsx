import { memo, ReactNode, useLayoutEffect, useMemo, useRef, useState } from "react";
import { remToPx } from "../Helpers/RemHelper";

// JS masonry fallback since cohtml doesn't implement CSS multi-column: measure each item, place it in the currently-shortest column.

interface MasonryItem {
    key: string;
    node: ReactNode;
}

// Reserved space for an unmeasured (off-screen, virtualized) item, so columns/scrollbar stay roughly right-sized.
const ESTIMATED_ITEM_HEIGHT_REM = 88;

const findScrollParent = (el: HTMLElement | null): HTMLElement | null => {
    let node = el?.parentElement ?? null;
    while (node) {
        const overflowY = getComputedStyle(node).overflowY;
        if (overflowY === "auto" || overflowY === "scroll") return node;
        node = node.parentElement;
    }
    return null;
};

// Own memo boundary per item, so a scroll tick only re-renders items whose own props actually changed.
const MasonryItemView = memo(({
    itemRef, x, y, width, height, isVisible, node,
}: {
    itemRef: (el: HTMLDivElement | null) => void;
    x: number; y: number; width: number; height: number; isVisible: boolean; node: ReactNode;
}) => (
    <div
        ref={itemRef}
        style={{
            position: "absolute",
            left: x,
            top: y,
            width,
            // Pinned while not rendering real content, so ResizeObserver doesn't collapse it to an empty div's height.
            height: isVisible ? undefined : height,
        }}
    >
        {isVisible ? node : null}
    </div>
));

export const Masonry = ({
    items, minColumnWidth, gap, virtualize = false,
}: { items: MasonryItem[]; minColumnWidth: number; gap: number; virtualize?: boolean }) => {
    const minColumnWidthPx = remToPx(minColumnWidth);
    const gapPx = remToPx(gap);
    const estimatedHeightPx = remToPx(ESTIMATED_ITEM_HEIGHT_REM);
    const containerRef = useRef<HTMLDivElement>(null);
    const itemRefs = useRef(new Map<string, HTMLDivElement>());
    // Stable per-key ref callbacks, so MasonryItemView's memo isn't defeated by a fresh closure every render.
    const refCallbacks = useRef(new Map<string, (el: HTMLDivElement | null) => void>());
    const getRefCallback = (key: string) => {
        let cb = refCallbacks.current.get(key);
        if (!cb) {
            cb = (el) => { if (el) itemRefs.current.set(key, el); else itemRefs.current.delete(key); };
            refCallbacks.current.set(key, cb);
        }
        return cb;
    };
    const [containerWidth, setContainerWidth] = useState(0);
    const [heights, setHeights] = useState<Map<string, number>>(new Map());
    // Visible local-y range, expanded by a buffer so items mount just before they'd pop in on a fast scroll.
    const [visibleRange, setVisibleRange] = useState<{ top: number; bottom: number } | null>(null);

    useLayoutEffect(() => {
        if (!containerRef.current) return;
        const el = containerRef.current;
        // rAF-coalesced - only the latest width within a frame matters, flush at most once per frame.
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
        // ONE shared ResizeObserver for every item (not one-per-item), rAF-coalesced into a single setHeights call per frame.
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
        // Re-attach whenever the set of item keys changes - the refs map may point at stale/removed nodes otherwise.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [items.map((i) => i.key).join("|")]);

    // Hand-rolled scroll-driven virtualization via getBoundingClientRect(), since IntersectionObserver is non-functional in cohtml.
    useLayoutEffect(() => {
        if (!virtualize) return;
        const container = containerRef.current;
        if (!container) return;
        const scrollParent = findScrollParent(container);
        if (!scrollParent) return;

        let rafId: number | null = null;
        const recompute = () => {
            rafId = null;
            const containerRect = container.getBoundingClientRect();
            const scrollRect = scrollParent.getBoundingClientRect();
            const top = scrollRect.top - containerRect.top;
            // Buffer scaled to the viewport itself, since the panel can be resized to any size.
            const overscan = scrollRect.height * 0.5;
            setVisibleRange({ top: top - overscan, bottom: top + scrollRect.height + overscan });
        };
        const schedule = () => {
            if (rafId !== null) return;
            rafId = requestAnimationFrame(recompute);
        };
        recompute();

        scrollParent.addEventListener("scroll", schedule, { passive: true });
        const observer = new ResizeObserver(schedule);
        observer.observe(scrollParent);

        return () => {
            scrollParent.removeEventListener("scroll", schedule);
            observer.disconnect();
            if (rafId !== null) cancelAnimationFrame(rafId);
        };
    }, [virtualize]);

    const columnCount = Math.max(1, Math.floor((containerWidth + gapPx) / (minColumnWidthPx + gapPx)));
    const columnWidth = columnCount > 0 ? (containerWidth - gapPx * (columnCount - 1)) / columnCount : containerWidth;

    // Memoized separately from `visibleRange` - packing never depends on which items are currently visible.
    const { positions, totalHeight } = useMemo(() => {
        const columnHeights = new Array(columnCount).fill(0);
        const positions = new Map<string, { x: number; y: number }>();
        for (const item of items) {
            let shortest = 0;
            for (let c = 1; c < columnCount; c++) {
                if (columnHeights[c] < columnHeights[shortest]) shortest = c;
            }
            positions.set(item.key, { x: shortest * (columnWidth + gapPx), y: columnHeights[shortest] });
            // Unmeasured items reserve the estimate (only when virtualize is on) instead of 0, so columns stay right-sized.
            const height = heights.get(item.key) ?? (virtualize ? estimatedHeightPx : 0);
            columnHeights[shortest] += height + gapPx;
        }
        const totalHeight = Math.max(0, ...columnHeights.map((h) => (h > 0 ? h - gapPx : 0)));
        return { positions, totalHeight };
    }, [items, heights, columnCount, columnWidth, gapPx, virtualize, estimatedHeightPx]);

    return (
        <div ref={containerRef} style={{ position: "relative", width: "100%", height: totalHeight }}>
            {items.map((item) => {
                const pos = positions.get(item.key) ?? { x: 0, y: 0 };
                const height = heights.get(item.key) ?? estimatedHeightPx;
                const isVisible = !virtualize || !visibleRange
                    || (pos.y + height >= visibleRange.top && pos.y <= visibleRange.bottom);
                return (
                    <MasonryItemView
                        key={item.key}
                        itemRef={getRefCallback(item.key)}
                        x={pos.x}
                        y={pos.y}
                        width={columnWidth}
                        height={height}
                        isVisible={isVisible}
                        node={item.node}
                    />
                );
            })}
        </div>
    );
};
