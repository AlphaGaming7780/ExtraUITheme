import { Typed } from "cs2/bindings";

// Mirrors ExtraUITheme.Helpers.CssDeclarationKind (src/Helpers/CssVariableExtractor.cs).
export enum CssDeclarationKind {
    Color,
    Unit,
    Number,
    VarReference,
    Keyword,
}

// Mirrors ExtraUITheme.Helpers' CssDeclaration hierarchy (src/Helpers/CssVariableExtractor.cs). Each
// C# subclass writes its own __Type via GetType().FullName (e.g.
// "ExtraUITheme.Helpers.CssColorDeclaration"), so a components map keyed by those exact strings can
// be used with TypedRenderer to pick the right control per concrete shape - the same mechanism
// ExtraPanelsRoot already uses for panel content. selector/name/rawValue live directly here (not in
// a separate row wrapper) since a CssDeclaration is never used standalone without them.
// Typed<""> (not Typed<string>) to match TypedRenderer/TypedListRenderer's own signature - the
// real runtime value is one of several full C# type-name strings, not literally "".
export interface CssDeclaration extends Typed<""> {
    selector: string;
    name: string;
    rawValue: string;
    kind: CssDeclarationKind;
}

export interface CssColorDeclaration extends CssDeclaration {
    r: number;
    g: number;
    b: number;
    a: number;
    // Set (non-empty) for e.g. "rgba(42,55,83,var(--panelOpacityNormal))" - alpha tracks another
    // variable instead of a literal number. `a` above is then just a display stand-in (1.0) - see
    // CssColorDeclaration.AlphaVarRef in CssDeclaration.cs.
    alphaVarRef: string;
}

export interface CssUnitDeclaration extends CssDeclaration {
    number: number;
    unit: string;
}

export interface CssNumberDeclaration extends CssDeclaration {
    number: number;
}

export interface CssVarReferenceDeclaration extends CssDeclaration {
    referencedVariable: string;
}

export interface CssKeywordDeclaration extends CssDeclaration {
}
