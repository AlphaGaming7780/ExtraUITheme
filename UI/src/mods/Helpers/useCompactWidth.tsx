import { RefObject, useEffect, useState } from "react";
import { remToPx } from "./RemHelper";

// True once `ref`'s element measures narrower than `thresholdRem` (converted to real px via
// remToPx - ResizeObserver reports device pixels, not rem, see RemHelper.tsx). Used by the toolbar
// to switch its action buttons to icon-only once there isn't room for icon+label side by side next
// to the theme dropdown.
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
