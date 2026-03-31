import type { Root, Code, Parent } from 'mdast';
import { format } from 'prettier';

const TS_LANGS = new Set(['ts', 'typescript', 'tsx']);

/**
 * Remark plugin that runs TypeScript code blocks through prettier.
 *
 * This formats long, single-line type signatures into readable multi-line
 * output before Shiki applies syntax highlighting.
 */
export function remarkPrettier() {
  return async function transformer(tree: Root): Promise<void> {
    const codeNodes: Code[] = [];

    // Walk the tree to collect code nodes (avoids unist-util-visit dependency)
    function walk(node: Root | Parent) {
      for (const child of node.children) {
        if (child.type === 'code') {
          const code = child as Code;
          if (code.lang && TS_LANGS.has(code.lang)) {
            codeNodes.push(code);
          }
        } else if ('children' in child) {
          walk(child as Parent);
        }
      }
    }

    walk(tree);

    await Promise.all(
      codeNodes.map(async (node) => {
        try {
          const formatted = await format(node.value, {
            parser: 'typescript',
            printWidth: 60,
            semi: true,
            singleQuote: true,
            trailingComma: 'all',
          });
          // prettier appends a trailing newline — strip it
          node.value = formatted.trimEnd();
        } catch {
          // If prettier can't parse it (e.g. partial type fragment), leave as-is
        }
      }),
    );
  };
}
