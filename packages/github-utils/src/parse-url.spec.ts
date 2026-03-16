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
});
