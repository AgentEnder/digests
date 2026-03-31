import rehypeRaw from 'rehype-raw';
import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { remarkPrettier } from './remark-prettier.js';

export async function renderMarkdown(md: string): Promise<string> {
  const { default: rehypeShiki } = await import('@shikijs/rehype');

  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkPrettier)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeShiki, {
      theme: 'github-dark',
      addLanguageClass: true,
    })
    .use(rehypeStringify);

  const file = await processor.process(md);
  return String(file);
}
