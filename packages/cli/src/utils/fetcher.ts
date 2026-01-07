/**
 * Fetcher Utilities
 * Implements HTTP fetching with caching and GitHub support
 */

import { RegistrySchema, RegistryItemSchema, type Registry, type RegistryItem } from '../schema/registry.js';
import type { ZodError } from 'zod';

/**
 * Options for fetch operations
 */
export interface FetchOptions {
  url: string;
  headers?: Record<string, string>;
  cache?: boolean;
}

/**
 * Result of a fetch operation
 */
export interface FetchResult<T> {
  data: T;
  cached: boolean;
  etag?: string;
}

/**
 * Cache entry with ETag support
 */
interface CacheEntry<T> {
  data: T;
  etag?: string;
  timestamp: number;
}

/**
 * Error thrown when registry fetch fails
 */
export class RegistryFetchError extends Error {
  constructor(
    public url: string,
    public statusCode?: number,
    public override cause?: Error
  ) {
    super(`Failed to fetch registry from ${url}: ${statusCode || cause?.message}`);
    this.name = 'RegistryFetchError';
  }
}

/**
 * Error thrown when schema validation fails
 */
export class SchemaValidationError extends Error {
  constructor(
    public path: string[],
    public issues: ZodError['issues']
  ) {
    const formatted = issues.map(i => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    super(`Schema validation failed:\n${formatted}`);
    this.name = 'SchemaValidationError';
  }
}

/**
 * Error thrown when GitHub rate limit is exceeded
 */
export class GitHubRateLimitError extends Error {
  constructor(public resetTime: Date) {
    super(`GitHub API rate limit exceeded. Resets at ${resetTime.toISOString()}`);
    this.name = 'GitHubRateLimitError';
  }
}

// In-memory cache for registry data
const registryCache = new Map<string, CacheEntry<Registry>>();
const itemCache = new Map<string, CacheEntry<RegistryItem>>();
const rawCache = new Map<string, CacheEntry<string>>();

/**
 * Default retry configuration
 */
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_INITIAL_DELAY_MS = 1000;

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff delay
 */
function getBackoffDelay(attempt: number, initialDelay: number): number {
  return initialDelay * Math.pow(2, attempt);
}


/**
 * Perform a fetch with retry logic and exponential backoff
 * Handles network errors with retry logic (Requirement 7.3)
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  maxRetries: number = DEFAULT_MAX_RETRIES,
  initialDelay: number = DEFAULT_INITIAL_DELAY_MS
): Promise<Response> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      // Check for rate limiting (GitHub returns 403 with rate limit headers)
      if (response.status === 403) {
        const rateLimitRemaining = response.headers.get('x-ratelimit-remaining');
        const rateLimitReset = response.headers.get('x-ratelimit-reset');

        if (rateLimitRemaining === '0' && rateLimitReset) {
          const resetTime = new Date(parseInt(rateLimitReset, 10) * 1000);
          throw new GitHubRateLimitError(resetTime);
        }
      }

      // Return successful responses, 304 Not Modified, or client errors (4xx except 403 rate limit)
      if (response.ok || response.status === 304 || (response.status >= 400 && response.status < 500)) {
        return response;
      }

      // Server errors (5xx) should be retried
      lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
    } catch (error) {
      // Don't retry rate limit errors
      if (error instanceof GitHubRateLimitError) {
        throw error;
      }
      lastError = error instanceof Error ? error : new Error(String(error));
    }

    // Wait before retrying (except on last attempt)
    if (attempt < maxRetries - 1) {
      await sleep(getBackoffDelay(attempt, initialDelay));
    }
  }

  throw lastError || new Error('Fetch failed after retries');
}

/**
 * Fetch a registry.json file from a URL
 * Implements fetchRegistry function for registry.json (Requirement 5.1)
 * Add in-memory cache with ETag support (Requirement 7.5)
 */
export async function fetchRegistry(
  url: string,
  options: { headers?: Record<string, string>; cache?: boolean } = {}
): Promise<FetchResult<Registry>> {
  const { headers = {}, cache = true } = options;

  // Check cache first
  if (cache) {
    const cached = registryCache.get(url);
    if (cached) {
      // If we have an ETag, do a conditional request
      if (cached.etag) {
        const conditionalHeaders = {
          ...headers,
          'If-None-Match': cached.etag,
        };

        try {
          const response = await fetchWithRetry(url, { headers: conditionalHeaders });

          if (response.status === 304) {
            // Not modified, return cached data
            return { data: cached.data, cached: true, etag: cached.etag };
          }

          // Content changed, parse new data
          const json = await response.json();
          const result = RegistrySchema.safeParse(json);

          if (!result.success) {
            throw new SchemaValidationError([], result.error.issues);
          }

          const newEtag = response.headers.get('etag') || undefined;
          registryCache.set(url, { data: result.data, etag: newEtag, timestamp: Date.now() });

          return { data: result.data, cached: false, etag: newEtag };
        } catch (error) {
          // On network error, return cached data if available
          if (error instanceof RegistryFetchError || error instanceof TypeError) {
            return { data: cached.data, cached: true, etag: cached.etag };
          }
          throw error;
        }
      }

      // No ETag, return cached data directly
      return { data: cached.data, cached: true, etag: cached.etag };
    }
  }

  // No cache or cache miss, fetch fresh data
  try {
    const response = await fetchWithRetry(url, { headers });

    if (!response.ok) {
      throw new RegistryFetchError(url, response.status);
    }

    const json = await response.json();
    const result = RegistrySchema.safeParse(json);

    if (!result.success) {
      throw new SchemaValidationError([], result.error.issues);
    }

    const etag = response.headers.get('etag') || undefined;

    if (cache) {
      registryCache.set(url, { data: result.data, etag, timestamp: Date.now() });
    }

    return { data: result.data, cached: false, etag };
  } catch (error) {
    if (error instanceof RegistryFetchError || error instanceof SchemaValidationError || error instanceof GitHubRateLimitError) {
      throw error;
    }
    throw new RegistryFetchError(url, undefined, error instanceof Error ? error : new Error(String(error)));
  }
}


/**
 * Fetch an individual registry item from a URL
 * Implements fetchItem function for individual items (Requirement 5.3)
 * Add in-memory cache with ETag support (Requirement 7.5)
 */
export async function fetchItem(
  url: string,
  options: { headers?: Record<string, string>; cache?: boolean } = {}
): Promise<FetchResult<RegistryItem>> {
  const { headers = {}, cache = true } = options;

  // Check cache first
  if (cache) {
    const cached = itemCache.get(url);
    if (cached) {
      // If we have an ETag, do a conditional request
      if (cached.etag) {
        const conditionalHeaders = {
          ...headers,
          'If-None-Match': cached.etag,
        };

        try {
          const response = await fetchWithRetry(url, { headers: conditionalHeaders });

          if (response.status === 304) {
            // Not modified, return cached data
            return { data: cached.data, cached: true, etag: cached.etag };
          }

          // Content changed, parse new data
          const json = await response.json();
          const result = RegistryItemSchema.safeParse(json);

          if (!result.success) {
            throw new SchemaValidationError([], result.error.issues);
          }

          const newEtag = response.headers.get('etag') || undefined;
          itemCache.set(url, { data: result.data, etag: newEtag, timestamp: Date.now() });

          return { data: result.data, cached: false, etag: newEtag };
        } catch (error) {
          // On network error, return cached data if available
          if (error instanceof RegistryFetchError || error instanceof TypeError) {
            return { data: cached.data, cached: true, etag: cached.etag };
          }
          throw error;
        }
      }

      // No ETag, return cached data directly
      return { data: cached.data, cached: true, etag: cached.etag };
    }
  }

  // No cache or cache miss, fetch fresh data
  try {
    const response = await fetchWithRetry(url, { headers });

    if (!response.ok) {
      throw new RegistryFetchError(url, response.status);
    }

    const json = await response.json();
    const result = RegistryItemSchema.safeParse(json);

    if (!result.success) {
      throw new SchemaValidationError([], result.error.issues);
    }

    const etag = response.headers.get('etag') || undefined;

    if (cache) {
      itemCache.set(url, { data: result.data, etag, timestamp: Date.now() });
    }

    return { data: result.data, cached: false, etag };
  } catch (error) {
    if (error instanceof RegistryFetchError || error instanceof SchemaValidationError || error instanceof GitHubRateLimitError) {
      throw error;
    }
    throw new RegistryFetchError(url, undefined, error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Parse a GitHub reference in format github:owner/repo or github:owner/repo/path
 * Returns the owner, repo, and optional path
 */
export function parseGitHubReference(ref: string): { owner: string; repo: string; path?: string } | null {
  // Match github:owner/repo or github:owner/repo/path/to/file
  const match = ref.match(/^github:([^/]+)\/([^/]+)(?:\/(.+))?$/);
  if (!match) {
    return null;
  }

  return {
    owner: match[1],
    repo: match[2],
    path: match[3],
  };
}

/**
 * Build a GitHub raw content URL
 */
function buildGitHubRawUrl(owner: string, repo: string, path: string, branch: string = 'main'): string {
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
}

/**
 * Build a GitHub API URL for contents
 * Currently unused but kept for potential future use
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function buildGitHubApiUrl(owner: string, repo: string, path: string): string {
  return `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
}


/**
 * Fetch raw content from a GitHub repository
 * Implements fetchFromGitHub for raw content (Requirement 7.1)
 * Parse github:owner/repo format (Requirement 7.2)
 * Handle rate limiting with wait and retry (Requirement 7.3)
 * Support token authentication for private repos (Requirement 7.4)
 */
export async function fetchFromGitHub(
  owner: string,
  repo: string,
  path: string,
  options: { token?: string; cache?: boolean; branch?: string } = {}
): Promise<FetchResult<string>> {
  const { token, cache = true, branch = 'main' } = options;
  const url = buildGitHubRawUrl(owner, repo, path, branch);

  // Check cache first
  if (cache) {
    const cached = rawCache.get(url);
    if (cached) {
      if (cached.etag) {
        const headers: Record<string, string> = {
          'If-None-Match': cached.etag,
        };
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        try {
          const response = await fetchWithRetry(url, { headers });

          if (response.status === 304) {
            return { data: cached.data, cached: true, etag: cached.etag };
          }

          const content = await response.text();
          const newEtag = response.headers.get('etag') || undefined;
          rawCache.set(url, { data: content, etag: newEtag, timestamp: Date.now() });

          return { data: content, cached: false, etag: newEtag };
        } catch (error) {
          if (error instanceof RegistryFetchError || error instanceof TypeError) {
            return { data: cached.data, cached: true, etag: cached.etag };
          }
          throw error;
        }
      }

      return { data: cached.data, cached: true, etag: cached.etag };
    }
  }

  // Build headers
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await fetchWithRetry(url, { headers });

    if (!response.ok) {
      // For 404, try the API endpoint to get better error info
      if (response.status === 404) {
        throw new RegistryFetchError(url, 404, new Error('Repository or file not found'));
      }
      throw new RegistryFetchError(url, response.status);
    }

    const content = await response.text();
    const etag = response.headers.get('etag') || undefined;

    if (cache) {
      rawCache.set(url, { data: content, etag, timestamp: Date.now() });
    }

    return { data: content, cached: false, etag };
  } catch (error) {
    if (error instanceof RegistryFetchError || error instanceof GitHubRateLimitError) {
      throw error;
    }
    throw new RegistryFetchError(url, undefined, error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Fetch a registry from a GitHub repository
 * Convenience function that combines parseGitHubReference and fetchFromGitHub
 */
export async function fetchRegistryFromGitHub(
  ref: string,
  options: { token?: string; cache?: boolean; branch?: string } = {}
): Promise<FetchResult<Registry>> {
  const parsed = parseGitHubReference(ref);
  if (!parsed) {
    throw new Error(`Invalid GitHub reference: ${ref}. Expected format: github:owner/repo or github:owner/repo/path`);
  }

  const { owner, repo, path = 'registry.json' } = parsed;
  const result = await fetchFromGitHub(owner, repo, path, options);

  try {
    const json = JSON.parse(result.data);
    const validated = RegistrySchema.safeParse(json);

    if (!validated.success) {
      throw new SchemaValidationError([], validated.error.issues);
    }

    return { data: validated.data, cached: result.cached, etag: result.etag };
  } catch (error) {
    if (error instanceof SchemaValidationError) {
      throw error;
    }
    throw new SchemaValidationError([], [{ code: 'custom', message: 'Invalid JSON', path: [] }]);
  }
}

/**
 * Fetch a registry item from a GitHub repository
 * Convenience function that combines parseGitHubReference and fetchFromGitHub
 */
export async function fetchItemFromGitHub(
  ref: string,
  itemName: string,
  options: { token?: string; cache?: boolean; branch?: string } = {}
): Promise<FetchResult<RegistryItem>> {
  const parsed = parseGitHubReference(ref);
  if (!parsed) {
    throw new Error(`Invalid GitHub reference: ${ref}. Expected format: github:owner/repo or github:owner/repo/path`);
  }

  const { owner, repo, path = 'r' } = parsed;
  const itemPath = `${path}/${itemName}.json`;
  const result = await fetchFromGitHub(owner, repo, itemPath, options);

  try {
    const json = JSON.parse(result.data);
    const validated = RegistryItemSchema.safeParse(json);

    if (!validated.success) {
      throw new SchemaValidationError([], validated.error.issues);
    }

    return { data: validated.data, cached: result.cached, etag: result.etag };
  } catch (error) {
    if (error instanceof SchemaValidationError) {
      throw error;
    }
    throw new SchemaValidationError([], [{ code: 'custom', message: 'Invalid JSON', path: [] }]);
  }
}

/**
 * Clear all caches
 * Useful for testing or when fresh data is needed
 */
export function clearCache(): void {
  registryCache.clear();
  itemCache.clear();
  rawCache.clear();
}

/**
 * Clear cache for a specific URL
 */
export function clearCacheForUrl(url: string): void {
  registryCache.delete(url);
  itemCache.delete(url);
  rawCache.delete(url);
}

/**
 * Get cache statistics
 */
export function getCacheStats(): { registries: number; items: number; raw: number } {
  return {
    registries: registryCache.size,
    items: itemCache.size,
    raw: rawCache.size,
  };
}
