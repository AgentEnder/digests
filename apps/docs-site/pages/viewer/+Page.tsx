import { applyBaseUrl } from '../../utils/base-url';

export default function Page() {
  const viewerUrl = applyBaseUrl('/viewer/app.html');

  return (
    <div className="-mx-8 -mt-8" style={{ height: 'calc(100vh - 4rem)' }}>
      <iframe
        src={viewerUrl}
        title="Dependency Digest Viewer"
        className="w-full h-full border-0"
        sandbox="allow-scripts allow-same-origin allow-popups"
      />
    </div>
  );
}
