/**
 * Dependency Resolver Tests
 * Tests for dependency resolution utilities
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  resolveTree,
  detectCircularDependencies,
  collectNpmDependencies,
  collectFiles,
  isUrlDependency,
  parseNamespacedReference,
  substituteUrlTemplate,
  CircularDependencyError,
  ComponentNotFoundError,
  type ResolvedItem,
  type DependencyTree,
} from './resolver.js';
import { clearCache } from './fetcher.js';
import type { Registry, RegistryItem } from '../schema/registry.js';
import type { ComponentConfig } from '../schema/config.js';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Sample registry items for testing
const buttonItem: RegistryItem = {
  name: 'button',
  type: 'registry:ui',
  dependencies: ['clsx', 'tailwind-merge'],
  files: [
    {
      path: 'ui/button.svelte',
      content: '<script>let { children } = $props();</script>',
      type: 'registry:ui',
      target: 'components/ui/button.svelte',
    },
  ],
};

const cardItem: RegistryItem = {
  name: 'card',
  type: 'registry:ui',
  registryDependencies: ['button'],
  dependencies: ['clsx'],
  files: [
    {
      path: 'ui/card.svelte',
      content: '<script>import Button from "./button.svelte";</script>',
      type: 'registry:ui',
      target: 'components/ui/card.svelte',
    },
  ],
};

const dialogItem: RegistryItem = {
  name: 'dialog',
  type: 'registry:ui',
  registryDependencies: ['button', 'card'],
  files: [
    {
      path: 'ui/dialog.svelte',
      content: '<script>import Button from "./button.svelte";</script>',
      type: 'registry:ui',
      target: 'components/ui/dialog.svelte',
    },
  ],
};

// Item with circular dependency for testing
const circularA: RegistryItem = {
  name: 'circular-a',
  type: 'registry:ui',
  registryDependencies: ['circular-b'],
  files: [{ path: 'a.svelte', content: '', type: 'registry:ui', target: 'a.svelte' }],
};

const circularB: RegistryItem = {
  name: 'circular-b',
  type: 'registry:ui',
  registryDependencies: ['circular-a'],
  files: [{ path: 'b.svelte', content: '', type: 'registry:ui', target: 'b.svelte' }],
};

// Sample registry
const testRegistry: Registry = {
  name: 'test-registry',
  items: [buttonItem, cardItem, dialogItem, circularA, circularB],
};

// Sample config
const testConfig: ComponentConfig = {
  style: 'default',
  tailwind: {
    config: 'tailwind.config.ts',
    css: 'src/app.css',
  },
  aliases: {
    components: '$lib/components',
    utils: '$lib/utils',
  },
  registries: {
    default: 'https://example.com/registry.json',
  },
};

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
});

describe('parseNamespacedReference', () => {
  it('should parse @namespace/component format', () => {
    const result = parseNamespacedReference('@acme/button');
    expect(result).toEqual({ namespace: 'acme', name: 'button' });
  });

  it('should parse @namespace/nested/component format', () => {
    const result = parseNamespacedReference('@acme/ui/button');
    expect(result).toEqual({ namespace: 'acme', name: 'ui/button' });
  });

  it('should return null for non-namespaced references', () => {
    expect(parseNamespacedReference('button')).toBeNull();
    expect(parseNamespacedReference('acme/button')).toBeNull();
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
});

describe('resolveTree', () => {
  beforeEach(() => {
    clearCache();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should resolve a component with no dependencies', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(testRegistry),
      headers: new Headers(),
    });

    const tree = await resolveTree('button', testConfig);

    expect(tree.root.name).toBe('button');
    expect(tree.root.item).toEqual(buttonItem);
    expect(tree.dependencies.size).toBe(0);
  });

  it('should resolve a component with one dependency', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(testRegistry),
      headers: new Headers(),
    });

    const tree = await resolveTree('card', testConfig);

    expect(tree.root.name).toBe('card');
    expect(tree.dependencies.size).toBe(1);
    expect(tree.dependencies.has('button')).toBe(true);
  });

  it('should resolve nested dependencies (Requirement 11.1)', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(testRegistry),
      headers: new Headers(),
    });

    const tree = await resolveTree('dialog', testConfig);

    expect(tree.root.name).toBe('dialog');
    expect(tree.dependencies.size).toBe(2);
    expect(tree.dependencies.has('button')).toBe(true);
    expect(tree.dependencies.has('card')).toBe(true);
  });

  it('should deduplicate dependencies (Requirement 11.3)', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(testRegistry),
      headers: new Headers(),
    });

    const tree = await resolveTree('dialog', testConfig);

    // button is a dependency of both dialog and card, but should only appear once
    const buttonCount = Array.from(tree.dependencies.keys()).filter(k => k === 'button').length;
    expect(buttonCount).toBe(1);
  });

  it('should detect circular dependencies (Requirement 11.2)', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(testRegistry),
      headers: new Headers(),
    });

    await expect(resolveTree('circular-a', testConfig)).rejects.toThrow(CircularDependencyError);
  });

  it('should include cycle path in error message', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(testRegistry),
      headers: new Headers(),
    });

    try {
      await resolveTree('circular-a', testConfig);
      expect.fail('Should have thrown CircularDependencyError');
    } catch (error) {
      expect(error).toBeInstanceOf(CircularDependencyError);
      const cycleError = error as CircularDependencyError;
      expect(cycleError.cycle).toContain('circular-a');
      expect(cycleError.cycle).toContain('circular-b');
    }
  });

  it('should throw ComponentNotFoundError for unknown component', async () => {
    // Mock registry fetch to return the test registry
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('registry.json')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(testRegistry),
          headers: new Headers(),
        });
      }
      // Return 404 for individual item fetch
      return Promise.resolve({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: new Headers(),
      });
    });

    await expect(resolveTree('nonexistent', testConfig)).rejects.toThrow(ComponentNotFoundError);
  });

  it('should resolve URL dependencies directly (Requirement 11.4)', async () => {
    const urlItem: RegistryItem = {
      name: 'external-button',
      type: 'registry:ui',
      files: [{ path: 'button.svelte', content: '', type: 'registry:ui', target: 'button.svelte' }],
    };

    const registryWithUrlDep: Registry = {
      name: 'test',
      items: [
        {
          name: 'wrapper',
          type: 'registry:ui',
          registryDependencies: ['https://external.com/r/external-button.json'],
          files: [{ path: 'wrapper.svelte', content: '', type: 'registry:ui', target: 'wrapper.svelte' }],
        },
      ],
    };

    mockFetch.mockImplementation((url: string) => {
      if (url.includes('external.com')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(urlItem),
          headers: new Headers(),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(registryWithUrlDep),
        headers: new Headers(),
      });
    });

    const tree = await resolveTree('wrapper', testConfig);

    expect(tree.root.name).toBe('wrapper');
    expect(tree.dependencies.has('https://external.com/r/external-button.json')).toBe(true);
  });
});

describe('detectCircularDependencies', () => {
  it('should return null for acyclic tree', () => {
    const tree: DependencyTree = {
      root: { name: 'dialog', item: dialogItem, source: 'https://example.com' },
      dependencies: new Map([
        ['button', { name: 'button', item: buttonItem, source: 'https://example.com' }],
        ['card', { name: 'card', item: cardItem, source: 'https://example.com' }],
      ]),
    };

    const cycle = detectCircularDependencies(tree);
    expect(cycle).toBeNull();
  });

  it('should detect cycle in tree', () => {
    const tree: DependencyTree = {
      root: { name: 'circular-a', item: circularA, source: 'https://example.com' },
      dependencies: new Map([
        ['circular-b', { name: 'circular-b', item: circularB, source: 'https://example.com' }],
      ]),
    };

    const cycle = detectCircularDependencies(tree);
    expect(cycle).not.toBeNull();
    expect(cycle).toContain('circular-a');
    expect(cycle).toContain('circular-b');
  });
});

describe('collectNpmDependencies', () => {
  it('should collect all npm dependencies from tree', () => {
    const tree: DependencyTree = {
      root: { name: 'card', item: cardItem, source: 'https://example.com' },
      dependencies: new Map([
        ['button', { name: 'button', item: buttonItem, source: 'https://example.com' }],
      ]),
    };

    const deps = collectNpmDependencies(tree);

    expect(deps).toContain('clsx');
    expect(deps).toContain('tailwind-merge');
  });

  it('should deduplicate npm dependencies', () => {
    const tree: DependencyTree = {
      root: { name: 'card', item: cardItem, source: 'https://example.com' },
      dependencies: new Map([
        ['button', { name: 'button', item: buttonItem, source: 'https://example.com' }],
      ]),
    };

    const deps = collectNpmDependencies(tree);

    // clsx appears in both card and button, should only appear once
    const clsxCount = deps.filter(d => d === 'clsx').length;
    expect(clsxCount).toBe(1);
  });
});

describe('collectFiles', () => {
  it('should collect files in correct order (dependencies first)', () => {
    const tree: DependencyTree = {
      root: { name: 'card', item: cardItem, source: 'https://example.com' },
      dependencies: new Map([
        ['button', { name: 'button', item: buttonItem, source: 'https://example.com' }],
      ]),
    };

    const files = collectFiles(tree);

    expect(files.length).toBe(2);
    expect(files[0].name).toBe('button'); // dependency first
    expect(files[1].name).toBe('card'); // root last
  });

  it('should include source information', () => {
    const tree: DependencyTree = {
      root: { name: 'button', item: buttonItem, source: 'https://example.com/registry.json' },
      dependencies: new Map(),
    };

    const files = collectFiles(tree);

    expect(files[0].source).toBe('https://example.com/registry.json');
  });
});
