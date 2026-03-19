# @digests/cache-utils

Filesystem caching utilities for the [digests](https://github.com/AgentEnder/digests) ecosystem. Provides a simple API for caching async function results to disk, avoiding redundant API calls across scans.

## Installation

```bash
npm install @digests/cache-utils
```

## Usage

### `withCache(key, fn): Promise<T>`

Cache the result of an async function. On the first call, `fn` is executed and the result is stored. Subsequent calls with the same key return the cached value.

```typescript
import { withCache } from '@digests/cache-utils';

const data = await withCache('npm:lodash:4.17.21', async () => {
  const res = await fetch('https://registry.npmjs.org/lodash/4.17.21');
  return res.json();
});
```

### `getCached(key): T | undefined`

Retrieve a cached value directly.

```typescript
import { getCached } from '@digests/cache-utils';

const cached = getCached<PackageInfo>('npm:lodash:4.17.21');
```

### `setCache(key, value): void`

Store a value in the cache manually.

```typescript
import { setCache } from '@digests/cache-utils';

setCache('npm:lodash:4.17.21', packageInfo);
```

### `disableCache(): void`

Globally disable caching for the current process. Used by the `--skip-cache` CLI flag in `dependency-digest`.

```typescript
import { disableCache } from '@digests/cache-utils';

disableCache(); // All subsequent withCache calls will execute fn directly
```

## License

MIT
