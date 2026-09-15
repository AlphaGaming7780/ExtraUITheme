using Colossal.UI.Binding;
using System;

namespace ExtraTheme.Helpers
{
    internal enum CssDeclarationKind
    {
        Color,
        Unit,
        Number,
        VarReference,
        Keyword,
    }

    internal abstract class CssDeclaration : IJsonWritable, IEquatable<CssDeclaration>
    {
        // Full selector this value is declared under, including any enclosing @-rule context
        // (e.g. ":root", ".dark-theme", "@media (prefers-color-scheme: dark) :root"). The same
        // variable Name can appear multiple times with different Selector/RawValue pairs - that's
        // how the game's light/dark (and other) themes each override the same variables.
        public readonly string Selector;
        public readonly string Name;
        public readonly string RawValue;

        protected CssDeclaration(string selector, string name, string rawValue)
        {
            Selector = selector;
            Name = name;
            RawValue = rawValue;
        }

        public abstract CssDeclarationKind Kind { get; }

        public void Write(IJsonWriter writer)
        {
            // Full type name (not just the short class name) - matches the convention already used
            // for ExtraPanel content (ExtraPanelBase.ID => GetType().FullName), so the UI side can key
            // a components map by this exact string and pick the right renderer per concrete
            // CssDeclaration subclass via TypedRenderer, the same way ExtraPanelsRoot does for panel
            // content.
            writer.TypeBegin(GetType().FullName);
            writer.PropertyName("selector");
            writer.Write(Selector);
            writer.PropertyName("name");
            writer.Write(Name);
            writer.PropertyName("rawValue");
            writer.Write(RawValue);
            writer.PropertyName("kind");
            writer.Write((int)Kind);
            WriteFields(writer);
            writer.TypeEnd();
        }

        protected abstract void WriteFields(IJsonWriter writer);

        // Every subclass's extra fields (R/G/B/A, Number/Unit, ...) are deterministically parsed
        // from RawValue (see Classify()), so Selector+Name+RawValue+concrete type is enough to
        // decide equality - needed so GetterValueBinding's default comparer can tell two
        // structurally-identical extraction passes apart from a genuinely changed one, instead of
        // always treating a freshly-allocated List<CssDeclaration> as "changed" by reference.
        public bool Equals(CssDeclaration other)
        {
            if (other is null) return false;
            if (ReferenceEquals(this, other)) return true;
            return GetType() == other.GetType() && Selector == other.Selector && Name == other.Name && RawValue == other.RawValue;
        }

        public override bool Equals(object obj) => Equals(obj as CssDeclaration);

        public override int GetHashCode()
        {
            unchecked
            {
                int hash = 17;
                hash = hash * 31 + GetType().GetHashCode();
                hash = hash * 31 + (Selector?.GetHashCode() ?? 0);
                hash = hash * 31 + (Name?.GetHashCode() ?? 0);
                hash = hash * 31 + (RawValue?.GetHashCode() ?? 0);
                return hash;
            }
        }
    }

    internal sealed class CssColorDeclaration : CssDeclaration
    {
        public readonly double R, G, B, A;

        // Set for e.g. "rgba(42,55,83,var(--panelOpacityNormal))" - a handful of the game's own
        // panel-background variables tie their alpha to another variable instead of a literal
        // number. A is still populated (1.0, a display-only stand-in - the real alpha depends on
        // AlphaVarRef's own current value, which this extractor doesn't resolve) so the row can
        // still render a swatch; editing one of these commits a plain literal-alpha rgba() like any
        // other color, same as picking a new value always has replaced whatever the old one was.
        public readonly string AlphaVarRef;

        public CssColorDeclaration(string selector, string name, string rawValue, double r, double g, double b, double a, string alphaVarRef = null)
            : base(selector, name, rawValue)
        {
            R = r; G = g; B = b; A = a;
            AlphaVarRef = alphaVarRef;
        }

        public override CssDeclarationKind Kind => CssDeclarationKind.Color;

        protected override void WriteFields(IJsonWriter writer)
        {
            writer.PropertyName("r");
            writer.Write(R);
            writer.PropertyName("g");
            writer.Write(G);
            writer.PropertyName("b");
            writer.Write(B);
            writer.PropertyName("a");
            writer.Write(A);
            writer.PropertyName("alphaVarRef");
            writer.Write(AlphaVarRef ?? "");
        }
    }

    internal sealed class CssUnitDeclaration : CssDeclaration
    {
        public readonly double Number;
        public readonly string Unit;

        public CssUnitDeclaration(string selector, string name, string rawValue, double number, string unit)
            : base(selector, name, rawValue)
        {
            Number = number;
            Unit = unit;
        }

        public override CssDeclarationKind Kind => CssDeclarationKind.Unit;

        protected override void WriteFields(IJsonWriter writer)
        {
            writer.PropertyName("number");
            writer.Write(Number);
            writer.PropertyName("unit");
            writer.Write(Unit);
        }
    }

    internal sealed class CssNumberDeclaration : CssDeclaration
    {
        public readonly double Number;

        public CssNumberDeclaration(string selector, string name, string rawValue, double number)
            : base(selector, name, rawValue)
        {
            Number = number;
        }

        public override CssDeclarationKind Kind => CssDeclarationKind.Number;

        protected override void WriteFields(IJsonWriter writer)
        {
            writer.PropertyName("number");
            writer.Write(Number);
        }
    }

    internal sealed class CssVarReferenceDeclaration : CssDeclaration
    {
        public readonly string ReferencedVariable;

        public CssVarReferenceDeclaration(string selector, string name, string rawValue, string referencedVariable)
            : base(selector, name, rawValue)
        {
            ReferencedVariable = referencedVariable;
        }

        public override CssDeclarationKind Kind => CssDeclarationKind.VarReference;

        protected override void WriteFields(IJsonWriter writer)
        {
            writer.PropertyName("referencedVariable");
            writer.Write(ReferencedVariable);
        }
    }

    internal sealed class CssKeywordDeclaration : CssDeclaration
    {
        public CssKeywordDeclaration(string selector, string name, string rawValue)
            : base(selector, name, rawValue)
        {
        }

        public override CssDeclarationKind Kind => CssDeclarationKind.Keyword;

        protected override void WriteFields(IJsonWriter writer)
        {
        }
    }
}
