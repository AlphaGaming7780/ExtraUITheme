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

// Palette commands, read through FakeJsonReader standing in for cohtml.
Assembly mod = serializer.Assembly;
Type commandType = mod.GetType("ExtraUITheme.Helpers.PaletteCommand")!;
object Command(string json) => ReadCommand(commandType, json);
object Call(object target, string method, params object[] args) => target.GetType().GetMethod(method, BindingFlags.NonPublic | BindingFlags.Instance)!.Invoke(target, args);
IDictionary Overrides(object theme) => (IDictionary)Field(theme, "Overrides");
Type stateType = mod.GetType("ExtraUITheme.Helpers.ThemeState")!;
object Capture(object theme) => stateType.GetMethod("Capture", BindingFlags.NonPublic | BindingFlags.Static)!.Invoke(null, new[] { theme })!;
void SetDirty(object theme, bool value) => theme.GetType().GetField("IsDirty", BindingFlags.NonPublic | BindingFlags.Instance)!.SetValue(theme, value);
bool IsDirty(object theme) => (bool)theme.GetType().GetField("IsDirty", BindingFlags.NonPublic | BindingFlags.Instance)!.GetValue(theme)!;

Console.WriteLine("PaletteCommand.Read");
object set = Command("{\"Entry\": {\"From\": \"rgb(75,195,241)\", \"Anchors\": [\"--accentColorNormal\", \"--selectedColor\"], \"To\": \"rgb(220,60,60)\"},"
    + " \"Values\": {\"--accentColorNormal\": \"#dc3c3c\", \"--selectedColor\": \"#d24646\", \"--menuTitleNormal\": \"#ff0000\"}}");
Check("entry and values read", set != null && (string)Field(Field(set, "Entry"), "To") == "rgb(220,60,60)" && Count(Field(set, "Values")) == 3);
Check("missing fields get defaults", Count(Field(set, "Names")) == 0 && Field(set, "Palette") == null);
Check("null keys keep defaults", Count(Field(Command("{\"Entry\": null, \"Values\": null, \"Names\": null}"), "Names")) == 0
    && Field(Command("{\"Entry\": null}"), "Entry") == null && Field(Command("{\"Values\": null}"), "Values") != null);
object full = Command("{\"Palette\": [{\"From\": \"rgb(1,2,3)\", \"Anchors\": [\"--a\"], \"To\": \"#fff\", \"FollowAccentHue\": true}, {\"To\": \"#000\"}],"
    + " \"Names\": [\"--x\", \"--y\"], \"Values\": {}}");
var palette = (Array)Field(full, "Palette");
Check("palette array and every entry field read", palette.Length == 2 && (string)Field(palette.GetValue(0)!, "From") == "rgb(1,2,3)"
    && ((string[])Field(palette.GetValue(0)!, "Anchors"))[0] == "--a" && (bool)Field(palette.GetValue(0)!, "FollowAccentHue")
    && (string)Field(palette.GetValue(1)!, "To") == "#000" && ((string[])Field(palette.GetValue(1)!, "Anchors")).Length == 0);
Check("names read, empty values map", Count(Field(full, "Names")) == 2 && Count(Field(full, "Values")) == 0);

Console.WriteLine("Theme palette edits (theme.v2.json: --menuTitleNormal is Manual)");
object theme = ReadFixture("theme.v2.json").Theme;
object initial = Capture(theme);
Call(theme, "SetPaletteColor", Field(set, "Entry"), Field(set, "Values"));
Check("one entry for the group, replaced not added", Count(Field(theme, "Palette")) == 1 && (string)Field(FirstPalette(theme), "To") == "rgb(220,60,60)");
Check("derived values written", (string)Overrides(theme)["--accentColorNormal"] == "#dc3c3c" && (string)Overrides(theme)["--selectedColor"] == "#d24646");
Check("Manual variable untouched", (string)Overrides(theme)["--menuTitleNormal"] == "rgb(255, 200, 200)");
Check("palette values don't become Manual", Count(Field(theme, "Manual")) == 1);

object afterSet = Capture(theme);
MethodInfo sameAs = stateType.GetMethod("SameAs", BindingFlags.NonPublic | BindingFlags.Instance)!;
Check("snapshot sees the change", !(bool)sameAs.Invoke(initial, new[] { afterSet })!);
stateType.GetMethod("RestoreTo", BindingFlags.NonPublic | BindingFlags.Instance)!.Invoke(initial, new[] { theme });
Check("undo restores values and palette in one go", (string)Overrides(theme)["--accentColorNormal"] == "rgb(220, 60, 60)"
    && (string)Field(FirstPalette(theme), "To") == "rgb(220,60,60)" && (bool)sameAs.Invoke(initial, new[] { Capture(theme) })!);
Check("undo doesn't mark anything Manual", Count(Field(theme, "Manual")) == 1);

object reset = Command("{\"Entry\": {\"Anchors\": [\"--selectedColor\"]}, \"Names\": [\"--accentColorNormal\", \"--selectedColor\", \"--menuTitleNormal\"]}");
Call(theme, "ResetPaletteColor", Field(reset, "Entry"), Field(reset, "Names"));
Check("reset finds the entry by a shared anchor", Count(Field(theme, "Palette")) == 0);
Check("reset reverts the group but keeps Manual", Count(Overrides(theme)) == 1 && Overrides(theme).Contains("--menuTitleNormal"));

Call(theme, "ReattachVariable", "--menuTitleNormal", "#123456");
Check("reattach: palette value, no longer Manual", (string)Overrides(theme)["--menuTitleNormal"] == "#123456" && Count(Field(theme, "Manual")) == 0);
Call(theme, "ReattachVariable", "--menuTitleNormal", null);
Check("reattach without a palette value: back to default", Count(Overrides(theme)) == 0);

Console.WriteLine("Theme.SyncPalette");
theme = ReadFixture("theme.v2.json").Theme;
var paletteArray = Array.CreateInstance(FirstPalette(theme).GetType(), 1);
paletteArray.SetValue(FirstPalette(theme), 0);
SetDirty(theme, false);
object noChange = Command("{\"Palette\": [], \"Values\": {\"--accentColorNormal\": \"rgb(220, 60, 60)\"}}");
Check("same values: no change, stays clean", !(bool)Call(theme, "SyncPalette", paletteArray, Field(noChange, "Values"), Field(noChange, "Names")) && !IsDirty(theme));
object sync = Command("{\"Palette\": [], \"Values\": {\"--newGameVar\": \"#dc3c3c\", \"--menuTitleNormal\": \"#000000\"}, \"Names\": [\"--selectedColor\", \"--menuTitleNormal\"]}");
Check("new values: changed and dirty", (bool)Call(theme, "SyncPalette", paletteArray, Field(sync, "Values"), Field(sync, "Names")) && IsDirty(theme));
Check("new game variable joins, gone one removed", (string)Overrides(theme)["--newGameVar"] == "#dc3c3c" && !Overrides(theme).Contains("--selectedColor"));
Check("Manual never synced nor removed", (string)Overrides(theme)["--menuTitleNormal"] == "rgb(255, 200, 200)");

Console.WriteLine("Theme.Equals (the binding only resends a theme that differs)");
object a = ReadFixture("theme.v2.json").Theme, b = ReadFixture("theme.v2.json").Theme;
Check("same file: equal", a.Equals(b));
FirstPalette(b).GetType().GetField("To")!.SetValue(FirstPalette(b), "rgb(0,0,0)");
Check("palette color changed, same overrides: not equal", !a.Equals(b));

Console.WriteLine("CssVariableExtractor.CountVarUsages");
var usages = (IDictionary)extractor.GetMethod("CountVarUsages", BindingFlags.NonPublic | BindingFlags.Static)!
    .Invoke(null, new object[] { ":root{--a:var(--b)}.x{color:var( --b );background:var(--c, red)}" })!;
Check("counts every var() read", (int)usages["--b"]! == 2 && (int)usages["--c"]! == 1 && !usages.Contains("--a"));

Console.WriteLine();
Console.WriteLine("--- theme.v2.json written back ---");
Console.WriteLine(written);
Console.WriteLine(failures == 0 ? "All checks passed" : $"{failures} failure(s)");
return failures == 0 ? 0 : 1;

static string Here([CallerFilePath] string path = "") => path;

// Separate method so FakeJsonReader's game types load after the assembly resolver.
[MethodImpl(MethodImplOptions.NoInlining)]
static object ReadCommand(Type commandType, string json)
{
    var command = (Colossal.UI.Binding.IJsonReadable)Activator.CreateInstance(commandType, nonPublic: true)!;
    command.Read(new FakeJsonReader(json));
    return command;
}
