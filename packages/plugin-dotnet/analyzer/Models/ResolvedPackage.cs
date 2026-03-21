namespace DotnetAnalyzer.Models;

public class ResolvedPackage
{
    public string Name { get; set; } = "";
    public string Version { get; set; } = "";
    public string? Sha512 { get; set; }
    public bool Direct { get; set; }
    public string? Framework { get; set; }
    public List<string> Dependencies { get; set; } = new();
}
