using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Build.Locator;
using DotnetAnalyzer;

if (args.Length < 1)
{
    Console.Error.WriteLine("Usage: DotnetAnalyzer <workspaceRoot>");
    Environment.Exit(1);
}

var workspaceRoot = args[0];

// Read project files from stdin (one per line)
var projectFiles = new List<string>();
string? line;
while ((line = Console.ReadLine()) != null)
{
    var trimmed = line.Trim();
    if (!string.IsNullOrEmpty(trimmed))
    {
        // If the path is already absolute, use it as-is; otherwise resolve relative to workspaceRoot
        var fullPath = Path.IsPathRooted(trimmed)
            ? Path.GetFullPath(trimmed)
            : Path.GetFullPath(Path.Combine(workspaceRoot, trimmed));
        projectFiles.Add(fullPath);
    }
}

if (projectFiles.Count == 0)
{
    Console.Error.WriteLine("No project files provided on stdin");
    Environment.Exit(1);
}

// Register MSBuild SDK — must happen before any MSBuild API usage
var queryOptions = new VisualStudioInstanceQueryOptions
{
    AllowAllDotnetLocations = true,
    AllowAllRuntimeVersions = true,
    DiscoveryTypes = DiscoveryType.DotNetSdk
};

var instances = MSBuildLocator
    .QueryVisualStudioInstances(queryOptions)
    .ToList();

if (instances.Count == 0)
{
    Console.Error.WriteLine("No .NET SDK found. Please install the .NET SDK.");
    Console.Error.WriteLine($"Current runtime: {Environment.Version}");
    Environment.Exit(1);
}

// Select the SDK whose major version matches the current runtime, preferring the newest
var currentMajor = Environment.Version.Major;
var selectedInstance = instances
    .Where(i => i.Version.Major == currentMajor)
    .OrderByDescending(i => i.Version)
    .FirstOrDefault();

// Fall back to the newest available SDK if no major version match
selectedInstance ??= instances.OrderByDescending(i => i.Version).First();

Console.Error.WriteLine($"Using .NET SDK {selectedInstance.Version} from {selectedInstance.MSBuildPath}");
MSBuildLocator.RegisterInstance(selectedInstance);

// Run analysis
var result = Analyzer.Analyze(workspaceRoot, projectFiles);

// Serialize to JSON on stdout
var options = new JsonSerializerOptions
{
    PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    WriteIndented = false
};
Console.WriteLine(JsonSerializer.Serialize(result, options));
