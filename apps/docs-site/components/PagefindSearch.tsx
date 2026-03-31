import { useCallback, useEffect, useRef, useState } from 'react';
import { navigate } from 'vike/client/router';
import { applyBaseUrl } from '../utils/base-url';

interface SearchResult {
  id: string;
  url: string;
  title: string;
  excerpt: string;
}

interface PagefindSearchResponse {
  results: Array<{
    id: string;
    data: () => Promise<{
      url: string;
      meta: { title?: string };
      excerpt: string;
    }>;
  }>;
}

interface PagefindModule {
  search: (query: string) => Promise<PagefindSearchResponse>;
  debouncedSearch: (
    query: string,
    options?: { debounceTimeoutMs?: number }
  ) => Promise<PagefindSearchResponse>;
}

declare global {
  interface Window {
    pagefind?: PagefindModule;
  }
}

export function PagefindSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [pagefindReady, setPagefindReady] = useState(false);
  const [pagefindError, setPagefindError] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadPagefind = async () => {
      try {
        const pagefindUrl = applyBaseUrl('/pagefind/pagefind.js');
        const pagefind = await import(/* @vite-ignore */ pagefindUrl);
        window.pagefind = pagefind as PagefindModule;
        setPagefindReady(true);
      } catch {
        console.debug('Pagefind not available - will work after build');
        setPagefindError(true);
      }
    };
    loadPagefind();
  }, []);

  const handleSearch = useCallback(
    async (searchQuery: string) => {
      setQuery(searchQuery);
      setSelectedIndex(0);

      if (!searchQuery.trim()) {
        setResults([]);
        setIsOpen(false);
        return;
      }

      if (!pagefindReady || !window.pagefind) {
        setIsOpen(true);
        return;
      }

      setIsLoading(true);
      setIsOpen(true);

      try {
        const response = await window.pagefind.debouncedSearch(searchQuery, {
          debounceTimeoutMs: 150,
        });

        if (!response?.results) {
          setResults([]);
          return;
        }

        const loadedResults = await Promise.all(
          response.results.slice(0, 8).map(async (result) => {
            const data = await result.data();
            return {
              id: result.id,
              url: data.url,
              title: data.meta?.title || 'Untitled',
              excerpt: data.excerpt,
            };
          })
        );

        setResults(loadedResults);
      } catch (error) {
        console.error('Search error:', error);
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    },
    [pagefindReady]
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      }
    };

    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        event.preventDefault();
        if (results[selectedIndex]) {
          navigateToResult(results[selectedIndex]);
        }
        break;
      case 'Escape':
        event.preventDefault();
        setIsOpen(false);
        inputRef.current?.blur();
        break;
    }
  };

  const navigateToResult = (result: SearchResult) => {
    setIsOpen(false);
    setQuery('');
    setResults([]);
    navigate(result.url);
  };

  useEffect(() => {
    if (resultsRef.current && results.length > 0) {
      const selectedElement = resultsRef.current.children[
        selectedIndex
      ] as HTMLElement;
      selectedElement?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex, results.length]);

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          onFocus={() => query && setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search docs..."
          className="w-56 pl-10 pr-16 py-2 rounded-lg text-sm bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 focus:outline-none transition-all"
        />
        <kbd className="absolute right-3 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-xs bg-gray-200 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-gray-500 pointer-events-none flex items-center gap-0.5">
          <span className="text-[10px]">{'\u2318'}</span>K
        </kbd>
      </div>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 z-50 w-96 max-h-96 overflow-y-auto bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-lg">
          {pagefindError ? (
            <div className="p-4 text-sm text-gray-500">
              Search unavailable. Try building the site first.
            </div>
          ) : isLoading ? (
            <div className="px-4 py-8 text-center text-gray-500 text-sm">
              Searching...
            </div>
          ) : results.length > 0 ? (
            <>
              <div className="px-4 py-2 text-xs text-gray-500 border-b border-gray-200 dark:border-gray-700">
                {results.length} result{results.length !== 1 ? 's' : ''}
              </div>
              <div ref={resultsRef}>
                {results.map((result, index) => (
                  <button
                    key={result.id}
                    onClick={() => navigateToResult(result)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={`w-full text-left px-4 py-3 border-b border-gray-100 dark:border-gray-700 last:border-0 transition-colors ${
                      index === selectedIndex
                        ? 'bg-blue-50 dark:bg-blue-900/30'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                    }`}
                  >
                    <div
                      className={`font-medium text-sm ${
                        index === selectedIndex
                          ? 'text-blue-600 dark:text-blue-400'
                          : 'text-gray-900 dark:text-gray-200'
                      }`}
                    >
                      {result.title}
                    </div>
                    <div
                      className="text-xs text-gray-500 mt-1 line-clamp-2"
                      dangerouslySetInnerHTML={{ __html: result.excerpt }}
                    />
                  </button>
                ))}
              </div>
              <div className="px-4 py-2 text-xs text-gray-400 border-t border-gray-200 dark:border-gray-700 flex items-center gap-4">
                <span><kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-[10px]">{'\u2191\u2193'}</kbd> navigate</span>
                <span><kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-[10px]">{'\u21B5'}</kbd> select</span>
                <span><kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-[10px]">esc</kbd> close</span>
              </div>
            </>
          ) : query ? (
            <div className="px-4 py-8 text-center text-gray-500 text-sm">
              No results for &quot;{query}&quot;
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
