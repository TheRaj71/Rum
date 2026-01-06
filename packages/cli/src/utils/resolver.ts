/**
 * Dependency Resolver Utilities
 * Implements dependency resolution for registry items
 */

import type { RegistryItem } from '../schema/registry.js';
import type { ComponentConfig } from '../schema/config.js';
import { fetchRegistry, fetchItem, RegistryFetchError } from './fetcher.js';
import {
  isUrlDependency,
  parseNamespacedReference,
  substituteUrlTemplate,
  buildItemUrl,
} from './url-parser.js';
import { suggestSimilarNames } from './similarity.js';

// Re-export URL parser functions for backwards compatibility
export { isUrlDependency, parseNamespacedReference, substituteUrlTemplate } from './url-parser.js';

/**
 * Represents a resolved registry item with its source
 */
export interface ResolvedItem {
  name: string;
  item: RegistryItem;
  source: string; // registry URL or direct URL
}

/**
 * Represents the complete dependency tree for a component
 */
export interface DependencyTree {
  root: ResolvedItem;
  dependencies: Map<string, ResolvedItem>;
}

/**
 * Error thrown when a circular dependency is detected
 * Requirement 11.2
 */
export class CircularDependencyError extends Error {
  constructor(public cycle: string[]) {
    super(`Circular dependency detected: ${cycle.join(' -> ')}`);
    this.name = 'CircularDependencyError';
  }
}

/**
 * Error thrown when a component is not found in any registry
 * Requirement 13.2: Suggest similar component names
 */
export class ComponentNotFoundError extends Error {
  constructor(
    public componentName: string,
    public searchedRegistries: string[],
    public availableComponents: string[] = [],
    public suggestions: string[] = []
  ) {
    let message = `Component "${componentName}" not found in any registry. Searched: ${searchedRegistries.join(', ')}`;
    
    // Add suggestions if available
    if (suggestions.length > 0) {
      message += `\n\nDid you mean one of these?\n  ${suggestions.join('\n  ')}`;
    }
    
    super(message);
    this.name = 'ComponentNotFoundError';
  }
}

/**
 * Get registry URL and headers from config
 */
function getRegistryConfig(
  registryKey: string,
  config: ComponentConfig
): { url: string; headers?: Record<string, string> } | null {
  const registries = config.registries;
  if (!registries || !registries[registryKey]) {
    return null;
  }

  const registryConfig = registries[registryKey];
  if (typeof registryConfig === 'string') {
    return { url: registryConfig };
  }
  return { url: registryConfig.url, headers: registryConfig.headers };
}

/**
 * Represents a component found in a registry
 */
export interface RegistryMatch {
  registryName: string;
  registryUrl: string;
  item: RegistryItem;
}

/**
 * Find a component in all configured registries
 * Returns all registries that contain the component
 * Requirement 5.9: Search registries in configured order
 * Requirement 6.2: Support prompting when component exists in multiple registries
 */
export async function findInAllRegistries(
  componentName: string,
  config: ComponentConfig
): Promise<RegistryMatch[]> {
  const matches: RegistryMatch[] = [];
  const registries = config.registries || {};

  // Check if it's a namespaced reference - only search that specific registry
  const namespaced = parseNamespacedReference(componentName);
  if (namespaced) {
    const registryConfig = getRegistryConfig(namespaced.namespace, config);
    if (registryConfig) {
      const resolved = await fetchFromRegistry(
        namespaced.name,
        registryConfig.url,
        registryConfig.headers
      );
      if (resolved) {
        matches.push({
          registryName: namespaced.namespace,
          registryUrl: registryConfig.url,
          item: resolved.item,
        });
      }
    }
    return matches;
  }

  // Search all registries
  for (const [registryName, registryConfig] of Object.entries(registries)) {
    const { url, headers } =
      typeof registryConfig === 'string'
        ? { url: registryConfig, headers: undefined }
        : { url: registryConfig.url, headers: registryConfig.headers };

    // Handle URL templates with {name} placeholder
    const resolvedUrl = substituteUrlTemplate(url, componentName);

    const resolved = await fetchFromRegistry(componentName, resolvedUrl, headers);
    if (resolved) {
      matches.push({
        registryName,
        registryUrl: resolvedUrl,
        item: resolved.item,
      });
    }
  }

  return matches;
}

/**
 * Fetch a component from a specific registry
 */
async function fetchFromRegistry(
  componentName: string,
  registryUrl: string,
  headers?: Record<string, string>
): Promise<ResolvedItem | null> {
  try {
    // First try to fetch the registry to find the item
    const registryResult = await fetchRegistry(registryUrl, { headers, cache: true });
    const item = registryResult.data.items.find((i) => i.name === componentName);

    if (item) {
      return { name: componentName, item, source: registryUrl };
    }

    // If not in registry.json, try fetching individual item JSON
    const itemUrl = buildItemUrl(registryUrl, componentName);
    const itemResult = await fetchItem(itemUrl, { headers, cache: true });
    return { name: componentName, item: itemResult.data, source: registryUrl };
  } catch (error) {
    // Component not found in this registry
    if (error instanceof RegistryFetchError) {
      return null;
    }
    throw error;
  }
}

/**
 * Resolve a component by name from configured registries
 * Searches registries in order (Requirement 6.2)
 * Provides suggestions for similar names (Requirement 13.2)
 */
async function resolveByName(
  componentName: string,
  config: ComponentConfig
): Promise<ResolvedItem> {
  const searchedRegistries: string[] = [];
  const availableComponents: string[] = [];
  const registries = config.registries || {};

  // Check if it's a namespaced reference
  const namespaced = parseNamespacedReference(componentName);
  if (namespaced) {
    // Look for the specific namespace registry
    const registryConfig = getRegistryConfig(namespaced.namespace, config);
    if (registryConfig) {
      searchedRegistries.push(registryConfig.url);
      
      // Try to get available components for suggestions
      try {
        const registryResult = await fetchRegistry(registryConfig.url, { 
          headers: registryConfig.headers, 
          cache: true 
        });
        availableComponents.push(...registryResult.data.items.map(i => i.name));
      } catch {
        // Ignore errors when fetching for suggestions
      }
      
      const resolved = await fetchFromRegistry(
        namespaced.name,
        registryConfig.url,
        registryConfig.headers
      );
      if (resolved) {
        return resolved;
      }
    }
    
    const suggestions = suggestSimilarNames(namespaced.name, availableComponents);
    throw new ComponentNotFoundError(componentName, searchedRegistries, availableComponents, suggestions);
  }

  // Search all registries in order
  for (const [, registryConfig] of Object.entries(registries)) {
    const { url, headers } =
      typeof registryConfig === 'string'
        ? { url: registryConfig, headers: undefined }
        : { url: registryConfig.url, headers: registryConfig.headers };

    // Handle URL templates with {name} placeholder
    const resolvedUrl = substituteUrlTemplate(url, componentName);
    searchedRegistries.push(resolvedUrl);

    // Try to get available components for suggestions
    try {
      const registryResult = await fetchRegistry(resolvedUrl, { headers, cache: true });
      for (const item of registryResult.data.items) {
        if (!availableComponents.includes(item.name)) {
          availableComponents.push(item.name);
        }
      }
    } catch {
      // Ignore errors when fetching for suggestions
    }

    const resolved = await fetchFromRegistry(componentName, resolvedUrl, headers);
    if (resolved) {
      return resolved;
    }
  }

  const suggestions = suggestSimilarNames(componentName, availableComponents);
  throw new ComponentNotFoundError(componentName, searchedRegistries, availableComponents, suggestions);
}

/**
 * Resolve a component from a direct URL
 * Requirement 11.4
 */
async function resolveByUrl(url: string): Promise<ResolvedItem> {
  const result = await fetchItem(url, { cache: true });
  return { name: result.data.name, item: result.data, source: url };
}

/**
 * Internal state for dependency resolution
 */
interface ResolutionState {
  resolved: Map<string, ResolvedItem>;
  visiting: Set<string>; // For cycle detection
  path: string[]; // Current resolution path for error reporting
}

/**
 * Recursively resolve dependencies for a component
 * Uses DFS with cycle detection (Requirement 11.2)
 */
async function resolveDependencies(
  componentName: string,
  config: ComponentConfig,
  state: ResolutionState
): Promise<void> {
  // Check for circular dependency
  if (state.visiting.has(componentName)) {
    const cycleStart = state.path.indexOf(componentName);
    const cycle = [...state.path.slice(cycleStart), componentName];
    throw new CircularDependencyError(cycle);
  }

  // Skip if already resolved (deduplication - Requirement 11.3)
  if (state.resolved.has(componentName)) {
    return;
  }

  // Mark as visiting
  state.visiting.add(componentName);
  state.path.push(componentName);

  try {
    // Resolve the component
    let resolved: ResolvedItem;
    if (isUrlDependency(componentName)) {
      resolved = await resolveByUrl(componentName);
    } else {
      resolved = await resolveByName(componentName, config);
    }

    // Recursively resolve registry dependencies
    const registryDeps = resolved.item.registryDependencies || [];
    for (const dep of registryDeps) {
      await resolveDependencies(dep, config, state);
    }

    // Add to resolved map (after dependencies to ensure proper order)
    state.resolved.set(componentName, resolved);
  } finally {
    // Remove from visiting set and path
    state.visiting.delete(componentName);
    state.path.pop();
  }
}

/**
 * Resolve the complete dependency tree for a component
 * Builds complete dependency graph before downloads (Requirement 11.1)
 * Deduplicates dependencies (Requirement 11.3)
 * Handles URL dependencies (Requirement 11.4)
 * Handles name dependencies (Requirement 11.5)
 */
export async function resolveTree(
  componentName: string,
  config: ComponentConfig
): Promise<DependencyTree> {
  const state: ResolutionState = {
    resolved: new Map(),
    visiting: new Set(),
    path: [],
  };

  // Resolve the root component and all its dependencies
  await resolveDependencies(componentName, config, state);

  // Get the root item
  const root = state.resolved.get(componentName);
  if (!root) {
    throw new Error(`Failed to resolve root component: ${componentName}`);
  }

  // Build dependencies map (excluding root)
  const dependencies = new Map<string, ResolvedItem>();
  for (const [name, item] of state.resolved) {
    if (name !== componentName) {
      dependencies.set(name, item);
    }
  }

  return { root, dependencies };
}

/**
 * Detect circular dependencies in a dependency tree
 * Returns the cycle path if found, null otherwise
 * Requirement 11.2
 */
export function detectCircularDependencies(tree: DependencyTree): string[] | null {
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const path: string[] = [];

  function dfs(name: string, item: ResolvedItem): string[] | null {
    if (visiting.has(name)) {
      const cycleStart = path.indexOf(name);
      return [...path.slice(cycleStart), name];
    }

    if (visited.has(name)) {
      return null;
    }

    visiting.add(name);
    path.push(name);

    const deps = item.item.registryDependencies || [];
    for (const dep of deps) {
      // Find the resolved item for this dependency
      const depItem = tree.dependencies.get(dep) || (tree.root.name === dep ? tree.root : null);
      if (depItem) {
        const cycle = dfs(dep, depItem);
        if (cycle) {
          return cycle;
        }
      }
    }

    visiting.delete(name);
    path.pop();
    visited.add(name);

    return null;
  }

  // Start DFS from root
  return dfs(tree.root.name, tree.root);
}

/**
 * Get all npm dependencies from a dependency tree
 * Collects all dependencies from all resolved items
 */
export function collectNpmDependencies(tree: DependencyTree): string[] {
  const deps = new Set<string>();

  // Add root dependencies
  for (const dep of tree.root.item.dependencies || []) {
    deps.add(dep);
  }

  // Add dependencies from all resolved items
  for (const [, resolved] of tree.dependencies) {
    for (const dep of resolved.item.dependencies || []) {
      deps.add(dep);
    }
  }

  return Array.from(deps);
}

/**
 * Get all files from a dependency tree in installation order
 * Returns files from dependencies first, then root
 */
export function collectFiles(
  tree: DependencyTree
): Array<{ name: string; files: ResolvedItem['item']['files']; source: string }> {
  const result: Array<{ name: string; files: ResolvedItem['item']['files']; source: string }> = [];

  // Add dependency files first
  for (const [name, resolved] of tree.dependencies) {
    result.push({ name, files: resolved.item.files, source: resolved.source });
  }

  // Add root files last
  result.push({
    name: tree.root.name,
    files: tree.root.item.files,
    source: tree.root.source,
  });

  return result;
}
