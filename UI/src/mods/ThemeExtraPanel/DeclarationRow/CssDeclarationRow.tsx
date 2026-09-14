import { useEffect, useRef, useState } from "react";
import { trigger } from "cs2/api";
import { Color } from "cs2/bindings";
import { ColorField } from "../../../../game-ui/common/input/color-picker/color-field/color-field";
import {
    CssColorDeclaration,
    CssKeywordDeclaration,
    CssNumberDeclaration,
    CssUnitDeclaration,
    CssVarReferenceDeclaration,
} from "./CssDeclarationTypes";
import styles from "./CssDeclarationRow.module.scss";

// Other kinds are still read-only - writing back a unit/number/keyword isn't designed yet.

const rgba = (r: number, g: number, b: number, a: number) =>
    `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;

const sameColor = (a: Color, b: Color) => a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;

export const ColorDeclarationRow = (declaration: CssColorDeclaration) => {
    // ColorField's onChange fires continuously while dragging the wheel/gradient (every frame) -
    // tracked locally for live preview, only sent to C# (SetOverride) on close. Sending on every
    // onChange was spamming GetAllThemes (re-pulled on every binding Update()) and, with autosave
    // on, rewriting the theme file to disk on every drag frame.
    const [color, setColor] = useState<Color>({ r: declaration.r, g: declaration.g, b: declaration.b, a: declaration.a });
    const dirtyRef = useRef(false);

    useEffect(() => {
        if (!dirtyRef.current) setColor({ r: declaration.r, g: declaration.g, b: declaration.b, a: declaration.a });
    }, [declaration.r, declaration.g, declaration.b, declaration.a]);

    const onChange = (value: Color) => {
        dirtyRef.current = true;
        setColor(value);
        // Live preview - applied directly as an inline style on <html>, which overrides any
        // selector's own rule (same mechanism RegisterThemePanel.tsx uses for a committed theme).
        // Only C# doesn't hear about it until onClosePicker - see the comment above.
        document.documentElement.style.setProperty(declaration.name, rgba(value.r, value.g, value.b, value.a));
    };

    const onClosePicker = () => {
        if (!dirtyRef.current) return;
        dirtyRef.current = false;
        trigger("ET", "SetOverride", declaration.name, rgba(color.r, color.g, color.b, color.a));
    };

    return (
        <div className={styles.varRow}>
            <span className={styles.varLabel} title={declaration.name}>{declaration.name}</span>
            <div className={styles.colorControl}>
                <span className={styles.varValue}>{sameColor(color, declaration) ? declaration.rawValue : rgba(color.r, color.g, color.b, color.a)}</span>
                <ColorField
                    className={styles.swatch}
                    value={color}
                    onChange={onChange}
                    onClosePicker={onClosePicker}
                    alpha
                    colorWheel
                    hexInput
                />
            </div>
        </div>
    );
};

export const UnitDeclarationRow = (declaration: CssUnitDeclaration) => (
    <div className={styles.varRow}>
        <span className={styles.varLabel} title={declaration.name}>{declaration.name}</span>
        <span className={styles.valUnit}>{declaration.number} {declaration.unit}</span>
    </div>
);

export const NumberDeclarationRow = (declaration: CssNumberDeclaration) => (
    <div className={styles.varRow}>
        <span className={styles.varLabel} title={declaration.name}>{declaration.name}</span>
        <span className={styles.varValue}>{declaration.number}</span>
    </div>
);

export const VarReferenceDeclarationRow = (declaration: CssVarReferenceDeclaration) => (
    <div className={styles.varRow}>
        <span className={styles.varLabel} title={declaration.name}>{declaration.name}</span>
        <span className={styles.valRef} title={declaration.referencedVariable}>-&gt; {declaration.referencedVariable}</span>
    </div>
);

export const KeywordDeclarationRow = (declaration: CssKeywordDeclaration) => (
    <div className={styles.varRow}>
        <span className={styles.varLabel} title={declaration.name}>{declaration.name}</span>
        <span className={styles.valKeyword} title={declaration.rawValue}>{declaration.rawValue}</span>
    </div>
);

// Keyed by __Type (GetType().FullName from the C# CssDeclaration subclasses) - the same
// components-map + TypedRenderer/TypedListRenderer convention ExtraPanelsRoot already uses to pick
// a component per concrete data shape.
export const cssDeclarationRowComponents: { [type: string]: (props: any) => any } = {
    "ExtraTheme.Helpers.CssColorDeclaration": ColorDeclarationRow,
    "ExtraTheme.Helpers.CssUnitDeclaration": UnitDeclarationRow,
    "ExtraTheme.Helpers.CssNumberDeclaration": NumberDeclarationRow,
    "ExtraTheme.Helpers.CssVarReferenceDeclaration": VarReferenceDeclarationRow,
    "ExtraTheme.Helpers.CssKeywordDeclaration": KeywordDeclarationRow,
};
