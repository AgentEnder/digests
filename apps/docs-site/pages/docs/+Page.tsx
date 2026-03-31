import { useData } from 'vike-react/useData';
import { Link } from '../../components/Link';
import type { DocsData } from './+data';

export default function Page() {
  const { doc } = useData<DocsData>();

  if (!doc) {
    return (
      <div className="text-center py-20">
        <h1 className="text-4xl font-bold mb-4">Page Not Found</h1>
        <p className="text-gray-500 mb-8">
          The documentation page you&apos;re looking for doesn&apos;t exist.
        </p>
        <Link
          href="/"
          className="px-6 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
        >
          Back to Home
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/" className="hover:text-blue-600 dark:hover:text-blue-400">
          Home
        </Link>
        <span>/</span>
        <span className="text-gray-900 dark:text-gray-100">{doc.title}</span>
      </div>

      <div className="prose prose-gray dark:prose-invert max-w-none">
        {doc.renderedHtml ? (
          <div dangerouslySetInnerHTML={{ __html: doc.renderedHtml }} />
        ) : (
          <p>Document not found.</p>
        )}
      </div>

      <div className="mt-12 pt-8 border-t border-gray-200 dark:border-gray-800">
        <Link
          href="/"
          className="text-blue-600 dark:text-blue-400 hover:underline"
        >
          &larr; Back to Home
        </Link>
      </div>
    </div>
  );
}
