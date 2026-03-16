import { execSync } from 'child_process';

let cachedToken: string | undefined | null = null;

export async function getGitHubToken(
  providedToken?: string
): Promise<string | undefined> {
  if (providedToken) {
    return providedToken;
  }

  if (cachedToken !== null) {
    return cachedToken;
  }

  if (process.env['GH_TOKEN']) {
    cachedToken = process.env['GH_TOKEN'];
    return cachedToken;
  }

  if (process.env['GITHUB_TOKEN']) {
    cachedToken = process.env['GITHUB_TOKEN'];
    return cachedToken;
  }

  try {
    const token = execSync('gh auth token', {
      encoding: 'utf8',
      stdio: ['inherit', 'pipe', 'pipe'],
    }).trim();
    cachedToken = token;
    return token;
  } catch {
    cachedToken = undefined;
    return undefined;
  }
}
