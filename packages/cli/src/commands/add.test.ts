import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { add, detectPackageManager, type AddOptions } from './add.js';
import { clearCache } from '../utils/fetcher.js';

/**
 * Tests for the add command
 */

describe('add command', () => {
	let testDir: string;

	beforeEach(() => {
		// Create a unique test directory
		testDir = join(tmpdir(), `svelte-registry-add-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		mkdirSync(testDir, { recursive: true });
	});

	afterEach(() => {
		// Clean up test directory
		if (existsSync(testDir)) {
			rmSync(testDir, { recursive: true, force: true });
		}
		vi.restoreAllMocks();
		// Clear the fetcher cache between tests
		clearCache();
	});

	describe('detectPackageManager', () => {
		it('should detect pnpm from pnpm-lock.yaml', () => {
			writeFileSync(join(testDir, 'pnpm-lock.yaml'), '');
			expect(detectPackageManager(testDir)).toBe('pnpm');
		});

		it('should detect yarn from yarn.lock', () => {
			writeFileSync(join(testDir, 'yarn.lock'), '');
			expect(detectPackageManager(testDir)).toBe('yarn');
		});

		it('should detect bun from bun.lockb', () => {
			writeFileSync(join(testDir, 'bun.lockb'), '');
			expect(detectPackageManager(testDir)).toBe('bun');
		});

		it('should detect bun from bun.lock', () => {
			writeFileSync(join(testDir, 'bun.lock'), '');
			expect(detectPackageManager(testDir)).toBe('bun');
		});

		it('should default to npm when no lock file found', () => {
			expect(detectPackageManager(testDir)).toBe('npm');
		});

		it('should prefer bun over pnpm when both exist', () => {
			writeFileSync(join(testDir, 'bun.lockb'), '');
			writeFileSync(join(testDir, 'pnpm-lock.yaml'), '');
			expect(detectPackageManager(testDir)).toBe('bun');
		});
	});

	describe('add function', () => {
		beforeEach(() => {
			// Set up a minimal project structure
			mkdirSync(join(testDir, 'src', 'lib'), { recursive: true });
			
			// Create svelte.config.js
			writeFileSync(join(testDir, 'svelte.config.js'), 'export default {};');
			
			// Create tailwind.config.js
			writeFileSync(join(testDir, 'tailwind.config.js'), 'export default {};');
			
			// Create app.css
			writeFileSync(join(testDir, 'src', 'app.css'), '');
			
			// Create components.json
			const config = {
				$schema: 'https://rum.dev/schema/config.json',
				style: 'default',
				tailwind: {
					config: 'tailwind.config.js',
					css: 'src/app.css',
					baseColor: 'slate',
				},
				aliases: {
					components: '$lib/components',
					utils: '$lib/utils',
					hooks: '$lib/hooks',
					lib: '$lib',
				},
				registries: {
					default: 'https://example.com/registry.json',
				},
			};
			writeFileSync(join(testDir, 'components.json'), JSON.stringify(config, null, 2));
		});

		it('should throw error when not a SvelteKit project (no svelte.config)', async () => {
			// Remove components.json - auto-init will try but fail without svelte.config
			rmSync(join(testDir, 'components.json'));
			// Also remove svelte.config.js if it exists
			if (existsSync(join(testDir, 'svelte.config.js'))) {
				rmSync(join(testDir, 'svelte.config.js'));
			}

			await expect(
				add({
					cwd: testDir,
					components: ['button'],
					skipInstall: true,
				})
			).rejects.toThrow('Not a SvelteKit project');
		});

		it('should handle component not found error gracefully', async () => {
			// Mock fetch to return 404
			vi.spyOn(global, 'fetch').mockResolvedValue(
				new Response(null, { status: 404 })
			);

			const result = await add({
				cwd: testDir,
				components: ['nonexistent'],
				skipInstall: true,
			});

			expect(result.errors.length).toBe(1);
			expect(result.errors[0].component).toBe('nonexistent');
			expect(result.installed.length).toBe(0);
		});

		it('should skip files when user declines overwrite', async () => {
			// Create existing file
			mkdirSync(join(testDir, 'src', 'lib', 'components', 'ui'), { recursive: true });
			writeFileSync(
				join(testDir, 'src', 'lib', 'components', 'ui', 'button.svelte'),
				'<script>// existing</script>'
			);

			// Mock fetch to return a component
			const mockItem = {
				name: 'button',
				type: 'registry:ui',
				files: [
					{
						path: 'ui/button.svelte',
						content: '<script>// new</script>',
						type: 'registry:ui',
						target: '$lib/components/ui/button.svelte',
					},
				],
			};

			const mockRegistry = {
				name: 'test-registry',
				items: [mockItem],
			};

			vi.spyOn(global, 'fetch').mockResolvedValue(
				new Response(JSON.stringify(mockRegistry), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				})
			);

			// Mock prompt to decline overwrite
			const result = await add({
				cwd: testDir,
				components: ['button'],
				skipInstall: true,
				promptFn: async () => false, // Decline overwrite
			});

			// Component should be skipped
			expect(result.skipped.length).toBe(1);
			expect(result.installed.length).toBe(0);

			// Original file should be unchanged
			const content = readFileSync(
				join(testDir, 'src', 'lib', 'components', 'ui', 'button.svelte'),
				'utf-8'
			);
			expect(content).toBe('<script>// existing</script>');
		});

		it('should overwrite files when --overwrite flag is set', async () => {
			// Create existing file
			mkdirSync(join(testDir, 'src', 'lib', 'components', 'ui'), { recursive: true });
			writeFileSync(
				join(testDir, 'src', 'lib', 'components', 'ui', 'button.svelte'),
				'<script>// existing</script>'
			);

			// Mock fetch to return a component
			const mockItem = {
				name: 'button',
				type: 'registry:ui',
				files: [
					{
						path: 'ui/button.svelte',
						content: '<script>// new content</script>',
						type: 'registry:ui',
						target: '$lib/components/ui/button.svelte',
					},
				],
			};

			const mockRegistry = {
				name: 'test-registry',
				items: [mockItem],
			};

			vi.spyOn(global, 'fetch').mockImplementation(async () => {
				return new Response(JSON.stringify(mockRegistry), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				});
			});

			const result = await add({
				cwd: testDir,
				components: ['button'],
				overwrite: true,
				skipInstall: true,
			});

			expect(result.installed.length).toBe(1);
			expect(result.filesWritten.length).toBe(1);

			// File should be overwritten
			const content = readFileSync(
				join(testDir, 'src', 'lib', 'components', 'ui', 'button.svelte'),
				'utf-8'
			);
			expect(content).toBe('<script>// new content</script>');
		});

		it('should transform imports from registry aliases to project aliases', async () => {
			// Mock fetch to return a component with imports
			const mockItem = {
				name: 'button',
				type: 'registry:ui',
				files: [
					{
						path: 'ui/button.svelte',
						content: `<script>
import { cn } from "@/registry/utils";
import { Icon } from "@/registry/ui/icon";
</script>`,
						type: 'registry:ui',
						target: '$lib/components/ui/button.svelte',
					},
				],
			};

			const mockRegistry = {
				name: 'test-registry',
				items: [mockItem],
			};

			vi.spyOn(global, 'fetch').mockImplementation(async () => {
				return new Response(JSON.stringify(mockRegistry), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				});
			});

			const result = await add({
				cwd: testDir,
				components: ['button'],
				skipInstall: true,
			});

			expect(result.installed.length).toBe(1);

			// Check that imports were transformed
			const content = readFileSync(
				join(testDir, 'src', 'lib', 'components', 'ui', 'button.svelte'),
				'utf-8'
			);
			expect(content).toContain('$lib/components/utils');
			expect(content).toContain('$lib/components/ui/icon');
			expect(content).not.toContain('@/registry');
		});

		it('should collect npm dependencies from component tree', async () => {
			// Mock fetch to return a component with dependencies
			const mockItem = {
				name: 'button',
				type: 'registry:ui',
				dependencies: ['clsx', 'tailwind-merge'],
				files: [
					{
						path: 'ui/button.svelte',
						content: '<script>// button</script>',
						type: 'registry:ui',
						target: '$lib/components/ui/button.svelte',
					},
				],
			};

			const mockRegistry = {
				name: 'test-registry',
				items: [mockItem],
			};

			vi.spyOn(global, 'fetch').mockImplementation(async () => {
				return new Response(JSON.stringify(mockRegistry), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				});
			});

			const result = await add({
				cwd: testDir,
				components: ['button'],
				skipInstall: true, // Skip actual installation
			});

			expect(result.npmDependencies).toContain('clsx');
			expect(result.npmDependencies).toContain('tailwind-merge');
		});

		it('should merge CSS variables into app.css', async () => {
			// Mock fetch to return a component with CSS variables
			const mockItem = {
				name: 'button',
				type: 'registry:ui',
				cssVars: {
					theme: {
						'--button-radius': '0.5rem',
					},
					dark: {
						'--button-bg': '240 10% 3.9%',
					},
				},
				files: [
					{
						path: 'ui/button.svelte',
						content: '<script>// button</script>',
						type: 'registry:ui',
						target: '$lib/components/ui/button.svelte',
					},
				],
			};

			const mockRegistry = {
				name: 'test-registry',
				items: [mockItem],
			};

			vi.spyOn(global, 'fetch').mockImplementation(async () => {
				return new Response(JSON.stringify(mockRegistry), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				});
			});

			const result = await add({
				cwd: testDir,
				components: ['button'],
				skipInstall: true,
			});

			expect(result.installed.length).toBe(1);

			// Check that CSS variables were added
			const cssContent = readFileSync(join(testDir, 'src', 'app.css'), 'utf-8');
			expect(cssContent).toContain('--button-radius');
			expect(cssContent).toContain('--button-bg');
		});

		it('should handle multiple components', async () => {
			// Mock fetch to return multiple components
			const mockRegistry = {
				name: 'test-registry',
				items: [
					{
						name: 'button',
						type: 'registry:ui',
						files: [
							{
								path: 'ui/button.svelte',
								content: '<script>// button</script>',
								type: 'registry:ui',
								target: '$lib/components/ui/button.svelte',
							},
						],
					},
					{
						name: 'card',
						type: 'registry:ui',
						files: [
							{
								path: 'ui/card.svelte',
								content: '<script>// card</script>',
								type: 'registry:ui',
								target: '$lib/components/ui/card.svelte',
							},
						],
					},
				],
			};

			vi.spyOn(global, 'fetch').mockImplementation(async () => {
				return new Response(JSON.stringify(mockRegistry), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				});
			});

			const result = await add({
				cwd: testDir,
				components: ['button', 'card'],
				skipInstall: true,
			});

			expect(result.installed).toContain('button');
			expect(result.installed).toContain('card');
			expect(result.filesWritten.length).toBe(2);
		});
	});
});


	describe('multi-registry support', () => {
		let multiTestDir: string;

		beforeEach(() => {
			// Create a unique test directory for multi-registry tests
			multiTestDir = join(tmpdir(), `svelte-registry-multi-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
			mkdirSync(multiTestDir, { recursive: true });

			// Set up a minimal project structure
			mkdirSync(join(multiTestDir, 'src', 'lib'), { recursive: true });
			
			// Create svelte.config.js
			writeFileSync(join(multiTestDir, 'svelte.config.js'), 'export default {};');
			
			// Create tailwind.config.js
			writeFileSync(join(multiTestDir, 'tailwind.config.js'), 'export default {};');
			
			// Create app.css
			writeFileSync(join(multiTestDir, 'src', 'app.css'), '');
			
			// Create components.json with multiple registries
			const config = {
				$schema: 'https://rum.dev/schema/config.json',
				style: 'default',
				tailwind: {
					config: 'tailwind.config.js',
					css: 'src/app.css',
					baseColor: 'slate',
				},
				aliases: {
					components: '$lib/components',
					utils: '$lib/utils',
					hooks: '$lib/hooks',
					lib: '$lib',
				},
				registries: {
					default: 'https://registry1.example.com/registry.json',
					secondary: 'https://registry2.example.com/registry.json',
					private: {
						url: 'https://private.example.com/registry.json',
						headers: {
							'Authorization': 'Bearer secret-token',
						},
					},
				},
			};
			writeFileSync(join(multiTestDir, 'components.json'), JSON.stringify(config, null, 2));
		});

		afterEach(() => {
			// Clean up test directory
			if (existsSync(multiTestDir)) {
				rmSync(multiTestDir, { recursive: true, force: true });
			}
			vi.restoreAllMocks();
			clearCache();
		});

		it('should prompt when component exists in multiple registries', async () => {
			// Mock fetch to return the same component from multiple registries
			const mockItem = {
				name: 'button',
				type: 'registry:ui',
				files: [
					{
						path: 'ui/button.svelte',
						content: '<script>// button from registry1</script>',
						type: 'registry:ui',
						target: '$lib/components/ui/button.svelte',
					},
				],
			};

			const mockRegistry1 = {
				name: 'registry1',
				items: [mockItem],
			};

			const mockRegistry2 = {
				name: 'registry2',
				items: [{ ...mockItem, files: [{ ...mockItem.files[0], content: '<script>// button from registry2</script>' }] }],
			};

			let fetchCallCount = 0;
			vi.spyOn(global, 'fetch').mockImplementation(async (url) => {
				fetchCallCount++;
				const urlStr = url.toString();
				if (urlStr.includes('registry1')) {
					return new Response(JSON.stringify(mockRegistry1), {
						status: 200,
						headers: { 'Content-Type': 'application/json' },
					});
				} else if (urlStr.includes('registry2')) {
					return new Response(JSON.stringify(mockRegistry2), {
						status: 200,
						headers: { 'Content-Type': 'application/json' },
					});
				} else if (urlStr.includes('private')) {
					return new Response(null, { status: 404 });
				}
				return new Response(null, { status: 404 });
			});

			let selectCalled = false;
			const result = await add({
				cwd: multiTestDir,
				components: ['button'],
				skipInstall: true,
				selectFn: async (message, options) => {
					selectCalled = true;
					expect(options.length).toBe(2); // Should have 2 registries
					return 0; // Select first registry
				},
			});

			expect(selectCalled).toBe(true);
			expect(result.installed.length).toBe(1);
		});

		it('should use specified registry when --registry flag is set', async () => {
			const mockItem = {
				name: 'button',
				type: 'registry:ui',
				files: [
					{
						path: 'ui/button.svelte',
						content: '<script>// button from secondary</script>',
						type: 'registry:ui',
						target: '$lib/components/ui/button.svelte',
					},
				],
			};

			const mockRegistry = {
				name: 'secondary',
				items: [mockItem],
			};

			vi.spyOn(global, 'fetch').mockImplementation(async (url) => {
				const urlStr = url.toString();
				if (urlStr.includes('registry2')) {
					return new Response(JSON.stringify(mockRegistry), {
						status: 200,
						headers: { 'Content-Type': 'application/json' },
					});
				}
				return new Response(null, { status: 404 });
			});

			const result = await add({
				cwd: multiTestDir,
				components: ['button'],
				registry: 'secondary',
				skipInstall: true,
			});

			expect(result.installed.length).toBe(1);

			// Verify the content is from the secondary registry
			const content = readFileSync(
				join(multiTestDir, 'src', 'lib', 'components', 'ui', 'button.svelte'),
				'utf-8'
			);
			expect(content).toContain('button from secondary');
		});

		it('should pass headers for authenticated registries', async () => {
			const mockItem = {
				name: 'button',
				type: 'registry:ui',
				files: [
					{
						path: 'ui/button.svelte',
						content: '<script>// private button</script>',
						type: 'registry:ui',
						target: '$lib/components/ui/button.svelte',
					},
				],
			};

			const mockRegistry = {
				name: 'private',
				items: [mockItem],
			};

			let authHeaderReceived = false;
			vi.spyOn(global, 'fetch').mockImplementation(async (url, options) => {
				const urlStr = url.toString();
				if (urlStr.includes('private')) {
					// Check if Authorization header was passed
					const headers = options?.headers as Record<string, string> | undefined;
					if (headers?.['Authorization'] === 'Bearer secret-token') {
						authHeaderReceived = true;
					}
					return new Response(JSON.stringify(mockRegistry), {
						status: 200,
						headers: { 'Content-Type': 'application/json' },
					});
				}
				return new Response(null, { status: 404 });
			});

			const result = await add({
				cwd: multiTestDir,
				components: ['button'],
				registry: 'private',
				skipInstall: true,
			});

			expect(result.installed.length).toBe(1);
			expect(authHeaderReceived).toBe(true);
		});

		it('should not prompt when component exists in only one registry', async () => {
			const mockItem = {
				name: 'unique-button',
				type: 'registry:ui',
				files: [
					{
						path: 'ui/unique-button.svelte',
						content: '<script>// unique button</script>',
						type: 'registry:ui',
						target: '$lib/components/ui/unique-button.svelte',
					},
				],
			};

			const mockRegistry1 = {
				name: 'registry1',
				items: [mockItem],
			};

			vi.spyOn(global, 'fetch').mockImplementation(async (url) => {
				const urlStr = url.toString();
				if (urlStr.includes('registry1')) {
					return new Response(JSON.stringify(mockRegistry1), {
						status: 200,
						headers: { 'Content-Type': 'application/json' },
					});
				}
				return new Response(null, { status: 404 });
			});

			let selectCalled = false;
			const result = await add({
				cwd: multiTestDir,
				components: ['unique-button'],
				skipInstall: true,
				selectFn: async () => {
					selectCalled = true;
					return 0;
				},
			});

			expect(selectCalled).toBe(false);
			expect(result.installed.length).toBe(1);
		});
	});
