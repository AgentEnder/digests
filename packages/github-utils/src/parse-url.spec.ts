import { describe, it, expect } from 'vitest';
import { parseGitHubUrl } from './parse-url.js';

describe('parseGitHubUrl', () => {
  it('should parse owner/repo from GitHub repo URLs', () => {
    const result = parseGitHubUrl('https://github.com/facebook/react');
    expect(result).toEqual({ owner: 'facebook', repo: 'react' });
  });

  it('should handle .git suffix', () => {
    const result = parseGitHubUrl('https://github.com/facebook/react.git');
    expect(result).toEqual({ owner: 'facebook', repo: 'react' });
  });

  it('should parse git+https URLs (from npm registry)', () => {
    const result = parseGitHubUrl('git+https://github.com/facebook/react.git');
    expect(result).toEqual({ owner: 'facebook', repo: 'react' });
  });

  it('should parse SSH URLs', () => {
    const result = parseGitHubUrl('git@github.com:facebook/react.git');
    expect(result).toEqual({ owner: 'facebook', repo: 'react' });
  });

  it('should return null for non-GitHub URLs', () => {
    expect(parseGitHubUrl('https://gitlab.com/owner/repo')).toBeNull();
    expect(parseGitHubUrl('not-a-url')).toBeNull();
  });

  it('should parse PR number from pull request URLs', () => {
    const result = parseGitHubUrl('https://github.com/owner/repo/pull/123');
    expect(result).toEqual({ owner: 'owner', repo: 'repo', prNumber: 123 });
  });

  it('should parse issue number as prNumber from issue URLs', () => {
    const result = parseGitHubUrl('https://github.com/owner/repo/issues/456');
    expect(result).toEqual({ owner: 'owner', repo: 'repo', prNumber: 456 });
  });

  it('should not include prNumber for plain repo URLs', () => {
    const result = parseGitHubUrl('https://github.com/facebook/react');
    expect(result).toEqual({ owner: 'facebook', repo: 'react' });
    expect(result).not.toHaveProperty('prNumber');
  });
});
