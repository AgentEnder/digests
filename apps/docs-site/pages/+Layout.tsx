import { useEffect, useState } from 'react';
import { usePageContext } from 'vike-react/usePageContext';
import { Link } from '../components/Link';
import { PagefindSearch } from '../components/PagefindSearch';
import type { NavigationItem } from '../vike-types';
import './tailwind.css';

export default function PageLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pageContext = usePageContext();
  const { urlPathname } = pageContext;
  const navigation =
    (pageContext.globalContext as { navigation?: NavigationItem[] })
      ?.navigation ?? [];

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const isLandingPage = urlPathname === '/' || urlPathname === '';

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (isMobile) {
      setSidebarOpen(false);
    }
  }, [urlPathname, isMobile]);

  const isActive = (href: string): boolean => {
    if (href === '/') return urlPathname === '/';
    return urlPathname === href;
  };

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      {/* Top Bar */}
      <header className="fixed top-0 left-0 right-0 h-16 z-50 bg-white/80 dark:bg-gray-900/80 backdrop-blur border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 h-full flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-xl font-bold">Digests</span>
          </Link>

          <nav className="hidden md:flex items-center gap-6">
            <NavLink href="/docs" currentPath={urlPathname}>
              Docs
            </NavLink>
            <NavLink href="/viewer" currentPath={urlPathname}>
              Viewer
            </NavLink>
          </nav>

          <div className="hidden md:block">
            <PagefindSearch />
          </div>

          {isMobile && (
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
              aria-label="Toggle menu"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </button>
          )}
        </div>
      </header>

      {/* Main layout */}
      <div className="pt-16">
        {isLandingPage ? (
          <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
        ) : (
          <div className="relative flex min-h-[calc(100vh-4rem)] max-w-7xl mx-auto">
            {/* Mobile overlay */}
            {isMobile && sidebarOpen && (
              <div
                className="fixed inset-0 bg-black/50 z-30 lg:hidden"
                onClick={() => setSidebarOpen(false)}
              />
            )}

            {/* Desktop sidebar */}
            <aside className="hidden lg:block shrink-0 w-64 border-r border-gray-200 dark:border-gray-800">
              <div className="sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto p-4">
                <NavContent
                  navigation={navigation}
                  activeCheck={isActive}
                />
              </div>
            </aside>

            {/* Mobile sidebar */}
            <aside
              className={`lg:hidden fixed left-0 top-16 bottom-0 w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 z-40 transition-transform duration-300 ${
                sidebarOpen ? 'translate-x-0' : '-translate-x-full'
              } overflow-y-auto`}
            >
              <div className="p-4">
                <NavContent
                  navigation={navigation}
                  activeCheck={isActive}
                  onItemClick={() => setSidebarOpen(false)}
                />
              </div>
            </aside>

            {/* Main content */}
            <main className="flex-1 min-w-0 px-8 py-8">
              <div className="max-w-4xl">{children}</div>
            </main>
          </div>
        )}
      </div>
    </div>
  );
}

function NavLink({
  href,
  currentPath,
  children,
}: {
  href: string;
  currentPath: string;
  children: string;
}) {
  const active =
    href === '/' ? currentPath === '/' : currentPath.startsWith(href);

  return (
    <Link
      href={href}
      className={`text-sm font-medium transition-colors ${
        active
          ? 'text-blue-600 dark:text-blue-400'
          : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
      }`}
    >
      {children}
    </Link>
  );
}

function NavContent({
  navigation,
  activeCheck,
  onItemClick,
}: {
  navigation: NavigationItem[];
  activeCheck: (href: string) => boolean;
  onItemClick?: () => void;
}) {
  return (
    <nav className="space-y-6">
      {navigation.map((section) => (
        <NavSection
          key={section.title}
          item={section}
          activeCheck={activeCheck}
          onItemClick={onItemClick}
        />
      ))}
    </nav>
  );
}

/** Check whether any descendant path is active (used to auto-expand groups) */
function hasActiveDescendant(
  item: NavigationItem,
  activeCheck: (href: string) => boolean,
): boolean {
  if (item.path && activeCheck(item.path)) return true;
  return item.children?.some((c) => hasActiveDescendant(c, activeCheck)) ?? false;
}

/** Top-level section: uppercase label + its children */
function NavSection({
  item,
  activeCheck,
  onItemClick,
}: {
  item: NavigationItem;
  activeCheck: (href: string) => boolean;
  onItemClick?: () => void;
}) {
  return (
    <div>
      <div className="px-3 mb-2">
        {item.path ? (
          <Link
            href={item.path}
            onClick={onItemClick}
            className="text-xs font-semibold text-gray-500 uppercase tracking-wider hover:text-gray-700 dark:hover:text-gray-300"
          >
            {item.title}
          </Link>
        ) : (
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            {item.title}
          </span>
        )}
      </div>

      {item.children && (
        <ul className="space-y-1 list-none">
          {item.children.map((child) => (
            <NavItem
              key={child.title}
              item={child}
              activeCheck={activeCheck}
              onItemClick={onItemClick}
              depth={0}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/** Recursive nav item: leaf links render directly, groups expand/collapse */
function NavItem({
  item,
  activeCheck,
  onItemClick,
  depth,
}: {
  item: NavigationItem;
  activeCheck: (href: string) => boolean;
  onItemClick?: () => void;
  depth: number;
}) {
  const hasChildren = item.children && item.children.length > 0;
  const isDescendantActive = hasChildren && hasActiveDescendant(item, activeCheck);
  const [expanded, setExpanded] = useState(isDescendantActive);

  // Auto-expand when a descendant becomes active (e.g. navigating into a group)
  useEffect(() => {
    if (isDescendantActive) setExpanded(true);
  }, [isDescendantActive]);

  // Leaf node — just a link
  if (!hasChildren) {
    if (!item.path) return null;
    return (
      <li>
        <Link
          href={item.path}
          onClick={onItemClick}
          className={`block px-3 py-2 rounded-lg text-sm transition-colors ${
            activeCheck(item.path)
              ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800'
          }`}
        >
          {item.title}
        </Link>
      </li>
    );
  }

  // Group node — expandable with optional link
  const paddingLeft = depth > 0 ? `${depth * 0.75}rem` : undefined;

  return (
    <li>
      <div className="flex items-center">
        {item.path ? (
          <Link
            href={item.path}
            onClick={onItemClick}
            className={`flex-1 block px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeCheck(item.path)
                ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                : 'text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
            style={paddingLeft ? { paddingLeft } : undefined}
          >
            {item.title}
          </Link>
        ) : (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex-1 text-left px-3 py-2 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            style={paddingLeft ? { paddingLeft } : undefined}
          >
            {item.title}
          </button>
        )}
        <button
          onClick={() => setExpanded(!expanded)}
          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400"
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          <svg
            className={`w-4 h-4 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </button>
      </div>

      {expanded && (
        <ul className="mt-1 space-y-1 list-none pl-3 border-l border-gray-200 dark:border-gray-700 ml-3">
          {item.children!.map((child) => (
            <NavItem
              key={child.title}
              item={child}
              activeCheck={activeCheck}
              onItemClick={onItemClick}
              depth={depth + 1}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
