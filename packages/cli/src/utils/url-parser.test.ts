/**
 * URL Parser Tests
 * Tests for URL parsing utilities
 */

import { describe, it, expect } from 'vitest';
import {
  parseNamespacedReference,
  isNamespacedReference,
  substituteUrlTemplate,
  hasNamePlaceholder,
  isUrlDependency,
  buildItemUrl,
  parseGitHubRepoReference,
  isGitHubRepoReference,
  normalizeRegistryUrl,
} from './url-parser.js';

describe('parseNamespacedReference', () => {
  it('should parse @namespace/component format', () => {
    const result = parseNamespacedReference('@acme/button');
    expect(result).toEqual({ namespace: 'acme', name: 'button' });
  });

  it('should parse @namespace/nested/component format', () => {
    const result = parseNamespacedReference('@acme/ui/button');
    expect(result).toEqual({ namespace: 'acme', name: 'ui/button' });
  });

  it('should parse @namespace/deeply/nested/component format', () => {
    const result = parseNamespacedReference('@org/components/ui/forms/input');
    expect(result).toEqual({ namespace: 'org', name: 'components/ui/forms/input' });
  });

  it('should return null for non-namespaced references', () => {
    expect(parseNamespacedReference('button')).toBeNull();
  });

  it('should return null for references without @ prefix', () => {
    expect(parseNamespacedReference('acme/button')).toBeNull();
  });

  it('should return null for empty string', () => {
    expect(parseNamespacedReference('')).toBeNull();
  });

  it('should return null for @ only', () => {
    expect(parseNamespacedReference('@')).toBeNull();
  });

  it('should return null for @namespace without component', () => {
    expect(parseNamespacedReference('@acme')).toBeNull();
    expect(parseNamespacedReference('@acme/')).toBeNull();
  });
});

describe('isNamespacedReference', () => {
  it('should return true for valid namespaced references', () => {
    expect(isNamespacedReference('@acme/button')).toBe(true);
    expect(isNamespacedReference('@org/ui/card')).toBe(true);
  });

  it('should return false for non-namespaced references', () => {
    expect(isNamespacedReference('button')).toBe(false);
    expect(isNamespacedReference('acme/button')).toBe(false);
    expect(isNamespacedReference('')).toBe(false);
  });
});

describe('substituteUrlTemplate', () => {
  it('should substitute {name} placeholder', () => {
    const result = substituteUrlTemplate('https://example.com/r/{name}.json', 'button');
    expect(result).toBe('https://example.com/r/button.json');
  });

  it('should substitute multiple {name} placeholders', () => {
    const result = substituteUrlTemplate('https://{name}.example.com/{name}.json', 'button');
    expect(result).toBe('https://button.example.com/button.json');
  });

  it('should return unchanged URL if no placeholder', () => {
    const result = substituteUrlTemplate('https://example.com/registry.json', 'button');
    expect(result).toBe('https://example.com/registry.json');
  });

  it('should handle empty component name', () => {
    const result = substituteUrlTemplate('https://example.com/r/{name}.json', '');
    expect(result).toBe('https://example.com/r/.json');
  });

  it('should handle component names with special characters', () => {
    const result = substituteUrlTemplate('https://example.com/r/{name}.json', 'my-button');
    expect(result).toBe('https://example.com/r/my-button.json');
  });
});

describe('hasNamePlaceholder', () => {
  it('should return true for URLs with {name} placeholder', () => {
    expect(hasNamePlaceholder('https://example.com/r/{name}.json')).toBe(true);
    expect(hasNamePlaceholder('https://{name}.example.com')).toBe(true);
  });

  it('should return false for URLs without placeholder', () => {
    expect(hasNamePlaceholder('https://example.com/registry.json')).toBe(false);
    expect(hasNamePlaceholder('https://example.com')).toBe(false);
  });
});

describe('isUrlDependency', () => {
  it('should return true for http URLs', () => {
    expect(isUrlDependency('http://example.com/item.json')).toBe(true);
  });

  it('should return true for https URLs', () => {
    expect(isUrlDependency('https://example.com/item.json')).toBe(true);
  });

  it('should return false for component names', () => {
    expect(isUrlDependency('button')).toBe(false);
    expect(isUrlDependency('@acme/button')).toBe(false);
  });

  it('should return false for github: references', () => {
    expect(isUrlDependency('github:owner/repo')).toBe(false);
  });
});

describe('buildItemUrl', () => {
  it('should build URL from registry URL', () => {
    const result = buildItemUrl('https://example.com/registry.json', 'button');
    expect(result).toBe('https://example.com/r/button.json');
  });

  it('should handle registry URL without registry.json', () => {
    const result = buildItemUrl('https://example.com', 'button');
    expect(result).toBe('https://example.com/r/button.json');
  });

  it('should handle registry URL with trailing slash', () => {
    const result = buildItemUrl('https://example.com/', 'button');
    expect(result).toBe('https://example.com/r/button.json');
  });

  it('should handle nested component names', () => {
    const result = buildItemUrl('https://example.com', 'ui/button');
    expect(result).toBe('https://example.com/r/ui/button.json');
  });
});

describe('parseGitHubRepoReference', () => {
  it('should parse github:owner/repo format', () => {
    const result = parseGitHubRepoReference('github:shadcn/ui');
    expect(result).toEqual({ owner: 'shadcn', repo: 'ui' });
  });

  it('should return null for non-github references', () => {
    expect(parseGitHubRepoReference('https://github.com/shadcn/ui')).toBeNull();
    expect(parseGitHubRepoReference('shadcn/ui')).toBeNull();
    expect(parseGitHubRepoReference('button')).toBeNull();
  });

  it('should return null for invalid github: format', () => {
    expect(parseGitHubRepoReference('github:')).toBeNull();
    expect(parseGitHubRepoReference('github:owner')).toBeNull();
    expect(parseGitHubRepoReference('github:owner/')).toBeNull();
  });

  it('should not match nested paths', () => {
    // github:owner/repo/path should not match
    expect(parseGitHubRepoReference('github:owner/repo/path')).toBeNull();
  });
});

describe('isGitHubRepoReference', () => {
  it('should return true for github: references', () => {
    expect(isGitHubRepoReference('github:shadcn/ui')).toBe(true);
    expect(isGitHubRepoReference('github:owner/repo')).toBe(true);
  });

  it('should return false for non-github references', () => {
    expect(isGitHubRepoReference('https://github.com/shadcn/ui')).toBe(false);
    expect(isGitHubRepoReference('button')).toBe(false);
    expect(isGitHubRepoReference('@acme/button')).toBe(false);
  });
});

describe('normalizeRegistryUrl', () => {
  it('should add registry.json to base URL', () => {
    const result = normalizeRegistryUrl('https://example.com');
    expect(result).toBe('https://example.com/registry.json');
  });

  it('should handle URL with trailing slash', () => {
    const result = normalizeRegistryUrl('https://example.com/');
    expect(result).toBe('https://example.com/registry.json');
  });

  it('should not modify URL already ending with registry.json', () => {
    const result = normalizeRegistryUrl('https://example.com/registry.json');
    expect(result).toBe('https://example.com/registry.json');
  });

  it('should not modify URL ending with other .json file', () => {
    const result = normalizeRegistryUrl('https://example.com/custom.json');
    expect(result).toBe('https://example.com/custom.json');
  });

  it('should handle nested paths', () => {
    const result = normalizeRegistryUrl('https://example.com/v1/components');
    expect(result).toBe('https://example.com/v1/components/registry.json');
  });
});
