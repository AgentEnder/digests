import { Link } from '../../components/Link';

export default function Page() {
  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="py-16 px-6 text-center">
        <h1 className="text-5xl md:text-6xl font-bold mb-4 tracking-tight">
          Digests
        </h1>
        <p className="text-xl md:text-2xl text-gray-600 dark:text-gray-400 mb-8 max-w-2xl mx-auto">
          Dependency health analysis toolkit for software projects.
          Scan, report, and visualize your dependency landscape.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <Link
            href="/docs"
            className="px-8 py-3 rounded-lg font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            Get Started
          </Link>
          <Link
            href="/viewer"
            className="px-8 py-3 rounded-lg font-semibold border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Open Viewer
          </Link>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">
            What&apos;s in the toolkit?
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <FeatureCard
              title="Multi-Ecosystem"
              description="Scan JavaScript, Rust, .NET, and Java projects with dedicated plugins for each ecosystem."
            />
            <FeatureCard
              title="Health Reports"
              description="Get detailed dependency health metrics including vulnerabilities, outdated packages, and maintenance signals."
            />
            <FeatureCard
              title="Multiple Formats"
              description="Export as Markdown, JSON, HTML, CycloneDX SBOM, or SPDX for compliance and security workflows."
            />
            <FeatureCard
              title="Interactive Viewer"
              description="Explore your dependencies with an interactive dashboard featuring tables, license views, and dependency graphs."
            />
            <FeatureCard
              title="PR Digests"
              description="Generate comprehensive PR summaries with full timeline context for code review."
            />
            <FeatureCard
              title="Vulnerability Scanning"
              description="Integrated with OSV.dev for real-time vulnerability detection across all ecosystems."
            />
          </div>
        </div>
      </section>
    </div>
  );
}

function FeatureCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="p-6 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-colors">
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-gray-600 dark:text-gray-400 text-sm">{description}</p>
    </div>
  );
}
