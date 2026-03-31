import type { OnBeforePrerenderStartAsync } from 'vike/types';
import { getDocsDir, scanDocs } from '../../server/utils/docs';

const onBeforePrerenderStart: OnBeforePrerenderStartAsync = async () => {
  const docsDir = await getDocsDir();
  const docs = await scanDocs(docsDir);
  return Object.keys(docs).map((urlPath) => urlPath);
};

export default onBeforePrerenderStart;
