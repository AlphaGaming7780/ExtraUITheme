import { memo, ReactNode, useLayoutEffect, useMemo, useRef, useState } from "react";
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

// Only used when `virtualize` is on (Advanced mode's ~300+ cards) - an item that hasn't been
// measured yet (never actually rendered, because it's currently off-screen) reserves this much
// space for packing purposes instead of 0, so the columns/scrollbar stay roughly right-sized before
// it's ever scrolled into view. content-visibility:auto (native browser-level virtualization) was
// tried first as a zero-JS alternative to all of this - measured in-game with 300+ cards, no
// meaningful difference on move/resize fps with or without it, so treated as an unsupported no-op in
// cohtml (consistent with this engine's track record elsewhere: :not(), IntersectionObserver, CSS
// multi-column).
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

// One item's wrapper, its own memo boundary - without this, EVERY scroll tick re-rendered all
// ~300 items just because Masonry's own visibleRange state changed, even for items whose own
// isVisible/position/size didn't (still measurably laggy in-game even once every item had already
// been scrolled past and measured at least once - not a "first discovery" cost, a "React
// re-reconciles the whole list on every scroll frame" cost). React.memo's default shallow
// comparison catches exactly that: a re-render here is skipped unless x/y/width/height/isVisible
// (or `node`, which is already itself a stable reference - see advancedMasonryItems/
// simpleMasonryItems in ThemeExtraPanel.tsx) actually changed for THIS item, so only the handful of
// items actually crossing the visible boundary each frame do any real work.
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
            // Pinned explicitly while not rendering real content, so the item's own ResizeObserver
            // entry keeps reporting the same already-known height instead of collapsing to whatever
            // an empty div measures as - last real measurement if it's ever been visible before, the
            // estimate otherwise.
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
    // Stable per-key ref callbacks - MasonryItemView's own memo only helps if `itemRef` itself is
    // referentially stable across renders; a fresh closure per render (the previous inline
    // `ref={(el) => ...}`) would make every item's props look "changed" to memo every time, on top
    // of the identical purpose it already serves (routing each item's DOM node into itemRefs for the
    // height ResizeObserver below), defeating the whole point of memoizing the item view.
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
    // Local-coordinate (same space as `positions` below - relative to containerRef's own top, not
    // the page) range that's actually visible right now, expanded by a viewport-proportional buffer
    // above/below so items are already mounted just before they'd otherwise pop in on a fast scroll.
    // null until the first measurement lands - everything renders in the meantime (see `isVisible`
    // below), same graceful-default philosophy `heights` already uses.
    const [visibleRange, setVisibleRange] = useState<{ top: number; bottom: number } | null>(null);

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

    // Tracks which local-y range is actually visible, so items well outside it can skip mounting
    // their real content below (see `isVisible`) - replaces content-visibility:auto (see
    // ESTIMATED_ITEM_HEIGHT_REM's own comment on why) with hand-rolled scroll-driven virtualization,
    // since IntersectionObserver (LazyMount.tsx's earlier attempt at the same goal) is confirmed
    // non-functional in cohtml.
    //
    // Measured via getBoundingClientRect() on containerRef and the scroll ancestor (found once,
    // walking up for the nearest overflow:auto/scroll element) rather than reconciling scrollTop/
    // offsetTop by hand - both elements are always mounted regardless of virtualization, and
    // getBoundingClientRect() already accounts for every ancestor's scroll position, padding and
    // siblings above Masonry (the Advanced-only count line) with no coordinate-space bugs of our own
    // to get subtly wrong.
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
            // Buffer scaled to the viewport itself, not a fixed constant - the panel can be resized
            // much taller or shorter than whatever a hardcoded px/rem guess would assume.
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

    // Memoized separately from `visibleRange` - packing only actually depends on items/heights/
    // column layout, never on which of them happen to be currently visible, but before this it was a
    // plain computation inline in the render body, so it unconditionally re-ran in full (an O(items x
    // columnCount) loop) on every single scroll-driven re-render too, for no reason (the result was
    // always identical to the previous scroll tick's). That redundant recompute, not first-time
    // measurement, turned out to be the dominant remaining scroll cost - it kept happening even after
    // scrolling all the way through a list once (see the comment on MasonryItemView for the other
    // half of this fix).
    const { positions, totalHeight } = useMemo(() => {
        const columnHeights = new Array(columnCount).fill(0);
        const positions = new Map<string, { x: number; y: number }>();
        for (const item of items) {
            let shortest = 0;
            for (let c = 1; c < columnCount; c++) {
                if (columnHeights[c] < columnHeights[shortest]) shortest = c;
            }
            positions.set(item.key, { x: shortest * (columnWidth + gapPx), y: columnHeights[shortest] });
            // Unmeasured items (never mounted - currently off-screen under virtualize) reserve the
            // estimate instead of 0, so columns/scrollbar stay roughly right-sized instead of
            // collapsing wherever nothing's been scrolled into view yet. Not applied when virtualize
            // is off (Simple mode, the preserved Legacy view) - there every item mounts and gets
            // measured almost immediately anyway, so this would only add needless churn to
            // already-working behavior.
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
