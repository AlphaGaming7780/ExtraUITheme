import { Typed } from "cs2/bindings";

// Mirrors ExtraUITheme.Helpers.CssDeclarationKind (src/Helpers/CssVariableExtractor.cs).
export enum CssDeclarationKind {
    Color,
    Unit,
    Number,
    VarReference,
    Keyword,
}

// Mirrors ExtraUITheme.Helpers' CssDeclaration hierarchy - each C# subclass's __Type picks the row component via TypedRenderer.
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
    // Set when alpha tracks another variable instead of a literal number - `a` above is then just a display stand-in (1.0).
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
