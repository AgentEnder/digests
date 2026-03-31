import { usePageContext } from 'vike-react/usePageContext';
import { Link } from '../../components/Link';

export default function Page() {
  const { is404 } = usePageContext();

  if (is404) {
    return (
      <div className="text-center py-20">
        <h1 className="text-6xl font-bold mb-4">404</h1>
        <p className="text-xl text-gray-500 mb-8">Page not found.</p>
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
    <div className="text-center py-20">
      <h1 className="text-6xl font-bold mb-4">500</h1>
      <p className="text-xl text-gray-500 mb-8">Something went wrong.</p>
      <Link
        href="/"
        className="px-6 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
      >
        Back to Home
      </Link>
    </div>
  );
}
