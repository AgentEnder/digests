import { useData } from 'vike-react/useData';
import { Link } from '../../components/Link';
import type { ApiData } from './+data';
import { ApiExportPage } from './components/ApiExport';
import { ApiLanding } from './components/ApiLanding';
import { ApiPackage } from './components/ApiPackage';

export default function Page() {
  const data = useData<ApiData>();

  if (data.type === 'not-found') {
    return (
      <div className="text-center py-20">
        <h1 className="text-4xl font-bold text-gray-100 mb-4">
          API Reference Not Found
        </h1>
        <p className="text-gray-400 mb-8">
          The API documentation page you&apos;re looking for doesn&apos;t
          exist.
        </p>
        <Link
          href="/api"
          className="px-6 py-2 rounded-lg bg-blue-500/20 text-blue-400 border border-blue-500/50 hover:bg-blue-500/30"
        >
          Back to API Reference
        </Link>
      </div>
    );
  }

  switch (data.type) {
    case 'landing':
      return <ApiLanding groups={data.groups} />;
    case 'package':
      return (
        <ApiPackage
          packageSlug={data.packageSlug}
          isInternal={data.isInternal}
          readmeHtml={data.readmeHtml}
          exports={data.exports}
        />
      );
    case 'export':
      return <ApiExportPage mod={data.export} isInternal={data.isInternal} />;
  }
}
