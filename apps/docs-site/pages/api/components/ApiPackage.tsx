import { Link } from '../../../components/Link';

interface ApiPackageProps {
  packageSlug: string;
  isInternal: boolean;
  readmeHtml: string | null;
  exports: Array<{ slug: string; name: string; kind: string; path: string }>;
}

export function ApiPackage({
  packageSlug,
  isInternal,
  readmeHtml,
  exports,
}: ApiPackageProps) {
  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400 mb-6">
        <Link href="/api" className="hover:text-blue-400">
          API Reference
        </Link>
        {isInternal && (
          <>
            <span>/</span>
            <span className="text-amber-400">Internal</span>
          </>
        )}
        <span>/</span>
        <span className="text-gray-100">{packageSlug}</span>
      </div>

      {/* Internal warning */}
      {isInternal && (
        <div className="mb-6 p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
          <p className="text-amber-400 text-sm">
            <strong>Internal package.</strong> This API is not covered by
            semver guarantees and may change without notice between releases.
          </p>
        </div>
      )}

      <div className="mb-8">
        <h1 className="text-4xl font-bold text-gray-100 font-mono mb-2">
          {packageSlug}
        </h1>
        <p className="text-gray-400">
          {exports.length} exported symbol{exports.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* README content */}
      {readmeHtml && (
        <div className="mb-10">
          <div
            className="prose prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: readmeHtml }}
          />
        </div>
      )}

      {/* Exports list */}
      <h2 className="text-xl font-semibold text-gray-100 mb-4">Exports</h2>
      <div className="space-y-2">
        {exports.map((exp) => (
          <Link
            key={exp.slug}
            href={exp.path}
            className="flex items-center gap-3 p-3 rounded-lg bg-gray-800/50 hover:bg-gray-800 border border-transparent hover:border-blue-500/30 transition-all group"
          >
            <span className="text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 uppercase font-semibold">
              {exp.kind}
            </span>
            <span className="font-mono text-gray-100 group-hover:text-blue-400 transition-colors">
              {exp.name}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
