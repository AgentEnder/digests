namespace DotnetAnalyzer.Models;

public class AnalysisResult
{
    public List<ResolvedPackage> Packages { get; set; } = new();
    public Dictionary<string, List<string>> Edges { get; set; } = new();
    public List<string> PackageSources { get; set; } = new();
    public List<string> Errors { get; set; } = new();
}
