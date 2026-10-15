using System.Collections;
using System.Reflection;
using System.Runtime.CompilerServices;

// Reads every fixture through ThemeSerializer and checks it comes out in the current format. Fixtures are frozen: never edit one, add a new file.
string root = Path.GetDirectoryName(Here())!;
string managed = Environment.GetEnvironmentVariable("CSII_MANAGEDPATH") ?? throw new Exception("CSII_MANAGEDPATH is not set.");
string modDll = Path.GetFullPath(Path.Combine(root, "..", "..", "bin", "Release", "net48", "ExtraUITheme.dll"));

// Game assemblies (Colossal.Core for the JSON decoder, Colossal.UI.Binding for Theme's interface) come from the game's Managed folder,
// mod dependencies (ExtraLib, referenced by ThemeManager) from the local Mods folder.
string localMods = Environment.GetEnvironmentVariable("CSII_LOCALMODSPATH") ?? "";
AppDomain.CurrentDomain.AssemblyResolve += (_, e) =>
{
    string name = new AssemblyName(e.Name).Name;
    foreach (string candidate in new[] { Path.Combine(managed, name + ".dll"), Path.Combine(localMods, name, name + ".dll") })
        if (File.Exists(candidate)) return Assembly.LoadFrom(candidate);
    return null;
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

// Validator: a small stand-in for the game's index.css instead of the real one, so the expected issues never drift with game updates.
Type validator = serializer.Assembly.GetType("ExtraUITheme.Helpers.ThemeFormat.ThemeValidator")!;
Type extractor = serializer.Assembly.GetType("ExtraUITheme.Helpers.CssVariableExtractor")!;
object gameDeclarations = extractor.GetMethod("ParseCss", BindingFlags.NonPublic | BindingFlags.Static)!
    .Invoke(null, new object[] { File.ReadAllText(Path.Combine(root, "game.mini.css")) })!;
validator.GetMethod("SetGameDeclarations", BindingFlags.NonPublic | BindingFlags.Static)!.Invoke(null, new[] { gameDeclarations });
MethodInfo validate = validator.GetMethod("Validate", BindingFlags.NonPublic | BindingFlags.Static)!;
Dictionary<string, string> IssuesOf(object theme) => ((IEnumerable)validate.Invoke(null, new[] { theme })!).Cast<object>()
    .ToDictionary(i => (string)Field(i, "Name"), i => Field(i, "Kind").ToString());

Console.WriteLine("theme.issues.json against game.mini.css");
r = ReadFixture("theme.issues.json");
var issues = IssuesOf(r.Theme);
Check("variable gone from the game: Missing", issues.GetValueOrDefault("--removedVar") == "Missing");
Check("not a CSS value where a color is expected: InvalidValue", issues.GetValueOrDefault("--accentColorNormal") == "InvalidValue");
Check("color on a size variable: KindChanged", issues.GetValueOrDefault("--panelRadius") == "KindChanged");
Check("var() to an unknown variable: BrokenReference", issues.GetValueOrDefault("--textColor") == "BrokenReference");
Check("same as the game default: Redundant", issues.GetValueOrDefault("--opacity") == "Redundant");
Check("free-form keyword variable accepts anything", !issues.ContainsKey("--fontFamily"));
Check("valid color is fine", !issues.ContainsKey("--highlight"));
Check("exactly 5 issues", issues.Count == 5);
Check("theme itself untouched", Count(Field(r.Theme, "Overrides")) == 7);

Console.WriteLine("ImportReport.Analyze");
MethodInfo analyze = serializer.Assembly.GetType("ExtraUITheme.Helpers.ThemeFormat.ImportReport")!.GetMethod("Analyze", BindingFlags.NonPublic | BindingFlags.Static)!;
object Analyze(string json) => analyze.Invoke(null, new object[] { json })!;
object report = Analyze(File.ReadAllText(Path.Combine(root, "theme.issues.json")));
Check("Ok with name, count and issues", Field(report, "Status").ToString() == "Ok" && (string)Field(report, "Name") == "Old theme"
    && (int)Field(report, "OverrideCount") == 7 && Count(Field(report, "Issues")) == 5);
Check("not JSON: Invalid", Field(Analyze("not json"), "Status").ToString() == "Invalid");
Check("array: Invalid", Field(Analyze("[1, 2]"), "Status").ToString() == "Invalid");
Check("unrelated object: Invalid", Field(Analyze("{\"foo\": \"bar\"}"), "Status").ToString() == "Invalid");
Check("empty object: Empty", Field(Analyze("{}"), "Status").ToString() == "Empty");
Check("newer version: TooNew", Field(Analyze(File.ReadAllText(Path.Combine(root, "theme.v99.json"))), "Status").ToString() == "TooNew");

Console.WriteLine();
Console.WriteLine("--- theme.v2.json written back ---");
Console.WriteLine(written);
Console.WriteLine(failures == 0 ? "All checks passed" : $"{failures} failure(s)");
return failures == 0 ? 0 : 1;

static string Here([CallerFilePath] string path = "") => path;
