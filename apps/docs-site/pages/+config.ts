import vikeReact from 'vike-react/config';
import vikeTypedoc from 'vike-plugin-typedoc/config';
import type { Config } from 'vike/types';

export default {
  title: 'Digests',
  description: 'Dependency health analysis toolkit for software projects',
  prerender: true,
  passToClient: ['navigation'],
  extends: [vikeReact, vikeTypedoc],
  // typedoc config is in +typedoc.ts (contains non-serializable values)
} satisfies Config;
