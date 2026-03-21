using Microsoft.Build.Construction;
using Microsoft.Build.Evaluation;
using Microsoft.Build.Execution;
using Microsoft.Build.Graph;
using NuGet.ProjectModel;
using DotnetAnalyzer.Models;

namespace DotnetAnalyzer;

public static class Analyzer
{
    public static AnalysisResult Analyze(string workspaceRoot, List<string> projectFiles)
    {
        var result = new AnalysisResult();

        // Resolve .sln files to their constituent project files
        var resolvedProjectFiles = new List<string>();
        foreach (var file in projectFiles)
        {
            if (file.EndsWith(".sln", StringComparison.OrdinalIgnoreCase))
            {
                resolvedProjectFiles.AddRange(GetProjectsFromSolution(file));
            }
            else
            {
                resolvedProjectFiles.Add(file);
            }
        }

        if (resolvedProjectFiles.Count == 0)
        {
            result.Errors.Add("No project files found after resolving solution files.");
            return result;
        }

        // Build ProjectGraph to discover all projects and their references
        ProjectGraph projectGraph;
        try
        {
            projectGraph = new ProjectGraph(resolvedProjectFiles);
        }
        catch (Exception ex)
        {
            result.Errors.Add($"Failed to build project graph: {ex.Message}");
            return result;
        }

        var allPackages = new Dictionary<string, ResolvedPackage>();
        var allEdges = new Dictionary<string, HashSet<string>>();
        var allSources = new HashSet<string>();
        var directPackageKeys = new HashSet<string>();

        foreach (var node in projectGraph.ProjectNodes)
        {
            var projectInstance = node.ProjectInstance;
            var projectDir = Path.GetDirectoryName(projectInstance.FullPath) ?? "";
            var assetsFilePath = Path.Combine(projectDir, "obj", "project.assets.json");

            // Auto-restore if assets file is missing
            if (!File.Exists(assetsFilePath))
            {
                var restoreSuccess = RunRestore(projectInstance.FullPath);
                if (!restoreSuccess)
                {
                    result.Errors.Add($"Restore failed for {projectInstance.FullPath}. Skipping.");
                    continue;
                }

                if (!File.Exists(assetsFilePath))
                {
                    result.Errors.Add($"project.assets.json not found after restore for {projectInstance.FullPath}. Skipping.");
                    continue;
                }
            }

            // Read the lock file
            LockFile lockFile;
            try
            {
                var lockFileFormat = new LockFileFormat();
                lockFile = lockFileFormat.Read(assetsFilePath);
            }
            catch (Exception ex)
            {
                result.Errors.Add($"Failed to read {assetsFilePath}: {ex.Message}");
                continue;
            }

            // Collect package sources from PackageSpec
            if (lockFile.PackageSpec?.RestoreMetadata?.Sources != null)
            {
                foreach (var source in lockFile.PackageSpec.RestoreMetadata.Sources)
                {
                    allSources.Add(source.Source);
                }
            }

            // Determine direct dependencies from ProjectFileDependencyGroups
            var directDeps = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var group in lockFile.ProjectFileDependencyGroups)
            {
                foreach (var dep in group.Dependencies)
                {
                    // Format is "PackageName >= Version" or just "PackageName"
                    var depName = dep.Split(' ')[0];
                    directDeps.Add(depName);
                }
            }

            // Process each target framework
            foreach (var target in lockFile.Targets)
            {
                var framework = target.TargetFramework?.GetShortFolderName() ?? "unknown";

                foreach (var lib in target.Libraries)
                {
                    // Skip project references (only process packages)
                    if (lib.Type != null &&
                        lib.Type.Equals("project", StringComparison.OrdinalIgnoreCase))
                    {
                        continue;
                    }

                    var key = $"{lib.Name}@{lib.Version}";
                    var isDirect = lib.Name != null && directDeps.Contains(lib.Name);

                    if (isDirect) directPackageKeys.Add(key);

                    // Build dependency edges
                    var depKeys = new List<string>();
                    if (lib.Dependencies != null)
                    {
                        foreach (var dep in lib.Dependencies)
                        {
                            // Find the resolved version from the target's libraries
                            var resolvedDep = target.Libraries
                                .FirstOrDefault(l => l.Name != null && l.Name.Equals(dep.Id, StringComparison.OrdinalIgnoreCase));
                            if (resolvedDep != null)
                            {
                                depKeys.Add($"{resolvedDep.Name}@{resolvedDep.Version}");
                            }
                        }
                    }

                    if (depKeys.Count > 0)
                    {
                        if (allEdges.TryGetValue(key, out var existingEdges))
                        {
                            foreach (var dk in depKeys) existingEdges.Add(dk);
                        }
                        else
                        {
                            allEdges[key] = new HashSet<string>(depKeys);
                        }
                    }

                    // Add or update package
                    if (!allPackages.ContainsKey(key))
                    {
                        // Find sha512 from top-level libraries
                        var lockFileLib = lockFile.Libraries
                            .FirstOrDefault(l => l.Name.Equals(lib.Name, StringComparison.OrdinalIgnoreCase)
                                && l.Version?.ToString() == lib.Version?.ToString());

                        allPackages[key] = new ResolvedPackage
                        {
                            Name = lib.Name ?? "",
                            Version = lib.Version?.ToString() ?? "",
                            Sha512 = lockFileLib?.Sha512,
                            Direct = isDirect,
                            Framework = framework,
                            Dependencies = depKeys
                        };
                    }
                    else if (isDirect)
                    {
                        // If we previously saw it as transitive but now it's direct, update
                        allPackages[key].Direct = true;
                    }
                }
            }
        }

        // Mark all packages that appear in directPackageKeys as direct
        foreach (var key in directPackageKeys)
        {
            if (allPackages.TryGetValue(key, out var pkg))
            {
                pkg.Direct = true;
            }
        }

        result.Packages = allPackages.Values.ToList();
        result.Edges = allEdges.ToDictionary(
            kvp => kvp.Key,
            kvp => kvp.Value.ToList()
        );
        result.PackageSources = allSources.ToList();

        return result;
    }

    private static List<string> GetProjectsFromSolution(string solutionPath)
    {
        var projects = new List<string>();
        try
        {
            var solution = SolutionFile.Parse(solutionPath);
            var solutionDir = Path.GetDirectoryName(solutionPath) ?? "";

            foreach (var project in solution.ProjectsInOrder)
            {
                if (project.ProjectType == SolutionProjectType.SolutionFolder)
                    continue;

                var projectPath = Path.GetFullPath(
                    Path.Combine(solutionDir, project.RelativePath));

                if (File.Exists(projectPath))
                    projects.Add(projectPath);
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"Warning: Failed to parse solution {solutionPath}: {ex.Message}");
        }

        return projects;
    }

    private static bool RunRestore(string projectPath)
    {
        try
        {
            Console.Error.WriteLine($"Restoring {projectPath}...");
            var projectCollection = new ProjectCollection();
            var globalProperties = new Dictionary<string, string>
            {
                { "RestoreRecursive", "false" }
            };
            var buildParameters = new BuildParameters(projectCollection)
            {
                Loggers = Array.Empty<Microsoft.Build.Framework.ILogger>()
            };

            var buildRequest = new BuildRequestData(
                projectPath,
                globalProperties,
                null,
                new[] { "Restore" },
                null
            );

            BuildManager.DefaultBuildManager.BeginBuild(buildParameters);
            try
            {
                var buildResult = BuildManager.DefaultBuildManager.BuildRequest(buildRequest);
                return buildResult.OverallResult == BuildResultCode.Success;
            }
            finally
            {
                BuildManager.DefaultBuildManager.EndBuild();
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"Restore failed for {projectPath}: {ex.Message}");
            return false;
        }
    }
}
