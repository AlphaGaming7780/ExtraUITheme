import { memo, useEffect, useRef, useState } from "react";
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
            {translate(`ExtraUITheme.Panel.Kind[${CssDeclarationKind[kind]}]`, CssDeclarationKind[kind])}
        </span>
    );
};

const rgba = (r: number, g: number, b: number, a: number) =>
    `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;

// "rgba(r, g, b, var(--x))" - for a declaration whose alpha tracks another variable
// (declaration.alphaVarRef) instead of a literal number, see CssColorDeclaration.alphaVarRef.
const rgbaWithAlphaRef = (r: number, g: number, b: number, alphaVarRef: string) =>
    `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, var(${alphaVarRef}))`;

const sameColor = (a: Color, b: Color) => a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;

// memo() on every row component below - TypedListRenderer spreads a fresh {...data, ...props}
// object into each one on every parent render (ThemeExtraPanel.tsx, Masonry.tsx), but the individual
// scalar values inside it (declaration.r/g/b/name/kind/...) stay the same by Object.is as long as the
// underlying declaration itself hasn't changed - memo's default shallow-per-key comparison catches
// that even though the wrapping object is a new reference each time, and skips re-rendering ~300 of
// these that don't actually need it on every resize/panel-update re-render (confirmed laggy in-game
// without this).
export const ColorDeclarationRow = memo((declaration: CssColorDeclaration & Variant) => {
    // ColorField's onChange fires continuously while dragging the wheel/gradient (every frame) -
    // tracked locally for live preview, only sent to C# (SetOverride) on close. Sending on every
    // onChange was spamming GetAllThemes (re-pulled on every binding Update()) and, with autosave
    // on, rewriting the theme file to disk on every drag frame.
    const [color, setColor] = useState<Color>({ r: declaration.r, g: declaration.g, b: declaration.b, a: declaration.a });
    const dirtyRef = useRef(false);

    useEffect(() => {
        if (!dirtyRef.current) setColor({ r: declaration.r, g: declaration.g, b: declaration.b, a: declaration.a });
    }, [declaration.r, declaration.g, declaration.b, declaration.a]);

    // R/G/B always edit normally - alpha only does when it isn't tied to another variable (no
    // alpha slider is shown at all otherwise, see the ColorField props below), so the value written
    // here always keeps the var() reference intact instead of collapsing it to a literal.
    const buildValue = (c: Color) =>
        declaration.alphaVarRef ? rgbaWithAlphaRef(c.r, c.g, c.b, declaration.alphaVarRef) : rgba(c.r, c.g, c.b, c.a);

    const onChange = (value: Color) => {
        dirtyRef.current = true;
        setColor(value);
        // Live preview - applied directly as an inline style on <html>, which overrides any
        // selector's own rule (same mechanism RegisterThemePanel.tsx uses for a committed theme).
        // Only C# doesn't hear about it until onClosePicker - see the comment above.
        document.documentElement.style.setProperty(declaration.name, buildValue(value));
    };

    const onClosePicker = () => {
        if (!dirtyRef.current) return;
        dirtyRef.current = false;
        trigger("EUT", "SetOverride", declaration.name, buildValue(color));
    };

    const valueText = sameColor(color, declaration) ? declaration.rawValue : buildValue(color);
    const swatch = (
        <ColorField
            className={styles.swatch}
            value={color}
            onChange={onChange}
            onClosePicker={onClosePicker}
            alpha={!declaration.alphaVarRef}
            colorWheel
            hexInput
        />
    );

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
});

export const UnitDeclarationRow = memo((declaration: CssUnitDeclaration & Variant) => {
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
});

export const NumberDeclarationRow = memo((declaration: CssNumberDeclaration & Variant) => {
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
});

export const VarReferenceDeclarationRow = memo((declaration: CssVarReferenceDeclaration & Variant) => {
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
});

export const KeywordDeclarationRow = memo((declaration: CssKeywordDeclaration & Variant) => {
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
});

// Keyed by __Type (GetType().FullName from the C# CssDeclaration subclasses) - the same
// components-map + TypedRenderer/TypedListRenderer convention ExtraPanelsRoot already uses to pick
// a component per concrete data shape.
export const cssDeclarationRowComponents: { [type: string]: (props: any) => any } = {
    "ExtraUITheme.Helpers.CssColorDeclaration": ColorDeclarationRow,
    "ExtraUITheme.Helpers.CssUnitDeclaration": UnitDeclarationRow,
    "ExtraUITheme.Helpers.CssNumberDeclaration": NumberDeclarationRow,
    "ExtraUITheme.Helpers.CssVarReferenceDeclaration": VarReferenceDeclarationRow,
    "ExtraUITheme.Helpers.CssKeywordDeclaration": KeywordDeclarationRow,
};
