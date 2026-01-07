import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execSync } from 'node:child_process';
import pc from 'picocolors';
import type { ComponentConfig, CssVars } from '../schema/index.js';
import { mergeCssVariables } from '../utils/css.js';

/**
 * Init Command Implementation
 * Initializes a SvelteKit project for the component registry
 */

export interface InitOptions {
	/** Working directory */
	cwd: string;
	/** Style/theme to use */
	style?: string;
	/** Force overwrite existing files */
	force?: boolean;
	/** Verbose output */
	verbose?: boolean;
	/** Default registry URL */
	registry?: string;
	/** Auto-install Tailwind if not found */
	autoInstallTailwind?: boolean;
}

export interface InitResult {
	/** Path to generated components.json */
	configPath: string;
	/** Path to generated utils.ts */
	utilsPath: string;
	/** Path to modified app.css */
	cssPath: string;
	/** Whether files were created or updated */
	created: {
		config: boolean;
		utils: boolean;
		css: boolean;
	};
}

/**
 * Error thrown when project is not a valid SvelteKit project
 */
export class InvalidProjectError extends Error {
	public readonly missingFile: string;

	constructor(missingFile: string) {
		super(`Not a valid SvelteKit project: ${missingFile} not found`);
		this.name = 'InvalidProjectError';
		this.missingFile = missingFile;
	}
}

/**
 * Error thrown when Tailwind is not configured
 */
export class TailwindNotFoundError extends Error {
	constructor() {
		super('Tailwind CSS configuration not found. Please set up Tailwind CSS first.');
		this.name = 'TailwindNotFoundError';
	}
}

/** Default CSS variables for the registry */
const DEFAULT_CSS_VARS: CssVars = {
	theme: {
		'--background': '0 0% 100%',
		'--foreground': '240 10% 3.9%',
		'--card': '0 0% 100%',
		'--card-foreground': '240 10% 3.9%',
		'--popover': '0 0% 100%',
		'--popover-foreground': '240 10% 3.9%',
		'--primary': '240 5.9% 10%',
		'--primary-foreground': '0 0% 98%',
		'--secondary': '240 4.8% 95.9%',
		'--secondary-foreground': '240 5.9% 10%',
		'--muted': '240 4.8% 95.9%',
		'--muted-foreground': '240 3.8% 46.1%',
		'--accent': '240 4.8% 95.9%',
		'--accent-foreground': '240 5.9% 10%',
		'--destructive': '0 84.2% 60.2%',
		'--destructive-foreground': '0 0% 98%',
		'--border': '240 5.9% 90%',
		'--input': '240 5.9% 90%',
		'--ring': '240 5.9% 10%',
		'--radius': '0.5rem',
	},
	dark: {
		'--background': '240 10% 3.9%',
		'--foreground': '0 0% 98%',
		'--card': '240 10% 3.9%',
		'--card-foreground': '0 0% 98%',
		'--popover': '240 10% 3.9%',
		'--popover-foreground': '0 0% 98%',
		'--primary': '0 0% 98%',
		'--primary-foreground': '240 5.9% 10%',
		'--secondary': '240 3.7% 15.9%',
		'--secondary-foreground': '0 0% 98%',
		'--muted': '240 3.7% 15.9%',
		'--muted-foreground': '240 5% 64.9%',
		'--accent': '240 3.7% 15.9%',
		'--accent-foreground': '0 0% 98%',
		'--destructive': '0 62.8% 30.6%',
		'--destructive-foreground': '0 0% 98%',
		'--border': '240 3.7% 15.9%',
		'--input': '240 3.7% 15.9%',
		'--ring': '240 4.9% 83.9%',
	},
};

/** cn() helper function content */
const CN_HELPER_CONTENT = `import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Utility function to merge Tailwind CSS classes
 * Combines clsx for conditional classes with tailwind-merge for deduplication
 */
export function cn(...inputs: ClassValue[]): string {
	return twMerge(clsx(inputs));
}
`;

/**
 * Detects if svelte.config.js exists in the project
 */
export function detectSvelteConfig(cwd: string): string | null {
	const possiblePaths = [
		join(cwd, 'svelte.config.js'),
		join(cwd, 'svelte.config.ts'),
	];

	for (const configPath of possiblePaths) {
		if (existsSync(configPath)) {
			return configPath;
		}
	}

	return null;
}

/**
 * Detects if Tailwind config exists in the project
 * Supports both Tailwind v3 (config file) and v4 (CSS-based)
 * 
 * @returns Path to config file, 'tailwind-v4' for CSS-based config, or null if not found
 */
export function detectTailwindConfig(cwd: string): string | null {
	// Tailwind v3 config files
	const v3ConfigPaths = [
		join(cwd, 'tailwind.config.ts'),
		join(cwd, 'tailwind.config.js'),
		join(cwd, 'tailwind.config.cjs'),
		join(cwd, 'tailwind.config.mjs'),
	];

	for (const configPath of v3ConfigPaths) {
		if (existsSync(configPath)) {
			return configPath;
		}
	}

	// Tailwind v4 CSS-based config detection
	// Check common CSS files for @import 'tailwindcss' or @tailwind directives
	// sv add tailwindcss creates src/routes/layout.css for SvelteKit
	const v4CssPaths = [
		join(cwd, 'src', 'routes', 'layout.css'),  // sv add tailwindcss default
		join(cwd, 'src', 'app.css'),
		join(cwd, 'src', 'global.css'),
		join(cwd, 'src', 'styles', 'app.css'),
		join(cwd, 'src', 'styles', 'global.css'),
	];

	for (const cssPath of v4CssPaths) {
		if (existsSync(cssPath)) {
			try {
				const content = readFileSync(cssPath, 'utf-8');
				// Check for Tailwind v4 CSS import patterns
				if (
					content.includes("@import 'tailwindcss'") ||
					content.includes('@import "tailwindcss"') ||
					content.includes('@import "tailwindcss/') ||
					content.includes("@import 'tailwindcss/")
				) {
					return 'tailwind-v4';
				}
				// Also check for traditional @tailwind directives (v3 style in CSS)
				if (
					content.includes('@tailwind base') ||
					content.includes('@tailwind components') ||
					content.includes('@tailwind utilities')
				) {
					return 'tailwind-v4'; // Treat as v4-style (no config file needed)
				}
			} catch {
				// Ignore read errors
			}
		}
	}

	return null;
}

/**
 * Detects the CSS file path (app.css or global.css)
 */
export function detectCssFile(cwd: string): string {
	const possiblePaths = [
		join(cwd, 'src', 'routes', 'layout.css'),  // sv add tailwindcss default for v4
		join(cwd, 'src', 'app.css'),
		join(cwd, 'src', 'global.css'),
		join(cwd, 'src', 'styles', 'app.css'),
		join(cwd, 'src', 'styles', 'global.css'),
	];

	for (const cssPath of possiblePaths) {
		if (existsSync(cssPath)) {
			return cssPath;
		}
	}

	// Default to src/app.css if none found
	return join(cwd, 'src', 'app.css');
}

/**
 * Creates the default components.json configuration
 */
export function createDefaultConfig(options: {
style: string;
tailwindConfig: string;
cssPath: string;
registry?: string;
}): ComponentConfig {
const config: ComponentConfig = {
$schema: 'https://rum.dev/schema/config.json',
style: options.style,
tailwind: {
config: options.tailwindConfig,
css: options.cssPath,
baseColor: 'slate',
},
aliases: {
components: '$lib/components',
utils: '$lib/utils',
hooks: '$lib/hooks',
lib: '$lib',
},
registries: {
default: options.registry || 'https://rumcli.pages.dev/r',
},
};

return config;
}

/**
 * Ensures a directory exists, creating it if necessary
 */
function ensureDir(dirPath: string): void {
	if (!existsSync(dirPath)) {
		mkdirSync(dirPath, { recursive: true });
	}
}

/**
 * Detects the package manager used in the project
 */
export function detectPackageManager(cwd: string): 'npm' | 'yarn' | 'pnpm' | 'bun' {
	let currentDir = cwd;
	const root = '/';
	
	while (currentDir !== root) {
		if (existsSync(join(currentDir, 'bun.lockb')) || existsSync(join(currentDir, 'bun.lock'))) {
			return 'bun';
		}
		if (existsSync(join(currentDir, 'pnpm-lock.yaml'))) {
			return 'pnpm';
		}
		if (existsSync(join(currentDir, 'yarn.lock'))) {
			return 'yarn';
		}
		if (existsSync(join(currentDir, 'package-lock.json'))) {
			return 'npm';
		}
		
		const parentDir = dirname(currentDir);
		if (parentDir === currentDir) break;
		currentDir = parentDir;
	}
	
	return 'npm';
}

/**
 * Auto-installs Tailwind CSS using sv add tailwindcss
 * Uses the appropriate package manager runner (npx, bunx, pnpm dlx, yarn dlx)
 */
async function autoInstallTailwind(cwd: string, verbose: boolean): Promise<boolean> {
	const packageManager = detectPackageManager(cwd);
	
	// Determine the correct runner command
	let runnerCmd: string;
	switch (packageManager) {
		case 'bun':
			runnerCmd = 'bunx';
			break;
		case 'pnpm':
			runnerCmd = 'pnpm dlx';
			break;
		case 'yarn':
			runnerCmd = 'yarn dlx';
			break;
		default:
			runnerCmd = 'npx';
	}
	
	const command = `${runnerCmd} sv add tailwindcss --no-git-check --install ${packageManager}`;
	
	if (verbose) {
		console.log(pc.dim(`Installing Tailwind CSS with: ${command}`));
	}
	
	try {
		execSync(command, {
			cwd,
			stdio: verbose ? 'inherit' : 'pipe',
		});
		return true;
	} catch (error) {
		if (verbose) {
			console.error(pc.red(`Failed to auto-install Tailwind: ${error instanceof Error ? error.message : String(error)}`));
		}
		return false;
	}
}

/**
 * Initializes a SvelteKit project for the component registry
 *
 * @param options - Init options
 * @returns Init result with paths to created files
 * @throws InvalidProjectError if svelte.config.js is not found
 * @throws TailwindNotFoundError if Tailwind config is not found and auto-install fails
 */
export async function init(options: InitOptions): Promise<InitResult> {
	const { cwd, style = 'default', force = false, verbose = false, registry, autoInstallTailwind: autoInstall = true } = options;

	// Requirement 4.1, 4.7: Detect svelte.config.js presence
	const svelteConfigPath = detectSvelteConfig(cwd);
	if (!svelteConfigPath) {
		throw new InvalidProjectError('svelte.config.js');
	}

	if (verbose) {
		console.log(pc.dim(`Found Svelte config: ${svelteConfigPath}`));
	}

	// Requirement 4.2: Detect tailwind.config.ts/js presence (or Tailwind v4 CSS-based)
	let tailwindConfigPath = detectTailwindConfig(cwd);
	
	// Auto-install Tailwind if not found
	if (!tailwindConfigPath && autoInstall) {
		if (verbose) {
			console.log(pc.yellow(`Tailwind CSS not found, installing automatically...`));
		}
		
		const installed = await autoInstallTailwind(cwd, verbose);
		
		if (installed) {
			// Re-detect after installation
			tailwindConfigPath = detectTailwindConfig(cwd);
			if (verbose && tailwindConfigPath) {
				console.log(pc.green(`Tailwind CSS installed successfully!`));
			}
		}
	}
	
	if (!tailwindConfigPath) {
		throw new TailwindNotFoundError();
	}

	const isTailwindV4 = tailwindConfigPath === 'tailwind-v4';

	if (verbose) {
		if (isTailwindV4) {
			console.log(pc.dim(`Detected Tailwind v4 (CSS-based configuration)`));
		} else {
			console.log(pc.dim(`Found Tailwind config: ${tailwindConfigPath}`));
		}
	}

	// Get relative path for tailwind config (empty string for v4)
	const tailwindConfigRelative = isTailwindV4 
		? '' 
		: tailwindConfigPath.replace(cwd + '/', '').replace(cwd + '\\', '');

	// Detect CSS file
	const cssPath = detectCssFile(cwd);
	const cssPathRelative = cssPath.replace(cwd + '/', '').replace(cwd + '\\', '');

	if (verbose) {
		console.log(pc.dim(`CSS file: ${cssPathRelative}`));
	}

	// Track what was created
	const created = {
		config: false,
		utils: false,
		css: false,
	};

	// Requirement 4.3: Generate components.json configuration file
	const configPath = join(cwd, 'components.json');
	const configExists = existsSync(configPath);

	if (!configExists || force) {
		const config = createDefaultConfig({
			style,
			tailwindConfig: tailwindConfigRelative,
			cssPath: cssPathRelative,
			registry,
		});

		writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
		created.config = true;

		if (verbose) {
			console.log(pc.green(`Created components.json`));
		}
	} else if (verbose) {
		console.log(pc.yellow(`components.json already exists, skipping (use --force to overwrite)`));
	}

	// Requirement 4.5: Create src/lib/utils.ts with cn() helper
	const utilsPath = join(cwd, 'src', 'lib', 'utils.ts');
	const utilsExists = existsSync(utilsPath);

	if (!utilsExists || force) {
		ensureDir(dirname(utilsPath));
		writeFileSync(utilsPath, CN_HELPER_CONTENT, 'utf-8');
		created.utils = true;

		if (verbose) {
			console.log(pc.green(`Created src/lib/utils.ts`));
		}
	} else if (verbose) {
		console.log(pc.yellow(`src/lib/utils.ts already exists, skipping (use --force to overwrite)`));
	}

	// Requirement 4.6: Inject CSS variables into app.css
	ensureDir(dirname(cssPath));

	let existingCss = '';
	if (existsSync(cssPath)) {
		existingCss = readFileSync(cssPath, 'utf-8');
	}

	const mergeResult = mergeCssVariables({
		existingCss,
		cssVars: DEFAULT_CSS_VARS,
	});

	if (mergeResult.added.length > 0 || !existsSync(cssPath)) {
		writeFileSync(cssPath, mergeResult.content, 'utf-8');
		created.css = true;

		if (verbose) {
			console.log(pc.green(`Updated ${cssPathRelative} with CSS variables`));
			if (mergeResult.added.length > 0) {
				console.log(pc.dim(`  Added: ${mergeResult.added.length} variables`));
			}
			if (mergeResult.skipped.length > 0) {
				console.log(pc.dim(`  Skipped: ${mergeResult.skipped.length} existing variables`));
			}
		}
	} else if (verbose) {
		console.log(pc.yellow(`CSS variables already exist in ${cssPathRelative}`));
	}

	// Auto-install required dependencies (clsx, tailwind-merge)
	const packageManager = detectPackageManager(cwd);
	const packageJsonPath = join(cwd, 'package.json');
	
	if (existsSync(packageJsonPath)) {
		try {
			const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
			const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
			
			const missingDeps: string[] = [];
			if (!deps['clsx']) missingDeps.push('clsx');
			if (!deps['tailwind-merge']) missingDeps.push('tailwind-merge');
			
			if (missingDeps.length > 0) {
				if (verbose) {
					console.log(pc.dim(`Installing dependencies: ${missingDeps.join(', ')}`));
				}
				
				let installCmd: string;
				switch (packageManager) {
					case 'bun':
						installCmd = `bun add ${missingDeps.join(' ')}`;
						break;
					case 'pnpm':
						installCmd = `pnpm add ${missingDeps.join(' ')}`;
						break;
					case 'yarn':
						installCmd = `yarn add ${missingDeps.join(' ')}`;
						break;
					default:
						installCmd = `npm install ${missingDeps.join(' ')}`;
				}
				
				try {
					execSync(installCmd, {
						cwd,
						stdio: verbose ? 'inherit' : 'pipe',
					});
				} catch {
					// Don't fail if deps install fails, just warn
					if (verbose) {
						console.log(pc.yellow(`Warning: Failed to install dependencies. Run manually: ${installCmd}`));
					}
				}
			}
		} catch {
			// Ignore package.json read errors
		}
	}

	return {
		configPath,
		utilsPath,
		cssPath,
		created,
	};
}

/**
 * Prints a summary of the init operation
 */
export function printInitSummary(result: InitResult, cwd: string): void {
const packageManager = detectPackageManager(cwd);

// Determine the correct add command based on package manager
let addCommand: string;
switch (packageManager) {
case 'bun':
addCommand = 'bun add';
break;
case 'pnpm':
addCommand = 'pnpm add';
break;
case 'yarn':
addCommand = 'yarn add';
break;
default:
addCommand = 'npm install';
}

// Determine the correct runner command for the registry CLI
let runnerCommand: string;
switch (packageManager) {
case 'bun':
runnerCommand = 'bunx';
break;
case 'pnpm':
runnerCommand = 'pnpm dlx';
break;
case 'yarn':
runnerCommand = 'yarn dlx';
break;
default:
runnerCommand = 'npx';
}

console.log();
console.log(pc.green('✓ Project initialized successfully!'));
console.log();

if (result.created.config) {
console.log(`  ${pc.cyan('components.json')} - Configuration file created`);
}
if (result.created.utils) {
console.log(`  ${pc.cyan('src/lib/utils.ts')} - cn() helper created`);
}
if (result.created.css) {
console.log(`  ${pc.cyan('app.css')} - CSS variables injected`);
}

console.log();
console.log(pc.dim('Next steps:'));
console.log(pc.dim('  1. Install required dependencies:'));
console.log(pc.dim(`     ${addCommand} clsx tailwind-merge`));
console.log(pc.dim('  2. Add components from registry:'));
console.log(pc.dim(`     ${runnerCommand} rumm add button`));
console.log(pc.dim('  3. Or add from custom URL:'));
console.log(pc.dim(`     ${runnerCommand} rumm add https://example.com/r/button.json`));
console.log();
}
