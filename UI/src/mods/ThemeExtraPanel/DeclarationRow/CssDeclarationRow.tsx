import { useEffect, useRef, useState } from "react";
import { trigger } from "cs2/api";
import { useLocalization } from "cs2/l10n";
import { Color } from "cs2/bindings";
import { ColorField } from "../../../../game-ui/common/input/color-picker/color-field/color-field";
import {
    CssColorDeclaration,
    CssDeclarationKind,
    CssKeywordDeclaration,
    CssNumberDeclaration,
    CssUnitDeclaration,
    CssVarReferenceDeclaration,
} from "./CssDeclarationTypes";
import styles from "./CssDeclarationRow.module.scss";

// Other kinds are still read-only - writing back a unit/number/keyword isn't designed yet.

// "list" (default, unset) - Simple mode's rows inside a curated FoldoutItem group (unchanged).
// "card" - Advanced mode's flat, ungrouped Masonry cells (see ThemeExtraPanel.tsx) - each one is
// its own bordered card with a kind tag, since it no longer sits under a labeled group header.
type Variant = { variant?: "list" | "card" };

const kindTagClass: Record<CssDeclarationKind, string> = {
    [CssDeclarationKind.Color]: styles.kindColor,
    [CssDeclarationKind.Unit]: styles.kindUnit,
    [CssDeclarationKind.Number]: styles.kindNumber,
    [CssDeclarationKind.VarReference]: styles.kindRef,
    [CssDeclarationKind.Keyword]: styles.kindKeyword,
};

const KindTag = ({ kind }: { kind: CssDeclarationKind }) => {
    const { translate } = useLocalization();
    return (
        <span className={`${styles.kindTag} ${kindTagClass[kind]}`}>
            {translate(`ExtraTheme.Panel.Kind[${CssDeclarationKind[kind]}]`, CssDeclarationKind[kind])}
        </span>
    );
};

const rgba = (r: number, g: number, b: number, a: number) =>
    `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;

const sameColor = (a: Color, b: Color) => a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;

export const ColorDeclarationRow = (declaration: CssColorDeclaration & Variant) => {
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

    const valueText = sameColor(color, declaration) ? declaration.rawValue : rgba(color.r, color.g, color.b, color.a);
    const swatch = <ColorField className={styles.swatch} value={color} onChange={onChange} onClosePicker={onClosePicker} alpha colorWheel hexInput />;

    if (declaration.variant === "card") {
        return (
            <div className={styles.varCard}>
                <div className={styles.cardHead}>
                    <span className={styles.cardName} title={declaration.name}>{declaration.name}</span>
                    <KindTag kind={declaration.kind} />
                </div>
                <div className={styles.cardBody}>
                    {swatch}
                    <span className={styles.cardValue} title={valueText}>{valueText}</span>
                </div>
            </div>
        );
    }
    return (
        <div className={styles.varRow}>
            <span className={styles.varLabel} title={declaration.name}>{declaration.name}</span>
            <div className={styles.colorControl}>
                <span className={styles.varValue}>{valueText}</span>
                {swatch}
            </div>
        </div>
    );
};

export const UnitDeclarationRow = (declaration: CssUnitDeclaration & Variant) => {
    const value = `${declaration.number} ${declaration.unit}`;
    if (declaration.variant === "card") {
        return (
            <div className={styles.varCard}>
                <div className={styles.cardHead}>
                    <span className={styles.cardName} title={declaration.name}>{declaration.name}</span>
                    <KindTag kind={declaration.kind} />
                </div>
                <div className={styles.cardBody}>
                    <span className={styles.valUnit}>{value}</span>
                </div>
            </div>
        );
    }
    return (
        <div className={styles.varRow}>
            <span className={styles.varLabel} title={declaration.name}>{declaration.name}</span>
            <span className={styles.valUnit}>{value}</span>
        </div>
    );
};

export const NumberDeclarationRow = (declaration: CssNumberDeclaration & Variant) => {
    if (declaration.variant === "card") {
        return (
            <div className={styles.varCard}>
                <div className={styles.cardHead}>
                    <span className={styles.cardName} title={declaration.name}>{declaration.name}</span>
                    <KindTag kind={declaration.kind} />
                </div>
                <div className={styles.cardBody}>
                    <span className={styles.cardValue}>{declaration.number}</span>
                </div>
            </div>
        );
    }
    return (
        <div className={styles.varRow}>
            <span className={styles.varLabel} title={declaration.name}>{declaration.name}</span>
            <span className={styles.varValue}>{declaration.number}</span>
        </div>
    );
};

export const VarReferenceDeclarationRow = (declaration: CssVarReferenceDeclaration & Variant) => {
    if (declaration.variant === "card") {
        return (
            <div className={styles.varCard}>
                <div className={styles.cardHead}>
                    <span className={styles.cardName} title={declaration.name}>{declaration.name}</span>
                    <KindTag kind={declaration.kind} />
                </div>
                <div className={styles.cardBody}>
                    <span className={styles.cardValue} title={declaration.referencedVariable}>-&gt; {declaration.referencedVariable}</span>
                </div>
            </div>
        );
    }
    return (
        <div className={styles.varRow}>
            <span className={styles.varLabel} title={declaration.name}>{declaration.name}</span>
            <span className={styles.valRef} title={declaration.referencedVariable}>-&gt; {declaration.referencedVariable}</span>
        </div>
    );
};

export const KeywordDeclarationRow = (declaration: CssKeywordDeclaration & Variant) => {
    if (declaration.variant === "card") {
        return (
            <div className={styles.varCard}>
                <div className={styles.cardHead}>
                    <span className={styles.cardName} title={declaration.name}>{declaration.name}</span>
                    <KindTag kind={declaration.kind} />
                </div>
                <div className={styles.cardBody}>
                    <span className={styles.valKeyword} title={declaration.rawValue}>{declaration.rawValue}</span>
                </div>
            </div>
        );
    }
    return (
        <div className={styles.varRow}>
            <span className={styles.varLabel} title={declaration.name}>{declaration.name}</span>
            <span className={styles.valKeyword} title={declaration.rawValue}>{declaration.rawValue}</span>
        </div>
    );
};

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
