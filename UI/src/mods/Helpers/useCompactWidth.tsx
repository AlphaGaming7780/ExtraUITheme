import { RefObject, useEffect, useState } from "react";
import { remToPx } from "./RemHelper";

// True once `ref`'s element measures narrower than `thresholdRem` - used to switch the toolbar to icon-only.
export const useCompactWidth = (ref: RefObject<HTMLElement>, thresholdRem: number): boolean => {
    const [compact, setCompact] = useState(false);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const observer = new ResizeObserver(([entry]) => {
            if (!entry) return;
            setCompact(entry.contentRect.width < remToPx(thresholdRem));
        });
        observer.observe(el);
        return () => observer.disconnect();
    }, [ref, thresholdRem]);

    return compact;
};
