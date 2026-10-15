using System.Text.Json;
using Colossal.UI.Binding;
using CohtmlValueType = cohtml.Net.ValueType;

// Stand-in for cohtml's JsonReader, with the same cursor; wrong-type reads throw.
internal sealed class FakeJsonReader : IJsonReader
{
    // Open maps and arrays, innermost on top. NextKey: index of the key the next ReadMapKeyValue moves to.
    private sealed class Frame
    {
        internal JsonElement Element;
        internal int NextKey;
    }

    private readonly Stack<Frame> m_Containers = new Stack<Frame>();
    // Values waiting to be read: the root, a property's value, an array element, or a map's key then value.
    private readonly Queue<JsonElement> m_Pending = new Queue<JsonElement>();

    internal FakeJsonReader(string json)
    {
        m_Pending.Enqueue(JsonDocument.Parse(json).RootElement.Clone());
    }

    public string debugName => "FakeJsonReader";

    public int GetArgumentsCount() => 1;

    public CohtmlValueType PeekValueType()
    {
        if (m_Pending.Count == 0) throw new InvalidOperationException("Nothing to read: call ReadProperty / ReadArrayElement / ReadMapKeyValue first.");
        return m_Pending.Peek().ValueKind switch
        {
            JsonValueKind.Null => CohtmlValueType.Null,
            JsonValueKind.True or JsonValueKind.False => CohtmlValueType.Boolean,
            JsonValueKind.Number => CohtmlValueType.Number,
            JsonValueKind.String => CohtmlValueType.String,
            JsonValueKind.Object => CohtmlValueType.Object,
            JsonValueKind.Array => CohtmlValueType.Array,
            _ => CohtmlValueType.Undefined,
        };
    }

    private JsonElement Next(JsonValueKind expected)
    {
        if (m_Pending.Count == 0) throw new InvalidOperationException($"Nothing to read, expected {expected}.");
        JsonElement value = m_Pending.Dequeue();
        bool ok = value.ValueKind == expected || (expected == JsonValueKind.True && value.ValueKind == JsonValueKind.False);
        if (!ok) throw new InvalidOperationException($"Expected {expected}, got {value.ValueKind}.");
        return value;
    }

    public void SkipValue() => m_Pending.Dequeue();

    public void Read(out bool value) => value = Next(JsonValueKind.True).GetBoolean();
    public void Read(out uint value) => value = Next(JsonValueKind.Number).GetUInt32();
    public void Read(out int value) => value = Next(JsonValueKind.Number).GetInt32();
    public void Read(out ulong value) => value = Next(JsonValueKind.Number).GetUInt64();
    public void Read(out long value) => value = Next(JsonValueKind.Number).GetInt64();
    public void Read(out float value) => value = Next(JsonValueKind.Number).GetSingle();
    public void Read(out double value) => value = Next(JsonValueKind.Number).GetDouble();

    // Like cohtml: null reads as a null string (the nullable string reader relies on it).
    public void Read(out string value)
    {
        if (m_Pending.Count > 0 && m_Pending.Peek().ValueKind == JsonValueKind.Null)
        {
            m_Pending.Dequeue();
            value = null;
            return;
        }
        value = Next(JsonValueKind.String).GetString();
    }

    public ulong ReadMapBegin()
    {
        JsonElement map = Next(JsonValueKind.Object);
        m_Containers.Push(new Frame { Element = map });
        return (ulong)map.EnumerateObject().Count();
    }

    public bool ReadProperty(string name)
    {
        m_Pending.Clear();
        if (!m_Containers.Peek().Element.TryGetProperty(name, out JsonElement value)) return false;
        m_Pending.Enqueue(value);
        return true;
    }

    // The n-th call positions on the n-th key, then its value.
    public void ReadMapKeyValue()
    {
        Frame frame = m_Containers.Peek();
        JsonProperty property = frame.Element.EnumerateObject().ElementAt(frame.NextKey++);
        m_Pending.Clear();
        m_Pending.Enqueue(JsonDocument.Parse(JsonSerializer.Serialize(property.Name)).RootElement.Clone());
        m_Pending.Enqueue(property.Value);
    }

    public void ReadMapEnd()
    {
        m_Containers.Pop();
        m_Pending.Clear();
    }

    public ulong ReadArrayBegin()
    {
        JsonElement array = Next(JsonValueKind.Array);
        m_Containers.Push(new Frame { Element = array });
        return (ulong)array.GetArrayLength();
    }

    public void ReadArrayElement(ulong index)
    {
        m_Pending.Clear();
        m_Pending.Enqueue(m_Containers.Peek().Element[(int)index]);
    }

    public void ReadArrayEnd()
    {
        m_Containers.Pop();
        m_Pending.Clear();
    }
}
