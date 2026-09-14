import { Typed } from "cs2/bindings";

// Mirrors ExtraTheme.Helpers.CssDeclarationKind. Not actually written to the wire (Write() only
// emits __Type via GetType().FullName, no separate "kind" property - see CssDeclaration.Write in
// CssVariableExtractor.cs), so this isn't derived from payload data; it's kept here purely as a
// same-order mirror of the C# enum for local reference if/when this codebase needs to reason about
// kinds generically instead of switching on the five concrete __Type strings.
export enum CssDeclarationKind {
    Color,
    Unit,
    Number,
    VarReference,
    Keyword,
}

// Mirrors ExtraTheme.Helpers' CssDeclaration hierarchy (src/Helpers/CssVariableExtractor.cs). Each
// C# subclass writes its own __Type via GetType().FullName (e.g.
// "ExtraTheme.Helpers.CssColorDeclaration"), so a components map keyed by those exact strings can
// be used with TypedRenderer to pick the right control per concrete shape - the same mechanism
// ExtraPanelsRoot already uses for panel content. selector/name/rawValue live directly here (not in
// a separate row wrapper) since a CssDeclaration is never used standalone without them - the UI
// works off one flat list of these.
// Typed<""> (not Typed<string>) to match TypedRenderer/TypedListRenderer's own signature - the
// same "" placeholder ExtraPanelType uses, since the real runtime value is one of several full C#
// type-name strings, not literally "".
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
