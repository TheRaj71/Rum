import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
	init,
	detectSvelteConfig,
	detectTailwindConfig,
	detectCssFile,
	createDefaultConfig,
	InvalidProjectError,
	TailwindNotFoundError,
} from './init.js';

/**
 * Tests for Init Command
 */

describe('detectSvelteConfig', () => {
	let testDir: string;

	beforeEach(() => {
		testDir = join(tmpdir(), `svelte-registry-test-${Date.now()}`);
		mkdirSync(testDir, { recursive: true });
	});

	afterEach(() => {
		rmSync(testDir, { recursive: true, force: true });
	});

	it('should detect svelte.config.js', () => {
		writeFileSync(join(testDir, 'svelte.config.js'), 'export default {};');
		const result = detectSvelteConfig(testDir);
		expect(result).toBe(join(testDir, 'svelte.config.js'));
	});

	it('should detect svelte.config.ts', () => {
		writeFileSync(join(testDir, 'svelte.config.ts'), 'export default {};');
		const result = detectSvelteConfig(testDir);
		expect(result).toBe(join(testDir, 'svelte.config.ts'));
	});

	it('should prefer svelte.config.js over svelte.config.ts', () => {
		writeFileSync(join(testDir, 'svelte.config.js'), 'export default {};');
		writeFileSync(join(testDir, 'svelte.config.ts'), 'export default {};');
		const result = detectSvelteConfig(testDir);
		expect(result).toBe(join(testDir, 'svelte.config.js'));
	});

	it('should return null when no config exists', () => {
		const result = detectSvelteConfig(testDir);
		expect(result).toBeNull();
	});
});

describe('detectTailwindConfig', () => {
	let testDir: string;

	beforeEach(() => {
		testDir = join(tmpdir(), `svelte-registry-test-${Date.now()}`);
		mkdirSync(testDir, { recursive: true });
	});

	afterEach(() => {
		rmSync(testDir, { recursive: true, force: true });
	});

	it('should detect tailwind.config.ts', () => {
		writeFileSync(join(testDir, 'tailwind.config.ts'), 'export default {};');
		const result = detectTailwindConfig(testDir);
		expect(result).toBe(join(testDir, 'tailwind.config.ts'));
	});

	it('should detect tailwind.config.js', () => {
		writeFileSync(join(testDir, 'tailwind.config.js'), 'export default {};');
		const result = detectTailwindConfig(testDir);
		expect(result).toBe(join(testDir, 'tailwind.config.js'));
	});

	it('should prefer tailwind.config.ts over tailwind.config.js', () => {
		writeFileSync(join(testDir, 'tailwind.config.ts'), 'export default {};');
		writeFileSync(join(testDir, 'tailwind.config.js'), 'export default {};');
		const result = detectTailwindConfig(testDir);
		expect(result).toBe(join(testDir, 'tailwind.config.ts'));
	});

	it('should return null when no config exists', () => {
		const result = detectTailwindConfig(testDir);
		expect(result).toBeNull();
	});
});

describe('detectCssFile', () => {
	let testDir: string;

	beforeEach(() => {
		testDir = join(tmpdir(), `svelte-registry-test-${Date.now()}`);
		mkdirSync(testDir, { recursive: true });
	});

	afterEach(() => {
		rmSync(testDir, { recursive: true, force: true });
	});

	it('should detect src/app.css', () => {
		mkdirSync(join(testDir, 'src'), { recursive: true });
		writeFileSync(join(testDir, 'src', 'app.css'), '');
		const result = detectCssFile(testDir);
		expect(result).toBe(join(testDir, 'src', 'app.css'));
	});

	it('should detect src/global.css', () => {
		mkdirSync(join(testDir, 'src'), { recursive: true });
		writeFileSync(join(testDir, 'src', 'global.css'), '');
		const result = detectCssFile(testDir);
		expect(result).toBe(join(testDir, 'src', 'global.css'));
	});

	it('should default to src/app.css when no CSS file exists', () => {
		const result = detectCssFile(testDir);
		expect(result).toBe(join(testDir, 'src', 'app.css'));
	});
});

describe('createDefaultConfig', () => {
	it('should create config with correct structure', () => {
		const config = createDefaultConfig({
			style: 'default',
			tailwindConfig: 'tailwind.config.ts',
			cssPath: 'src/app.css',
		});

		expect(config.$schema).toBe('https://rum.dev/schema/config.json');
		expect(config.style).toBe('default');
		expect(config.tailwind.config).toBe('tailwind.config.ts');
		expect(config.tailwind.css).toBe('src/app.css');
		expect(config.aliases.components).toBe('$lib/components');
		expect(config.aliases.utils).toBe('$lib/utils');
		expect(config.aliases.hooks).toBe('$lib/hooks');
		expect(config.aliases.lib).toBe('$lib');
	});
});

describe('init', () => {
	let testDir: string;

	beforeEach(() => {
		testDir = join(tmpdir(), `svelte-registry-test-${Date.now()}`);
		mkdirSync(testDir, { recursive: true });
	});

	afterEach(() => {
		rmSync(testDir, { recursive: true, force: true });
	});

	it('should throw InvalidProjectError when svelte.config.js is missing', async () => {
		writeFileSync(join(testDir, 'tailwind.config.ts'), 'export default {};');

		await expect(init({ cwd: testDir })).rejects.toThrow(InvalidProjectError);
	});

	it('should throw TailwindNotFoundError when tailwind config is missing', async () => {
		writeFileSync(join(testDir, 'svelte.config.js'), 'export default {};');

		await expect(init({ cwd: testDir })).rejects.toThrow(TailwindNotFoundError);
	});

	it('should create components.json with correct content', async () => {
		// Setup valid SvelteKit project
		writeFileSync(join(testDir, 'svelte.config.js'), 'export default {};');
		writeFileSync(join(testDir, 'tailwind.config.ts'), 'export default {};');
		mkdirSync(join(testDir, 'src'), { recursive: true });

		const result = await init({ cwd: testDir });

		expect(result.created.config).toBe(true);
		expect(existsSync(result.configPath)).toBe(true);

		const config = JSON.parse(readFileSync(result.configPath, 'utf-8'));
		expect(config.style).toBe('default');
		expect(config.tailwind.config).toBe('tailwind.config.ts');
		expect(config.aliases.components).toBe('$lib/components');
	});

	it('should create src/lib/utils.ts with cn() helper', async () => {
		writeFileSync(join(testDir, 'svelte.config.js'), 'export default {};');
		writeFileSync(join(testDir, 'tailwind.config.ts'), 'export default {};');
		mkdirSync(join(testDir, 'src'), { recursive: true });

		const result = await init({ cwd: testDir });

		expect(result.created.utils).toBe(true);
		expect(existsSync(result.utilsPath)).toBe(true);

		const utilsContent = readFileSync(result.utilsPath, 'utf-8');
		expect(utilsContent).toContain('export function cn');
		expect(utilsContent).toContain('twMerge');
		expect(utilsContent).toContain('clsx');
	});

	it('should inject CSS variables into app.css', async () => {
		writeFileSync(join(testDir, 'svelte.config.js'), 'export default {};');
		writeFileSync(join(testDir, 'tailwind.config.ts'), 'export default {};');
		mkdirSync(join(testDir, 'src'), { recursive: true });

		const result = await init({ cwd: testDir });

		expect(result.created.css).toBe(true);
		expect(existsSync(result.cssPath)).toBe(true);

		const cssContent = readFileSync(result.cssPath, 'utf-8');
		expect(cssContent).toContain('@layer base');
		expect(cssContent).toContain('--background');
		expect(cssContent).toContain('--foreground');
		expect(cssContent).toContain('.dark');
	});

	it('should not overwrite existing files without force flag', async () => {
		writeFileSync(join(testDir, 'svelte.config.js'), 'export default {};');
		writeFileSync(join(testDir, 'tailwind.config.ts'), 'export default {};');
		mkdirSync(join(testDir, 'src', 'lib'), { recursive: true });

		// Create existing files
		writeFileSync(join(testDir, 'components.json'), '{"existing": true}');
		writeFileSync(join(testDir, 'src', 'lib', 'utils.ts'), '// existing');

		const result = await init({ cwd: testDir });

		expect(result.created.config).toBe(false);
		expect(result.created.utils).toBe(false);

		// Verify files weren't overwritten
		const config = JSON.parse(readFileSync(join(testDir, 'components.json'), 'utf-8'));
		expect(config.existing).toBe(true);

		const utils = readFileSync(join(testDir, 'src', 'lib', 'utils.ts'), 'utf-8');
		expect(utils).toBe('// existing');
	});

	it('should overwrite existing files with force flag', async () => {
		writeFileSync(join(testDir, 'svelte.config.js'), 'export default {};');
		writeFileSync(join(testDir, 'tailwind.config.ts'), 'export default {};');
		mkdirSync(join(testDir, 'src', 'lib'), { recursive: true });

		// Create existing files
		writeFileSync(join(testDir, 'components.json'), '{"existing": true}');
		writeFileSync(join(testDir, 'src', 'lib', 'utils.ts'), '// existing');

		const result = await init({ cwd: testDir, force: true });

		expect(result.created.config).toBe(true);
		expect(result.created.utils).toBe(true);

		// Verify files were overwritten
		const config = JSON.parse(readFileSync(join(testDir, 'components.json'), 'utf-8'));
		expect(config.style).toBe('default');

		const utils = readFileSync(join(testDir, 'src', 'lib', 'utils.ts'), 'utf-8');
		expect(utils).toContain('export function cn');
	});

	it('should preserve existing CSS variables when merging', async () => {
		writeFileSync(join(testDir, 'svelte.config.js'), 'export default {};');
		writeFileSync(join(testDir, 'tailwind.config.ts'), 'export default {};');
		mkdirSync(join(testDir, 'src'), { recursive: true });

		// Create existing CSS with custom variable
		const existingCss = `@layer base {
  :root {
    --custom-var: red;
    --background: custom-value;
  }
}`;
		writeFileSync(join(testDir, 'src', 'app.css'), existingCss);

		await init({ cwd: testDir });

		const cssContent = readFileSync(join(testDir, 'src', 'app.css'), 'utf-8');
		// Should preserve existing custom variable
		expect(cssContent).toContain('--custom-var: red');
		// Should preserve existing --background value (not overwrite)
		expect(cssContent).toContain('--background: custom-value');
	});

	it('should use custom style when provided', async () => {
		writeFileSync(join(testDir, 'svelte.config.js'), 'export default {};');
		writeFileSync(join(testDir, 'tailwind.config.ts'), 'export default {};');
		mkdirSync(join(testDir, 'src'), { recursive: true });

		await init({ cwd: testDir, style: 'new-york' });

		const config = JSON.parse(readFileSync(join(testDir, 'components.json'), 'utf-8'));
		expect(config.style).toBe('new-york');
	});
});
