import {
    CssColorDeclaration,
    CssKeywordDeclaration,
    CssNumberDeclaration,
    CssUnitDeclaration,
    CssVarReferenceDeclaration,
} from "./CssDeclarationTypes";
import styles from "./ThemeExtraPanel.module.scss";

// Read-only rows for now - writing a value back (document.documentElement.style.setProperty(...)
// or a C#-side binding, still undecided per docs/ThemePanel-Design.md) isn't designed yet. Once it
// is, the Color row is the natural place to swap the plain swatch for the game's own ColorField
// (see UI/game-ui/common/input/color-picker/color-field/color-field.tsx) wired to onChange.

const rgba = (r: number, g: number, b: number, a: number) =>
    `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;

export const ColorDeclarationRow = (declaration: CssColorDeclaration) => (
    <div className={styles.varRow}>
        <span className={styles.swatch} style={{ background: rgba(declaration.r, declaration.g, declaration.b, declaration.a) }} />
        <span className={styles.varLabel} title={declaration.name}>{declaration.name}</span>
        <span className={styles.varValue}>{declaration.rawValue}</span>
    </div>
);

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
