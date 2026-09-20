using Colossal.UI.Binding;
using System;

namespace ExtraUITheme.Helpers
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
        // Same Name can appear multiple times with a different Selector - that's how light/dark themes override the same variable.
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
            // Full type name (not short name) so the UI can pick a renderer per subclass via TypedRenderer.
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

        // Selector+Name+RawValue+type is enough to tell two extraction passes apart - subclass fields are all deterministic from RawValue.
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

        // Set when alpha is tied to a var() (e.g. rgba(...,var(--panelOpacityNormal))) - A is then just a 1.0 display stand-in.
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
