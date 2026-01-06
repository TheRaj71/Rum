/**
 * Fetcher Utilities Tests
 * Tests for HTTP fetching with caching and GitHub support
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  fetchRegistry,
  fetchItem,
  fetchFromGitHub,
  parseGitHubReference,
  clearCache,
  getCacheStats,
  RegistryFetchError,
  SchemaValidationError,
  GitHubRateLimitError,
} from './fetcher.js';
import type { Registry, RegistryItem } from '../schema/registry.js';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Sample valid registry data
const validRegistry: Registry = {
  name: 'test-registry',
  items: [
    {
      name: 'button',
      type: 'registry:ui',
      files: [
        {
          path: 'ui/button.svelte',
          content: '<script>let { children } = $props();</script>',
          type: 'registry:ui',
          target: 'components/ui/button.svelte',
        },
      ],
    },
  ],
};

// Sample valid registry item
const validItem: RegistryItem = {
  name: 'button',
  type: 'registry:ui',
  files: [
    {
      path: 'ui/button.svelte',
      content: '<script>let { children } = $props();</script>',
      type: 'registry:ui',
      target: 'components/ui/button.svelte',
    },
  ],
};

describe('parseGitHubReference', () => {
  it('should parse github:owner/repo format', () => {
    const result = parseGitHubReference('github:shadcn/ui');
    expect(result).toEqual({ owner: 'shadcn', repo: 'ui', path: undefined });
  });

  it('should parse github:owner/repo/path format', () => {
    const result = parseGitHubReference('github:shadcn/ui/registry.json');
    expect(result).toEqual({ owner: 'shadcn', repo: 'ui', path: 'registry.json' });
  });

  it('should parse github:owner/repo/nested/path format', () => {
    const result = parseGitHubReference('github:shadcn/ui/static/r/button.json');
    expect(result).toEqual({ owner: 'shadcn', repo: 'ui', path: 'static/r/button.json' });
  });

  it('should return null for invalid format', () => {
    expect(parseGitHubReference('https://github.com/shadcn/ui')).toBeNull();
    expect(parseGitHubReference('shadcn/ui')).toBeNull();
    expect(parseGitHubReference('github:')).toBeNull();
    expect(parseGitHubReference('github:owner')).toBeNull();
  });
});


describe('fetchRegistry', () => {
  beforeEach(() => {
    clearCache();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch and validate a registry', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(validRegistry),
      headers: new Headers({ etag: '"abc123"' }),
    });

    const result = await fetchRegistry('https://example.com/registry.json');

    expect(result.data).toEqual(validRegistry);
    expect(result.cached).toBe(false);
    expect(result.etag).toBe('"abc123"');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should return cached data on second call', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(validRegistry),
      headers: new Headers({ etag: '"abc123"' }),
    });

    // First call - fetches from network
    const result1 = await fetchRegistry('https://example.com/registry.json');
    expect(result1.cached).toBe(false);

    // Second call with 304 response - returns cached
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 304,
      headers: new Headers(),
    });

    const result2 = await fetchRegistry('https://example.com/registry.json');
    expect(result2.cached).toBe(true);
    expect(result2.data).toEqual(validRegistry);
  });

  it('should throw RegistryFetchError on network failure', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    await expect(fetchRegistry('https://example.com/registry.json', { cache: false }))
      .rejects.toThrow(RegistryFetchError);
  });

  it('should throw SchemaValidationError on invalid data', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ invalid: 'data' }),
      headers: new Headers(),
    });

    await expect(fetchRegistry('https://example.com/registry.json', { cache: false }))
      .rejects.toThrow(SchemaValidationError);
  });

  it('should throw RegistryFetchError on HTTP error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      headers: new Headers(),
    });

    await expect(fetchRegistry('https://example.com/registry.json', { cache: false }))
      .rejects.toThrow(RegistryFetchError);
  });

  it('should pass custom headers', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(validRegistry),
      headers: new Headers(),
    });

    await fetchRegistry('https://example.com/registry.json', {
      headers: { 'Authorization': 'Bearer token123' },
      cache: false,
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com/registry.json',
      expect.objectContaining({
        headers: expect.objectContaining({ 'Authorization': 'Bearer token123' }),
      })
    );
  });
});


describe('fetchItem', () => {
  beforeEach(() => {
    clearCache();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch and validate a registry item', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(validItem),
      headers: new Headers({ etag: '"item123"' }),
    });

    const result = await fetchItem('https://example.com/r/button.json');

    expect(result.data).toEqual(validItem);
    expect(result.cached).toBe(false);
    expect(result.etag).toBe('"item123"');
  });

  it('should return cached item on second call', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(validItem),
      headers: new Headers({ etag: '"item123"' }),
    });

    const result1 = await fetchItem('https://example.com/r/button.json');
    expect(result1.cached).toBe(false);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 304,
      headers: new Headers(),
    });

    const result2 = await fetchItem('https://example.com/r/button.json');
    expect(result2.cached).toBe(true);
    expect(result2.data).toEqual(validItem);
  });

  it('should throw SchemaValidationError on invalid item', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ name: 'test' }), // Missing required fields
      headers: new Headers(),
    });

    await expect(fetchItem('https://example.com/r/button.json', { cache: false }))
      .rejects.toThrow(SchemaValidationError);
  });
});

describe('fetchFromGitHub', () => {
  beforeEach(() => {
    clearCache();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch raw content from GitHub', async () => {
    const content = '<script>let { children } = $props();</script>';
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve(content),
      headers: new Headers({ etag: '"gh123"' }),
    });

    const result = await fetchFromGitHub('shadcn', 'ui', 'registry/button.svelte');

    expect(result.data).toBe(content);
    expect(result.cached).toBe(false);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://raw.githubusercontent.com/shadcn/ui/main/registry/button.svelte',
      expect.any(Object)
    );
  });

  it('should use custom branch', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve('content'),
      headers: new Headers(),
    });

    await fetchFromGitHub('shadcn', 'ui', 'file.txt', { branch: 'develop', cache: false });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://raw.githubusercontent.com/shadcn/ui/develop/file.txt',
      expect.any(Object)
    );
  });

  it('should include authorization header when token provided', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve('content'),
      headers: new Headers(),
    });

    await fetchFromGitHub('shadcn', 'ui', 'file.txt', { token: 'ghp_token123', cache: false });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ 'Authorization': 'Bearer ghp_token123' }),
      })
    );
  });

  it('should throw GitHubRateLimitError when rate limited', async () => {
    const resetTime = Math.floor(Date.now() / 1000) + 3600;
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      headers: new Headers({
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset': String(resetTime),
      }),
    });

    await expect(fetchFromGitHub('shadcn', 'ui', 'file.txt', { cache: false }))
      .rejects.toThrow(GitHubRateLimitError);
  });

  it('should throw RegistryFetchError on 404', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      headers: new Headers(),
    });

    await expect(fetchFromGitHub('shadcn', 'ui', 'nonexistent.txt', { cache: false }))
      .rejects.toThrow(RegistryFetchError);
  });
});

describe('cache management', () => {
  beforeEach(() => {
    clearCache();
    mockFetch.mockReset();
  });

  it('should track cache statistics', async () => {
    expect(getCacheStats()).toEqual({ registries: 0, items: 0, raw: 0 });

    // Mock for registry fetch
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(validRegistry),
      headers: new Headers(),
    });
    await fetchRegistry('https://example.com/registry.json');
    expect(getCacheStats().registries).toBe(1);

    // Mock for item fetch
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(validItem),
      headers: new Headers(),
    });
    await fetchItem('https://example.com/r/button.json');
    expect(getCacheStats().items).toBe(1);

    // Mock for GitHub fetch
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve('content'),
      headers: new Headers(),
    });
    await fetchFromGitHub('owner', 'repo', 'file.txt');
    expect(getCacheStats().raw).toBe(1);
  });

  it('should clear all caches', async () => {
    // Mock for registry fetch
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(validRegistry),
      headers: new Headers(),
    });
    await fetchRegistry('https://example.com/registry.json');

    // Mock for item fetch
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(validItem),
      headers: new Headers(),
    });
    await fetchItem('https://example.com/r/button.json');

    // Mock for GitHub fetch
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve('content'),
      headers: new Headers(),
    });
    await fetchFromGitHub('owner', 'repo', 'file.txt');

    clearCache();

    expect(getCacheStats()).toEqual({ registries: 0, items: 0, raw: 0 });
  });
});
