import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
	loadConfig,
	loadConfigFromPath,
	findConfigFile,
	ConfigNotFoundError,
	ConfigValidationError,
	ConfigParseError
} from './config.js';

describe('Configuration Loader', () => {
	let testDir: string;

	beforeEach(() => {
		// Create a unique temp directory for each test
		testDir = join(tmpdir(), `svelte-registry-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		mkdirSync(testDir, { recursive: true });
	});

	afterEach(() => {
		// Clean up temp directory
		rmSync(testDir, { recursive: true, force: true });
	});

	describe('findConfigFile', () => {
		it('should find config file in current directory', () => {
			const configPath = join(testDir, 'components.json');
			writeFileSync(configPath, '{}');

			const result = findConfigFile(testDir);
			expect(result).toBe(configPath);
		});

		it('should find config file in parent directory', () => {
			const subDir = join(testDir, 'src', 'lib');
			mkdirSync(subDir, { recursive: true });

			const configPath = join(testDir, 'components.json');
			writeFileSync(configPath, '{}');

			const result = findConfigFile(subDir);
			expect(result).toBe(configPath);
		});

		it('should return null when config file is not found', () => {
			const result = findConfigFile(testDir);
			expect(result).toBeNull();
		});
	});

	describe('loadConfig', () => {
		it('should load and validate a valid config file', () => {
			const validConfig = {
				style: 'default',
				tailwind: {
					config: 'tailwind.config.ts',
					css: 'src/app.css'
				},
				aliases: {
					components: '$lib/components',
					utils: '$lib/utils'
				}
			};

			writeFileSync(join(testDir, 'components.json'), JSON.stringify(validConfig));

			const result = loadConfig(testDir);
			expect(result.style).toBe('default');
			expect(result.tailwind.config).toBe('tailwind.config.ts');
			expect(result.aliases.components).toBe('$lib/components');
		});

		it('should throw ConfigNotFoundError when config file is missing', () => {
			expect(() => loadConfig(testDir)).toThrow(ConfigNotFoundError);
		});

		it('should throw ConfigParseError for invalid JSON', () => {
			writeFileSync(join(testDir, 'components.json'), 'not valid json');

			expect(() => loadConfig(testDir)).toThrow(ConfigParseError);
		});

		it('should throw ConfigValidationError for invalid config structure', () => {
			// Missing required fields
			const invalidConfig = {
				style: 'default'
				// Missing tailwind and aliases
			};

			writeFileSync(join(testDir, 'components.json'), JSON.stringify(invalidConfig));

			expect(() => loadConfig(testDir)).toThrow(ConfigValidationError);
		});
	});

	describe('loadConfigFromPath', () => {
		it('should load config from specific path', () => {
			const validConfig = {
				style: 'new-york',
				tailwind: {
					config: 'tailwind.config.js',
					css: 'app.css',
					baseColor: 'slate'
				},
				aliases: {
					components: '@/components',
					utils: '@/lib/utils',
					hooks: '@/hooks'
				},
				registries: {
					default: 'https://registry.example.com'
				}
			};

			const configPath = join(testDir, 'components.json');
			writeFileSync(configPath, JSON.stringify(validConfig));

			const result = loadConfigFromPath(configPath);
			expect(result.style).toBe('new-york');
			expect(result.tailwind.baseColor).toBe('slate');
			expect(result.aliases.hooks).toBe('@/hooks');
			expect(result.registries?.default).toBe('https://registry.example.com');
		});

		it('should validate registry config with headers', () => {
			const configWithHeaders = {
				style: 'default',
				tailwind: {
					config: 'tailwind.config.ts',
					css: 'src/app.css'
				},
				aliases: {
					components: '$lib/components',
					utils: '$lib/utils'
				},
				registries: {
					private: {
						url: 'https://private.registry.com',
						headers: {
							Authorization: 'Bearer token123'
						}
					}
				}
			};

			const configPath = join(testDir, 'components.json');
			writeFileSync(configPath, JSON.stringify(configWithHeaders));

			const result = loadConfigFromPath(configPath);
			const privateRegistry = result.registries?.private;
			expect(privateRegistry).toBeDefined();
			expect(typeof privateRegistry).toBe('object');
			if (typeof privateRegistry === 'object' && privateRegistry !== null && 'url' in privateRegistry) {
				expect(privateRegistry.url).toBe('https://private.registry.com');
				expect(privateRegistry.headers?.Authorization).toBe('Bearer token123');
			}
		});
	});

	describe('Error classes', () => {
		it('ConfigNotFoundError should include search paths', () => {
			const error = new ConfigNotFoundError(['/path/one', '/path/two']);
			expect(error.name).toBe('ConfigNotFoundError');
			expect(error.searchPaths).toEqual(['/path/one', '/path/two']);
			expect(error.message).toContain('components.json not found');
		});

		it('ConfigValidationError should format issues', () => {
			const error = new ConfigValidationError([
				{ path: 'tailwind', message: 'Required' },
				{ path: 'aliases.components', message: 'Required' }
			]);
			expect(error.name).toBe('ConfigValidationError');
			expect(error.issues).toHaveLength(2);
			expect(error.message).toContain('tailwind: Required');
			expect(error.message).toContain('aliases.components: Required');
		});

		it('ConfigParseError should include file path', () => {
			const cause = new Error('Unexpected token');
			const error = new ConfigParseError('/path/to/config.json', cause);
			expect(error.name).toBe('ConfigParseError');
			expect(error.filePath).toBe('/path/to/config.json');
			expect(error.message).toContain('Unexpected token');
		});
	});
});
