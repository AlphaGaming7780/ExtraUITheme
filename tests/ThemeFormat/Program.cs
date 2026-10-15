using System.Collections;
using System.Reflection;
using System.Runtime.CompilerServices;

// Reads every fixture through ThemeSerializer and checks it comes out in the current format. Fixtures are frozen: never edit one, add a new file.
string root = Path.GetDirectoryName(Here())!;
string managed = Environment.GetEnvironmentVariable("CSII_MANAGEDPATH") ?? throw new Exception("CSII_MANAGEDPATH is not set.");
string modDll = Path.GetFullPath(Path.Combine(root, "..", "..", "bin", "Release", "net48", "ExtraUITheme.dll"));

// Game assemblies (Colossal.Core for the JSON decoder, Colossal.UI.Binding for Theme's interface) come from the game's Managed folder.
AppDomain.CurrentDomain.AssemblyResolve += (_, e) =>
{
    string candidate = Path.Combine(managed, new AssemblyName(e.Name).Name + ".dll");
    return File.Exists(candidate) ? Assembly.LoadFrom(candidate) : null;
};

Type serializer = Assembly.LoadFrom(modDll).GetType("ExtraUITheme.Helpers.ThemeFormat.ThemeSerializer")!;
MethodInfo read = serializer.GetMethod("Read", BindingFlags.NonPublic | BindingFlags.Static)!;
MethodInfo write = serializer.GetMethod("Write", BindingFlags.NonPublic | BindingFlags.Static)!;

int failures = 0;
void Check(string label, bool condition)
{
    Console.WriteLine($"  {(condition ? "ok  " : "FAIL")} {label}");
    if (!condition) failures++;
}

(string Status, object Theme, int Version) Read(string json)
{
    object[] args = { json, null, 0 };
    string status = read.Invoke(null, args)!.ToString();
    return (status, args[1], (int)args[2]);
}

(string Status, object Theme, int Version) ReadFixture(string file) => Read(File.ReadAllText(Path.Combine(root, file)));
string Write(object theme) => (string)write.Invoke(null, new[] { theme })!;
int Count(object collection) => ((IEnumerable)collection).Cast<object>().Count();
bool Has(object set, string item) => ((IEnumerable)set).Cast<string>().Contains(item);
object Field(object o, string name) => o.GetType().GetField(name)!.GetValue(o);
object FirstPalette(object theme) => ((IList)Field(theme, "Palette"))[0];

Console.WriteLine("theme.v1.json");
var r = ReadFixture("theme.v1.json");
Check("status Ok", r.Status == "Ok");
Check("source version 1", r.Version == 1);
Check("name kept", (string)Field(r.Theme, "Name") == "Pink V1");
Check("2 overrides", Count(Field(r.Theme, "Overrides")) == 2);
Check("every V1 variable is manual", Count(Field(r.Theme, "Manual")) == 2 && Has(Field(r.Theme, "Manual"), "--highlightGreen"));
Check("empty palette", Count(Field(r.Theme, "Palette")) == 0);
string written = Write(r.Theme);
Check("written as Version 2", written.Contains("\"Version\": 2"));
var again = Read(written);
Check("round trip keeps overrides", again.Version == 2 && Count(Field(again.Theme, "Overrides")) == 2);

Console.WriteLine("theme.v1-lowercase.json");
r = ReadFixture("theme.v1-lowercase.json");
Check("status Ok", r.Status == "Ok");
Check("lowercase name", (string)Field(r.Theme, "Name") == "Old export");
Check("lowercase overrides", ((IDictionary)Field(r.Theme, "Overrides"))["--accentColorDark"] as string == "#ff0000");

Console.WriteLine("theme.v1-bare.json");
r = ReadFixture("theme.v1-bare.json");
Check("status Ok", r.Status == "Ok");
Check("no name", Field(r.Theme, "Name") == null);
Check("bare map read as overrides", Count(Field(r.Theme, "Overrides")) == 2);

Console.WriteLine("theme.v2.json");
r = ReadFixture("theme.v2.json");
Check("status Ok", r.Status == "Ok");
Check("source version 2", r.Version == 2);
Check("3 overrides", Count(Field(r.Theme, "Overrides")) == 3);
Check("only the detached variable is manual", Count(Field(r.Theme, "Manual")) == 1 && Has(Field(r.Theme, "Manual"), "--menuTitleNormal"));
object entry = FirstPalette(r.Theme);
Check("palette entry", Count(Field(r.Theme, "Palette")) == 1 && (string)Field(entry, "To") == "rgb(220,60,60)"
    && ((string[])Field(entry, "Anchors")).Length == 2 && (bool)Field(entry, "FollowAccentHue"));
written = Write(r.Theme);
again = Read(written);
Check("round trip keeps palette", Count(Field(again.Theme, "Palette")) == 1 && (string)Field(FirstPalette(again.Theme), "From") == "rgb(75,195,241)");
Check("no type hints in the file", !written.Contains("$type"));

Console.WriteLine("theme.v99.json");
r = ReadFixture("theme.v99.json");
Check("status TooNew", r.Status == "TooNew");
Check("nothing loaded", r.Theme == null);

Console.WriteLine();
Console.WriteLine("--- theme.v2.json written back ---");
Console.WriteLine(written);
Console.WriteLine(failures == 0 ? "All checks passed" : $"{failures} failure(s)");
return failures == 0 ? 0 : 1;

static string Here([CallerFilePath] string path = "") => path;
