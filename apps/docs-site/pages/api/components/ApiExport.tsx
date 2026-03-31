import { Link } from '../../../components/Link';
import type { LinkedApiExport } from 'vike-plugin-typedoc';

interface ApiExportPageProps {
  mod: LinkedApiExport;
  isInternal?: boolean;
}

export function ApiExportPage({ mod, isInternal }: ApiExportPageProps) {
  const packagePath = isInternal
    ? `/api/internal/${mod.package}`
    : `/api/${mod.package}`;

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
        {mod.package && (
          <>
            <span>/</span>
            <Link href={packagePath} className="hover:text-blue-400">
              {mod.package}
            </Link>
          </>
        )}
        <span>/</span>
        <span className="text-gray-100">{mod.name}</span>
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

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-xs px-2 py-1 rounded bg-blue-500/20 text-blue-400 uppercase font-semibold">
            {mod.kind}
          </span>
          {mod.comment?.deprecated && (
            <span className="text-xs px-2 py-1 rounded bg-red-500/20 text-red-400 uppercase font-semibold">
              Deprecated
            </span>
          )}
        </div>
        <h1 className="text-4xl font-bold text-gray-100 font-mono">
          {mod.name}
        </h1>
      </div>

      {/* Signature */}
      {mod.signatureCodeHtml && (
        <div
          className="mb-8"
          dangerouslySetInnerHTML={{ __html: mod.signatureCodeHtml }}
        />
      )}

      {/* Description */}
      {mod.descriptionHtml && (
        <div
          className="mb-8 prose prose-invert max-w-none"
          dangerouslySetInnerHTML={{ __html: mod.descriptionHtml }}
        />
      )}

      {/* Deprecation Warning */}
      {mod.comment?.deprecated && (
        <div className="mb-8 p-4 rounded-lg bg-red-500/10 border border-red-500/30">
          <p className="text-red-400">
            <strong>Deprecated:</strong> {mod.comment.deprecated}
          </p>
        </div>
      )}

      {/* Parameters */}
      {mod.parameters && mod.parameters.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-100 mb-4">
            Parameters
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="py-2 pr-4 text-gray-400 font-medium">
                    Name
                  </th>
                  <th className="py-2 pr-4 text-gray-400 font-medium">
                    Type
                  </th>
                  <th className="py-2 text-gray-400 font-medium">
                    Description
                  </th>
                </tr>
              </thead>
              <tbody>
                {mod.parameters.map((param) => (
                  <tr
                    key={param.name}
                    className="border-b border-gray-700/50"
                  >
                    <td className="py-3 pr-4 font-mono text-blue-400">
                      {param.name}
                      {param.optional && (
                        <span className="text-gray-500">?</span>
                      )}
                    </td>
                    <td
                      className="py-3 pr-4 font-mono text-gray-300 typedoc-type"
                      dangerouslySetInnerHTML={{
                        __html: param.typeHtml,
                      }}
                    />
                    <td className="py-3 text-gray-400">
                      {param.description || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Return Type */}
      {mod.returnTypeHtml && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-100 mb-4">
            Returns
          </h2>
          <p
            className="font-mono text-gray-300 typedoc-type"
            dangerouslySetInnerHTML={{ __html: mod.returnTypeHtml }}
          />
        </div>
      )}

      {/* Properties */}
      {mod.properties && mod.properties.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-100 mb-4">
            Properties
          </h2>
          <div className="space-y-4">
            {mod.properties.map((prop) => (
              <div
                key={prop.name}
                className="p-4 rounded-lg bg-gray-800/50 border border-gray-700/50"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-mono text-blue-400">
                    {prop.name}
                  </span>
                  {prop.optional && (
                    <span className="text-xs text-gray-500">
                      (optional)
                    </span>
                  )}
                  {prop.readonly && (
                    <span className="text-xs text-gray-500">
                      (readonly)
                    </span>
                  )}
                </div>
                <p
                  className="font-mono text-sm text-gray-400 mb-2 typedoc-type"
                  dangerouslySetInnerHTML={{ __html: prop.typeHtml }}
                />
                {prop.description && (
                  <p className="text-gray-300 text-sm">
                    {prop.description}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Methods */}
      {mod.methods && mod.methods.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-100 mb-4">
            Methods
          </h2>
          <div className="space-y-6">
            {mod.methods.map((method) => (
              <div
                key={method.name}
                className="p-4 rounded-lg bg-gray-800/50 border border-gray-700/50"
              >
                <div
                  className="mb-3 font-mono text-blue-400 typedoc-type"
                  dangerouslySetInnerHTML={{
                    __html: method.signatureHtml,
                  }}
                />
                {method.description && (
                  <p className="text-gray-300 text-sm mb-3">
                    {method.description}
                  </p>
                )}
                {method.parameters && method.parameters.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-700/50">
                    <p className="text-xs text-gray-500 uppercase font-semibold mb-2">
                      Parameters
                    </p>
                    <div className="space-y-1">
                      {method.parameters.map((param) => (
                        <div
                          key={param.name}
                          className="flex gap-2 text-sm"
                        >
                          <span className="font-mono text-purple-400">
                            {param.name}
                            {param.optional && '?'}
                          </span>
                          <span className="text-gray-500">:</span>
                          <span
                            className="font-mono text-gray-400 typedoc-type"
                            dangerouslySetInnerHTML={{
                              __html: param.typeHtml,
                            }}
                          />
                          {param.description && (
                            <span className="text-gray-500">
                              — {param.description}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {method.returnTypeHtml && (
                  <div className="mt-3 pt-3 border-t border-gray-700/50">
                    <p className="text-xs text-gray-500 uppercase font-semibold mb-2">
                      Returns
                    </p>
                    <span
                      className="font-mono text-gray-400 typedoc-type"
                      dangerouslySetInnerHTML={{
                        __html: method.returnTypeHtml,
                      }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Remarks */}
      {mod.remarksHtml && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-100 mb-4">
            Remarks
          </h2>
          <div
            className="prose prose-invert max-w-none text-gray-300"
            dangerouslySetInnerHTML={{ __html: mod.remarksHtml }}
          />
        </div>
      )}

      {/* Examples */}
      {mod.examplesHtml && mod.examplesHtml.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-100 mb-4">
            Examples
          </h2>
          <div className="space-y-4">
            {mod.examplesHtml.map((html, i) => (
              <div
                key={i}
                className="prose prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            ))}
          </div>
        </div>
      )}

      {/* See Also */}
      {mod.comment?.see && mod.comment.see.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-100 mb-4">
            See Also
          </h2>
          <ul className="list-disc list-inside text-gray-300">
            {mod.comment.see.map((ref, i) => (
              <li key={i}>{ref}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Navigation */}
      <div className="mt-12 pt-8 border-t border-gray-700/50">
        <Link
          href={mod.package ? packagePath : '/api'}
          className="text-blue-400 hover:text-blue-300 transition-colors"
        >
          &larr; Back to {mod.package || 'API Reference'}
        </Link>
      </div>
    </div>
  );
}
