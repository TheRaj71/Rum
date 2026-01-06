import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { execSync } from 'node:child_process';
import pc from 'picocolors';
import type { ComponentConfig, CssVars } from '../schema/index.js';
import { loadConfig, ConfigNotFoundError } from '../utils/config.js';
import { init, detectSvelteConfig, detectTailwindConfig } from './init.js';
import {
	resolveTree,
	collectNpmDependencies,
	collectFiles,
	CircularDependencyError,
	ComponentNotFoundError,
	findInAllRegistries,
	type DependencyTree,
} from '../utils/resolver.js';
import { transformImports, type TransformOptions } from '../utils/transformer.js';
import { mergeCssVariables } from '../utils/css.js';

/**
 * Add Command Implementation
 * Adds components from the registry to the user's project
 */

export interface AddOptions {
	/** Working directory */
	cwd: string;
	/** Component names or URLs to add */
	components: string[];
	/** Overwrite existing files without prompting */
	overwrite?: boolean;
	/** Specific registry to use */
	registry?: string;
	/** Verbose output */
	verbose?: boolean;
	/** Skip npm dependency installation */
	skipInstall?: boolean;
	/** Prompt function for user interaction (for testing) */
	promptFn?: (message: string, defaultValue?: boolean) => Promise<boolean>;
	/** Select function for choosing from multiple options (for testing) */
	selectFn?: (message: string, options: string[]) => Promise<number>;
}

export interface AddResult {
	/** Components that were successfully installed */
	installed: string[];
	/** Components that were skipped */
	skipped: string[];
	/** Errors encountered during installation */
	errors: Array<{ component: string; error: string }>;
	/** Files that were written */
	filesWritten: string[];
	/** npm dependencies that were installed */
	npmDependencies: string[];
}

/**
 * File operation representing a file to be written
 */
interface FileOperation {
	/** Source component name */
	componentName: string;
	/** Target path in the project */
	targetPath: string;
	/** Transformed content */
	content: string;
	/** Whether the file already exists */
	exists: boolean;
}

/**
 * Detects the package manager used in the project
 * Checks current directory and parent directories for workspace setups
 */
export function detectPackageManager(cwd: string): 'npm' | 'yarn' | 'pnpm' | 'bun' {
	let currentDir = cwd;
	const root = '/';
	
	// Check current directory and parent directories
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
		
		// Move to parent directory
		const parentDir = dirname(currentDir);
		if (parentDir === currentDir) break; // Reached root
		currentDir = parentDir;
	}
	
	return 'npm';
}

/**
 * Gets the install command for the detected package manager
 */
function getInstallCommand(
	packageManager: 'npm' | 'yarn' | 'pnpm' | 'bun',
	dependencies: string[]
): string {
	const deps = dependencies.join(' ');
	switch (packageManager) {
		case 'bun':
			return `bun add ${deps}`;
		case 'pnpm':
			return `pnpm add ${deps}`;
		case 'yarn':
			return `yarn add ${deps}`;
		default:
			return `npm install ${deps}`;
	}
}

/**
 * Determines the file type for transformation based on file extension
 */
function getFileType(filePath: string): TransformOptions['fileType'] {
	const ext = extname(filePath).toLowerCase();
	if (ext === '.svelte') {
		return 'svelte';
	}
	if (ext === '.ts' || ext === '.mts' || ext === '.cts') {
		return 'typescript';
	}
	return 'javascript';
}

/**
 * Resolves the target path for a file based on config aliases
 */
function resolveTargetPath(
	target: string,
	config: ComponentConfig,
	cwd: string
): string {
	let resolvedPath = target;

	// Replace alias patterns with actual paths
	// Common patterns: $lib/components, $lib/utils, $lib/hooks
	const aliasMap: Record<string, string> = {
		'$lib/components': config.aliases.components,
		'$lib/utils': config.aliases.utils,
		'$lib/hooks': config.aliases.hooks || '$lib/hooks',
		'$lib': config.aliases.lib || '$lib',
	};

	// Sort by length (longest first) to match more specific aliases first
	const sortedAliases = Object.entries(aliasMap).sort(
		([a], [b]) => b.length - a.length
	);

	for (const [alias, replacement] of sortedAliases) {
		if (resolvedPath.startsWith(alias)) {
			resolvedPath = resolvedPath.replace(alias, replacement);
			break;
		}
	}

	// Convert $lib to actual path (src/lib)
	resolvedPath = resolvedPath.replace(/^\$lib/, 'src/lib');

	return join(cwd, resolvedPath);
}

/**
 * Transforms file content by replacing registry aliases with project aliases
 */
function transformFileContent(
	content: string,
	filePath: string,
	config: ComponentConfig
): string {
	const fileType = getFileType(filePath);

	// Transform @/registry imports to project aliases
	const result = transformImports({
		content,
		sourceAlias: '@/registry',
		targetAlias: config.aliases.components,
		fileType,
	});

	// Also transform $lib/registry if present
	const result2 = transformImports({
		content: result.content,
		sourceAlias: '$lib/registry',
		targetAlias: config.aliases.components,
		fileType,
	});

	return result2.content;
}

/**
 * Prepares file operations for a dependency tree
 */
function prepareFileOperations(
	tree: DependencyTree,
	config: ComponentConfig,
	cwd: string
): FileOperation[] {
	const operations: FileOperation[] = [];
	const allFiles = collectFiles(tree);

	for (const { name, files } of allFiles) {
		for (const file of files) {
			const targetPath = resolveTargetPath(file.target, config, cwd);
			const transformedContent = transformFileContent(file.content, file.path, config);

			operations.push({
				componentName: name,
				targetPath,
				content: transformedContent,
				exists: existsSync(targetPath),
			});
		}
	}

	return operations;
}

/**
 * Collects all CSS variables from a dependency tree
 */
function collectCssVars(tree: DependencyTree): CssVars {
	const combined: CssVars = {
		theme: {},
		light: {},
		dark: {},
	};

	// Collect from root
	if (tree.root.item.cssVars) {
		Object.assign(combined.theme || {}, tree.root.item.cssVars.theme);
		Object.assign(combined.light || {}, tree.root.item.cssVars.light);
		Object.assign(combined.dark || {}, tree.root.item.cssVars.dark);
	}

	// Collect from dependencies
	for (const [, resolved] of tree.dependencies) {
		if (resolved.item.cssVars) {
			Object.assign(combined.theme || {}, resolved.item.cssVars.theme);
			Object.assign(combined.light || {}, resolved.item.cssVars.light);
			Object.assign(combined.dark || {}, resolved.item.cssVars.dark);
		}
	}

	return combined;
}

/**
 * Default prompt function using readline
 */
async function defaultPrompt(message: string, defaultValue: boolean = false): Promise<boolean> {
	// In non-interactive mode, return default value
	if (!process.stdin.isTTY) {
		return defaultValue;
	}

	const readline = await import('node:readline');
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	return new Promise((resolve) => {
		const hint = defaultValue ? '[Y/n]' : '[y/N]';
		rl.question(`${message} ${hint} `, (answer) => {
			rl.close();
			const normalized = answer.toLowerCase().trim();
			if (normalized === '') {
				resolve(defaultValue);
			} else {
				resolve(normalized === 'y' || normalized === 'yes');
			}
		});
	});
}

/**
 * Default select function using readline
 */
async function defaultSelect(message: string, options: string[]): Promise<number> {
	// In non-interactive mode, return first option
	if (!process.stdin.isTTY) {
		return 0;
	}

	const readline = await import('node:readline');
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	console.log(message);
	options.forEach((opt, i) => {
		console.log(`  ${i + 1}. ${opt}`);
	});

	return new Promise((resolve) => {
		rl.question(`Select [1-${options.length}]: `, (answer) => {
			rl.close();
			const num = parseInt(answer.trim(), 10);
			if (num >= 1 && num <= options.length) {
				resolve(num - 1);
			} else {
				// Default to first option
				resolve(0);
			}
		});
	});
}

/**
 * Creates a modified config that only uses the specified registry
 */
function createSingleRegistryConfig(
	config: ComponentConfig,
	registryName: string,
	registryUrl: string
): ComponentConfig {
	const registries = config.registries || {};
	const originalRegistry = registries[registryName];
	
	// Preserve headers if they exist
	const registryConfig = typeof originalRegistry === 'string'
		? registryUrl
		: { url: registryUrl, headers: originalRegistry?.headers };

	return {
		...config,
		registries: {
			[registryName]: registryConfig,
		},
	};
}


/**
 * Adds components from the registry to the user's project
 *
 * @param options - Add options
 * @returns Add result with installed components and any errors
 */
export async function add(options: AddOptions): Promise<AddResult> {
	const {
		cwd,
		components,
		overwrite = false,
		registry,
		verbose = false,
		skipInstall = false,
		promptFn = defaultPrompt,
		selectFn = defaultSelect,
	} = options;

	const result: AddResult = {
		installed: [],
		skipped: [],
		errors: [],
		filesWritten: [],
		npmDependencies: [],
	};

	// Load configuration - auto-init if not found
	let config: ComponentConfig;
	try {
		config = loadConfig(cwd);
	} catch (error) {
		if (error instanceof ConfigNotFoundError) {
			// Auto-initialize the project
			if (verbose) {
				console.log(pc.dim('No components.json found, initializing project...'));
			}
			
			// Check if it's a valid SvelteKit project
			const svelteConfig = detectSvelteConfig(cwd);
			if (!svelteConfig) {
				throw new Error('Not a SvelteKit project. Please run this command in a SvelteKit project directory.');
			}
			
			// Check for Tailwind
			const tailwindConfig = detectTailwindConfig(cwd);
			if (!tailwindConfig) {
				throw new Error('Tailwind CSS not found. Please set up Tailwind CSS first: npx svelte-add@latest tailwind');
			}
			
			// Run init
			await init({ cwd, verbose });
			
			// Load the newly created config
			config = loadConfig(cwd);
		} else {
			throw new Error(`Failed to load configuration: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	if (verbose) {
		console.log(pc.dim(`Loaded configuration from components.json`));
	}

	// Process each component
	for (const componentName of components) {
		if (verbose) {
			console.log(pc.dim(`\nProcessing component: ${componentName}`));
		}

		try {
			// Determine which config to use for resolution
			let resolveConfig = config;

			// Check if this is a URL - if so, skip registry lookup
			const isDirectUrl = componentName.startsWith('http://') || componentName.startsWith('https://');

			// If a specific registry is specified, use only that registry
			if (!isDirectUrl && registry && config.registries?.[registry]) {
				const registryConf = config.registries[registry];
				const registryUrl = typeof registryConf === 'string' ? registryConf : registryConf.url;
				resolveConfig = createSingleRegistryConfig(config, registry, registryUrl);
				
				if (verbose) {
					console.log(pc.dim(`  Using specified registry: ${registry}`));
				}
			} else if (!isDirectUrl && !registry) {
				// Check if component exists in multiple registries (Requirement 5.9, 6.2)
				const matches = await findInAllRegistries(componentName, config);

				if (matches.length > 1) {
					if (verbose) {
						console.log(pc.yellow(`  Component found in ${matches.length} registries`));
					}

					// Prompt user to select a registry
					const options = matches.map((m) => `${m.registryName} (${m.registryUrl})`);
					const selectedIndex = await selectFn(
						`Component "${componentName}" found in multiple registries. Select one:`,
						options
					);

					const selected = matches[selectedIndex];
					resolveConfig = createSingleRegistryConfig(
						config,
						selected.registryName,
						selected.registryUrl
					);

					if (verbose) {
						console.log(pc.dim(`  Selected registry: ${selected.registryName}`));
					}
				}
			}

			// Resolve dependency tree (Requirements 5.1, 5.2)
			if (verbose) {
				console.log(pc.dim(`  Resolving dependencies...`));
			}

			const tree = await resolveTree(componentName, resolveConfig);

			if (verbose) {
				const depCount = tree.dependencies.size;
				console.log(pc.dim(`  Found ${depCount} dependencies`));
			}

			// Prepare file operations
			const operations = prepareFileOperations(tree, config, cwd);

			// Check for existing files (Requirement 5.8)
			const existingFiles = operations.filter((op) => op.exists);

			if (existingFiles.length > 0 && !overwrite) {
				if (verbose) {
					console.log(pc.yellow(`  Found ${existingFiles.length} existing files`));
				}

				// Prompt for each existing file
				let skipComponent = false;
				for (const op of existingFiles) {
					const shouldOverwrite = await promptFn(
						`File ${pc.cyan(op.targetPath)} already exists. Overwrite?`,
						false
					);

					if (!shouldOverwrite) {
						if (verbose) {
							console.log(pc.dim(`  Skipping ${op.targetPath}`));
						}
						// Remove this operation from the list
						const index = operations.indexOf(op);
						if (index > -1) {
							operations.splice(index, 1);
						}
					}
				}

				// If all files were skipped, skip the component
				if (operations.length === 0) {
					result.skipped.push(componentName);
					skipComponent = true;
				}

				if (skipComponent) {
					continue;
				}
			}

			// Write files (Requirement 5.6)
			for (const op of operations) {
				// Ensure directory exists
				const dir = dirname(op.targetPath);
				if (!existsSync(dir)) {
					mkdirSync(dir, { recursive: true });
				}

				writeFileSync(op.targetPath, op.content, 'utf-8');
				result.filesWritten.push(op.targetPath);

				if (verbose) {
					console.log(pc.green(`  ✓ ${op.targetPath}`));
				}
			}

			// Merge CSS variables if present
			const cssVars = collectCssVars(tree);
			if (
				Object.keys(cssVars.theme || {}).length > 0 ||
				Object.keys(cssVars.light || {}).length > 0 ||
				Object.keys(cssVars.dark || {}).length > 0
			) {
				const cssPath = join(cwd, config.tailwind.css);
				let existingCss = '';
				if (existsSync(cssPath)) {
					existingCss = readFileSync(cssPath, 'utf-8');
				}

				const mergeResult = mergeCssVariables({
					existingCss,
					cssVars,
				});

				if (mergeResult.added.length > 0) {
					// Ensure directory exists
					const cssDir = dirname(cssPath);
					if (!existsSync(cssDir)) {
						mkdirSync(cssDir, { recursive: true });
					}

					writeFileSync(cssPath, mergeResult.content, 'utf-8');

					if (verbose) {
						console.log(pc.green(`  ✓ Added ${mergeResult.added.length} CSS variables to ${config.tailwind.css}`));
					}
				}
			}

			// Collect npm dependencies (Requirement 5.7)
			const npmDeps = collectNpmDependencies(tree);
			for (const dep of npmDeps) {
				if (!result.npmDependencies.includes(dep)) {
					result.npmDependencies.push(dep);
				}
			}

			result.installed.push(componentName);
		} catch (error) {
			if (error instanceof CircularDependencyError) {
				result.errors.push({
					component: componentName,
					error: `Circular dependency detected: ${error.cycle.join(' -> ')}`,
				});
			} else if (error instanceof ComponentNotFoundError) {
				result.errors.push({
					component: componentName,
					error: error.message,
				});
			} else {
				result.errors.push({
					component: componentName,
					error: error instanceof Error ? error.message : String(error),
				});
			}

			if (verbose) {
				console.log(pc.red(`  ✗ Failed: ${result.errors[result.errors.length - 1].error}`));
			}
		}
	}

	// Install npm dependencies (Requirement 5.7)
	if (!skipInstall && result.npmDependencies.length > 0) {
		const packageManager = detectPackageManager(cwd);
		const installCommand = getInstallCommand(packageManager, result.npmDependencies);

		if (verbose) {
			console.log(pc.dim(`\nInstalling npm dependencies with ${packageManager}...`));
			console.log(pc.dim(`  ${installCommand}`));
		}

		try {
			execSync(installCommand, {
				cwd,
				stdio: verbose ? 'inherit' : 'pipe',
			});
		} catch (error) {
			// Don't fail the whole operation if npm install fails
			console.warn(
				pc.yellow(`\nWarning: Failed to install dependencies. Run manually:\n  ${installCommand}`)
			);
		}
	}

	return result;
}

/**
 * Prints a summary of the add operation
 */
export function printAddSummary(result: AddResult): void {
	console.log();

	if (result.installed.length > 0) {
		console.log(pc.green(`✓ Installed ${result.installed.length} component(s):`));
		for (const name of result.installed) {
			console.log(`  ${pc.cyan(name)}`);
		}
	}

	if (result.skipped.length > 0) {
		console.log(pc.yellow(`\n⊘ Skipped ${result.skipped.length} component(s):`));
		for (const name of result.skipped) {
			console.log(`  ${pc.dim(name)}`);
		}
	}

	if (result.errors.length > 0) {
		console.log(pc.red(`\n✗ Failed ${result.errors.length} component(s):`));
		for (const { component, error } of result.errors) {
			console.log(`  ${pc.red(component)}: ${error}`);
		}
	}

	if (result.npmDependencies.length > 0) {
		console.log(pc.dim(`\nInstalled npm dependencies:`));
		console.log(pc.dim(`  ${result.npmDependencies.join(', ')}`));
	}

	console.log();
}
