import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { build, computeContentHash, BuildValidationError } from './build.js';

/**
 * Build Command Tests
 * Tests for the registry build command implementation
 */

describe('build command', () => {
	const testDir = join(process.cwd(), 'test-build-temp');
	const sourceDir = 'src/lib/registry';
	const outputDir = 'static/r';

	beforeEach(() => {
		// Create test directory structure
		mkdirSync(join(testDir, sourceDir), { recursive: true });
		mkdirSync(join(testDir, outputDir), { recursive: true });
	});

	afterEach(() => {
		// Clean up test directory
		if (existsSync(testDir)) {
			rmSync(testDir, { recursive: true, force: true });
		}
	});

	describe('computeContentHash', () => {
		it('should produce consistent hash for same content', () => {
			const content = 'test content';
			const hash1 = computeContentHash(content);
			const hash2 = computeContentHash(content);
			expect(hash1).toBe(hash2);
		});

		it('should produce different hash for different content', () => {
			const hash1 = computeContentHash('content 1');
			const hash2 = computeContentHash('content 2');
			expect(hash1).not.toBe(hash2);
		});

		it('should produce 64-character hex string', () => {
			const hash = computeContentHash('test');
			expect(hash).toMatch(/^[a-f0-9]{64}$/);
		});
	});

	describe('build', () => {
		it('should return empty result when no files exist', async () => {
			const result = await build({
				cwd: testDir,
				sourceDir,
				outputDir,
			});

			expect(result.itemCount).toBe(0);
			expect(result.items).toHaveLength(0);
		});

		it('should build a single .svelte component', async () => {
			// Create a simple Svelte component
			const componentContent = `<script lang="ts">
/**
 * @name button
 * @description A simple button component
 * @categories ui, form
 */
let { children }: { children: any } = $props();
</script>

<button>{@render children()}</button>
`;
			writeFileSync(join(testDir, sourceDir, 'Button.svelte'), componentContent);

			const result = await build({
				cwd: testDir,
				sourceDir,
				outputDir,
				name: 'test-registry',
			});

			expect(result.itemCount).toBe(1);
			expect(result.items).toContain('button');
			expect(result.errors).toHaveLength(0);

			// Check that files were created
			expect(existsSync(join(testDir, outputDir, 'registry.json'))).toBe(true);
			expect(existsSync(join(testDir, outputDir, 'button.json'))).toBe(true);
		});

		it('should build a .svelte.ts hook file', async () => {
			const hookContent = `/**
 * @name counter
 * @type registry:hook
 * @description A counter hook with universal reactivity
 */
export function createCounter(initial: number = 0) {
	let count = $state(initial);
	return {
		get count() { return count; },
		increment() { count++; },
		decrement() { count--; },
	};
}
`;
			writeFileSync(join(testDir, sourceDir, 'counter.svelte.ts'), hookContent);

			const result = await build({
				cwd: testDir,
				sourceDir,
				outputDir,
			});

			expect(result.itemCount).toBe(1);
			expect(result.items).toContain('counter');

			// Verify the item type
			const itemJson = readFileSync(join(testDir, outputDir, 'counter.json'), 'utf-8');
			const item = JSON.parse(itemJson);
			expect(item.type).toBe('registry:hook');
		});

		it('should build multi-file block components', async () => {
			// Create a card block with multiple files
			mkdirSync(join(testDir, sourceDir, 'card'), { recursive: true });

			writeFileSync(join(testDir, sourceDir, 'card', 'Card.svelte'), `<script>
/**
 * @name card
 * @type registry:block
 * @description A card component with header and content
 */
let { children }: { children: any } = $props();
</script>
<div class="card">{@render children()}</div>
`);

			writeFileSync(join(testDir, sourceDir, 'card', 'CardHeader.svelte'), `<script>
let { children }: { children: any } = $props();
</script>
<div class="card-header">{@render children()}</div>
`);

			writeFileSync(join(testDir, sourceDir, 'card', 'CardContent.svelte'), `<script>
let { children }: { children: any } = $props();
</script>
<div class="card-content">{@render children()}</div>
`);

			const result = await build({
				cwd: testDir,
				sourceDir,
				outputDir,
			});

			expect(result.itemCount).toBe(1);
			expect(result.items).toContain('card');

			// Verify the item has multiple files
			const itemJson = readFileSync(join(testDir, outputDir, 'card.json'), 'utf-8');
			const item = JSON.parse(itemJson);
			expect(item.type).toBe('registry:block');
			expect(item.files).toHaveLength(3);
		});

		it('should extract metadata from JSDoc comments', async () => {
			const componentContent = `<script lang="ts">
/**
 * @name custom-button
 * @title Custom Button
 * @description A customizable button component
 * @author Test Author
 * @dependencies clsx, tailwind-merge
 * @registryDependencies utils
 * @categories ui, form, interactive
 */
let { variant = 'default' }: { variant?: string } = $props();
</script>

<button class={variant}>Click me</button>
`;
			writeFileSync(join(testDir, sourceDir, 'CustomButton.svelte'), componentContent);

			const result = await build({
				cwd: testDir,
				sourceDir,
				outputDir,
			});

			expect(result.itemCount).toBe(1);

			const itemJson = readFileSync(join(testDir, outputDir, 'custom-button.json'), 'utf-8');
			const item = JSON.parse(itemJson);

			expect(item.name).toBe('custom-button');
			expect(item.title).toBe('Custom Button');
			expect(item.description).toBe('A customizable button component');
			expect(item.author).toBe('Test Author');
			expect(item.dependencies).toEqual(['clsx', 'tailwind-merge']);
			expect(item.registryDependencies).toEqual(['utils']);
			expect(item.categories).toEqual(['ui', 'form', 'interactive']);
		});

		it('should generate valid registry.json', async () => {
			writeFileSync(join(testDir, sourceDir, 'Button.svelte'), `<script>
let { children }: { children: any } = $props();
</script>
<button>{@render children()}</button>
`);

			const result = await build({
				cwd: testDir,
				sourceDir,
				outputDir,
				name: 'my-registry',
				homepage: 'https://example.com',
			});

			const registryJson = readFileSync(join(testDir, outputDir, 'registry.json'), 'utf-8');
			const registry = JSON.parse(registryJson);

			expect(registry.$schema).toBe('https://rum.dev/schema/registry.json');
			expect(registry.name).toBe('my-registry');
			expect(registry.homepage).toBe('https://example.com');
			expect(registry.items).toHaveLength(1);
		});

		it('should compute content hashes for change detection', async () => {
			writeFileSync(join(testDir, sourceDir, 'Button.svelte'), `<script>
let { children }: { children: any } = $props();
</script>
<button>{@render children()}</button>
`);

			const result = await build({
				cwd: testDir,
				sourceDir,
				outputDir,
			});

			expect(result.hashes.size).toBe(1);
			expect(result.hashes.has('button')).toBe(true);

			const hash = result.hashes.get('button');
			expect(hash).toMatch(/^[a-f0-9]{64}$/);
		});

		it('should support dry run mode', async () => {
			writeFileSync(join(testDir, sourceDir, 'Button.svelte'), `<script>
let { children }: { children: any } = $props();
</script>
<button>{@render children()}</button>
`);

			const result = await build({
				cwd: testDir,
				sourceDir,
				outputDir,
				dryRun: true,
			});

			expect(result.itemCount).toBe(1);
			expect(result.items).toContain('button');

			// Files should NOT be created in dry run mode
			expect(existsSync(join(testDir, outputDir, 'registry.json'))).toBe(false);
			expect(existsSync(join(testDir, outputDir, 'button.json'))).toBe(false);
		});

		it('should handle multiple components', async () => {
			writeFileSync(join(testDir, sourceDir, 'Button.svelte'), `<script>
let { children }: { children: any } = $props();
</script>
<button>{@render children()}</button>
`);

			writeFileSync(join(testDir, sourceDir, 'Input.svelte'), `<script>
let { value = '' }: { value?: string } = $props();
</script>
<input bind:value />
`);

			writeFileSync(join(testDir, sourceDir, 'utils.ts'), `export function cn(...classes: string[]) {
	return classes.filter(Boolean).join(' ');
}
`);

			const result = await build({
				cwd: testDir,
				sourceDir,
				outputDir,
			});

			expect(result.itemCount).toBe(3);
			expect(result.items).toContain('button');
			expect(result.items).toContain('input');
			expect(result.items).toContain('utils');
		});

		it('should skip hidden files and directories', async () => {
			writeFileSync(join(testDir, sourceDir, 'Button.svelte'), `<button>Click</button>`);
			writeFileSync(join(testDir, sourceDir, '.hidden.svelte'), `<div>Hidden</div>`);

			mkdirSync(join(testDir, sourceDir, '.hidden-dir'), { recursive: true });
			writeFileSync(join(testDir, sourceDir, '.hidden-dir', 'Component.svelte'), `<div>Hidden</div>`);

			const result = await build({
				cwd: testDir,
				sourceDir,
				outputDir,
			});

			expect(result.itemCount).toBe(1);
			expect(result.items).toContain('button');
			expect(result.items).not.toContain('.hidden');
		});
	});
});
