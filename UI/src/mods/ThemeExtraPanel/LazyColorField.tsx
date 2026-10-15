import { useEffect, useRef, useState } from "react";
import { Color } from "cs2/bindings";
import { ColorField } from "../../../game-ui/common/input/color-picker/color-field/color-field";
import { setIdentifyBlocked } from "../Helpers/identify";
import styles from "./LazyColorField.module.scss";

const cssColor = (c: Color) =>
    `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, ${c.a})`;

// The game's ColorField alpha background (color-field_due.alpha_R9X).
export const ALPHA_PATTERN = { backgroundImage: "url(Media/Misc/AlphaPattern.svg)", backgroundSize: "8rem 8rem" };

interface LazyColorFieldProps {
    value: Color;
    onChange: (value: Color) => void;
    onClosePicker: () => void;
    className?: string;
    alpha?: boolean;
}

// Mounts the game's ColorField only while hovered or open, a plain swatch otherwise.
export const LazyColorField = ({ value, onChange, onClosePicker, className, alpha }: LazyColorFieldProps) => {
    const [live, setLive] = useState(false);
    const hoveredRef = useRef(false);
    const openRef = useRef(false);
    // Unblocks Identify if unmounted with the picker open.
    useEffect(() => () => { if (openRef.current) setIdentifyBlocked(false); }, []);
    return (
        <div
            className={className ? `${styles.box} ${className}` : styles.box}
            // Keeps the click from reaching the parent (e.g. a card's toggle).
            onClick={(e) => e.stopPropagation()}
            onMouseEnter={() => { hoveredRef.current = true; setLive(true); }}
            onMouseLeave={() => { hoveredRef.current = false; if (!openRef.current) setLive(false); }}
        >
            {live ? (
                <ColorField
                    value={value}
                    onChange={onChange}
                    onOpenPicker={() => { openRef.current = true; setIdentifyBlocked(true); }}
                    onClosePicker={() => {
                        openRef.current = false;
                        setIdentifyBlocked(false);
                        onClosePicker();
                        if (!hoveredRef.current) setLive(false);
                    }}
                    alpha={alpha}
                    colorWheel
                    hexInput
                />
            ) : (
                // Same markup as the game's; checker inline so css-loader doesn't resolve its url().
                <div className={styles.fake} style={value.a < 1 ? ALPHA_PATTERN : undefined}>
                    <div className={styles.fakeColor} style={{ backgroundColor: cssColor(value) }} />
                </div>
            )}
        </div>
    );
};
