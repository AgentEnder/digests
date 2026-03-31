import { Link } from '../../../components/Link';

interface PackageGroup {
  title: string;
  packages: Array<{ slug: string; path: string }>;
}

interface ApiLandingProps {
  groups: PackageGroup[];
}

export function ApiLanding({ groups }: ApiLandingProps) {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-gray-100 mb-4">
          API Reference
        </h1>
        <p className="text-gray-400 text-lg">
          Browse the API documentation for each package in the Digests
          monorepo.
        </p>
      </div>

      <div className="space-y-8">
        {groups.map((group) => (
          <div key={group.title}>
            <h2 className="text-xl font-semibold text-gray-200 mb-3">
              {group.title}
              {group.title === 'Internal' && (
                <span className="ml-2 text-xs font-normal px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 align-middle">
                  Unstable API
                </span>
              )}
            </h2>
            <div className="space-y-2">
              {group.packages.map((pkg) => (
                <Link
                  key={pkg.slug}
                  href={pkg.path}
                  className="flex items-center gap-3 p-3 rounded-lg bg-gray-800/50 hover:bg-gray-800 border border-transparent hover:border-blue-500/30 transition-all group"
                >
                  <span className="font-mono text-gray-100 group-hover:text-blue-400 transition-colors">
                    {pkg.slug}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
