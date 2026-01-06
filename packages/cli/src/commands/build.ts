import { existsSync, readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { join, basename, extname, relative } from 'node:path';
import { createHash } from 'node:crypto';
import pc from 'picocolors';
import {
	RegistrySchema,
	RegistryItemSchema,
	type Registry,
	type RegistryItem,
	type RegistryFile,
	type FileType,
} from '../schema/index.js';

/**
 * Build Command Implementation
 * Builds the registry from source files and generates JSON API
 */

export interface BuildOptions {
	/** Working directory (root of the registry host) */
	cwd: string;
	/** Source directory containing registry components (relative to cwd) */
	sourceDir?: string;
	/** Output directory for generated JSON (relative to cwd) */
	outputDir?: string;
	/** Registry name */
	name?: string;
	/** Registry homepage URL */
	homepage?: string;
	/** Verbose output */
	verbose?: boolean;
	/** Dry run - don't write files */
	dryRun?: boolean;
}

export interface BuildResult {
	/** Number of items built */
	itemCount: number;
	/** Names of built items */
	items: string[];
	/** Output paths */
	outputPaths: {
		registry: string;
		items: string[];
	};
	/** Content hashes for change detection */
	hashes: Map<string, string>;
	/** Validation errors if any */
	errors: Array<{ item: string; error: string }>;
}

/**
 * Error thrown when build validation fails
 */
export class BuildValidationError extends Error {
	public readonly errors: Array<{ item: string; error: string }>;

	constructor(errors: Array<{ item: string; error: string }>) {
		const messages = errors.map((e) => `  - ${e.item}: ${e.error}`).join('\n');
		super(`Build validation failed:\n${messages}`);
		this.name = 'BuildValidationError';
		this.errors = errors;
	}
}

/**
 * Metadata extracted from component files
 */
interface ComponentMetadata {
	name: string;
	type: FileType;
	title?: string;
	description?: string;
	author?: string;
	dependencies?: string[];
	registryDependencies?: string[];
	categories?: string[];
}

/**
 * Known internal/built-in modules that should not be treated as npm dependencies
 */
const BUILTIN_MODULES = new Set([
	// Node.js built-ins
	'node:fs', 'node:path', 'node:url', 'node:crypto', 'node:util', 'node:events',
	'node:stream', 'node:buffer', 'node:http', 'node:https', 'node:os', 'node:child_process',
	'fs', 'path', 'url', 'crypto', 'util', 'events', 'stream', 'buffer', 'http', 'https', 'os',
	// Svelte built-ins
	'svelte', 'svelte/store', 'svelte/motion', 'svelte/transition', 'svelte/animate',
	'svelte/easing', 'svelte/elements', 'svelte/reactivity',
	// SvelteKit
	'$app/environment', '$app/forms', '$app/navigation', '$app/paths', '$app/stores', '$app/state',
	'$env/static/private', '$env/static/public', '$env/dynamic/private', '$env/dynamic/public',
	'$service-worker',
	// Project aliases (will be transformed)
	'$lib', '$lib/utils', '$lib/components', '$lib/hooks',
]);

/**
 * Patterns for internal imports that should be ignored
 */
const INTERNAL_IMPORT_PATTERNS = [
	/^\$/, // SvelteKit aliases ($lib, $app, etc.)
	/^\./, // Relative imports
	/^@\//, // Project root alias
];

/**
 * Extracts npm package dependencies from file content by analyzing imports
 * Detects: import X from 'package', import { X } from 'package', import 'package'
 */
function extractDependenciesFromContent(content: string): string[] {
	const dependencies = new Set<string>();

	// Match ES module imports: import X from 'package' or import { X } from 'package'
	const importRegex = /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+)?['"]([^'"]+)['"]/g;
	
	// Match dynamic imports: import('package')
	const dynamicImportRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

	// Match require statements: require('package')
	const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

	const allRegexes = [importRegex, dynamicImportRegex, requireRegex];

	for (const regex of allRegexes) {
		let match;
		while ((match = regex.exec(content)) !== null) {
			const importPath = match[1];
			
			// Skip built-in modules
			if (BUILTIN_MODULES.has(importPath)) {
				continue;
			}

			// Skip internal import patterns
			if (INTERNAL_IMPORT_PATTERNS.some(pattern => pattern.test(importPath))) {
				continue;
			}

			// Extract package name (handle scoped packages like @org/package)
			let packageName: string;
			if (importPath.startsWith('@')) {
				// Scoped package: @org/package or @org/package/subpath
				const parts = importPath.split('/');
				packageName = parts.length >= 2 ? `${parts[0]}/${parts[1]}` : importPath;
			} else {
				// Regular package: package or package/subpath
				packageName = importPath.split('/')[0];
			}

			dependencies.add(packageName);
		}
	}

	return Array.from(dependencies);
}


/**
 * Computes SHA-256 hash of content for change detection
 * Property 10: Content Hash Determinism - same content always produces same hash
 */
export function computeContentHash(content: string): string {
	return createHash('sha256').update(content, 'utf-8').digest('hex');
}

/**
 * Determines the file type based on file extension and path
 */
function determineFileType(filePath: string): FileType {
	const ext = extname(filePath).toLowerCase();
	const fileName = basename(filePath);

	// Check for .svelte.ts files (hooks with universal reactivity)
	if (fileName.endsWith('.svelte.ts') || fileName.endsWith('.svelte.js')) {
		return 'registry:hook';
	}

	// Check for .svelte files (UI components)
	if (ext === '.svelte') {
		return 'registry:ui';
	}

	// Check for TypeScript/JavaScript files (lib utilities)
	if (ext === '.ts' || ext === '.js' || ext === '.mts' || ext === '.mjs') {
		return 'registry:lib';
	}

	// Default to file type
	return 'registry:file';
}

/**
 * Parses metadata from a component file's JSDoc comments or frontmatter
 * Looks for @name, @type, @description, @author, @dependencies, @registryDependencies, @categories
 */
function parseMetadataFromContent(content: string, filePath: string): Partial<ComponentMetadata> {
	const metadata: Partial<ComponentMetadata> = {};

	// Look for JSDoc-style comments at the top of the file
	const jsdocMatch = content.match(/\/\*\*[\s\S]*?\*\//);
	if (jsdocMatch) {
		const jsdoc = jsdocMatch[0];

		// Extract @name
		const nameMatch = jsdoc.match(/@name\s+(\S+)/);
		if (nameMatch) {
			metadata.name = nameMatch[1];
		}

		// Extract @type
		const typeMatch = jsdoc.match(/@type\s+(registry:\S+)/);
		if (typeMatch) {
			metadata.type = typeMatch[1] as FileType;
		}

		// Extract @title
		const titleMatch = jsdoc.match(/@title\s+(.+)/);
		if (titleMatch) {
			metadata.title = titleMatch[1].trim();
		}

		// Extract @description
		const descMatch = jsdoc.match(/@description\s+(.+)/);
		if (descMatch) {
			metadata.description = descMatch[1].trim();
		}

		// Extract @author
		const authorMatch = jsdoc.match(/@author\s+(.+)/);
		if (authorMatch) {
			metadata.author = authorMatch[1].trim();
		}

		// Extract @dependencies (comma-separated npm packages)
		const depsMatch = jsdoc.match(/@dependencies\s+(.+)/);
		if (depsMatch) {
			metadata.dependencies = depsMatch[1].split(',').map((d) => d.trim()).filter(Boolean);
		}

		// Extract @registryDependencies (comma-separated registry items)
		const regDepsMatch = jsdoc.match(/@registryDependencies\s+(.+)/);
		if (regDepsMatch) {
			metadata.registryDependencies = regDepsMatch[1].split(',').map((d) => d.trim()).filter(Boolean);
		}

		// Extract @categories (comma-separated)
		const categoriesMatch = jsdoc.match(/@categories\s+(.+)/);
		if (categoriesMatch) {
			metadata.categories = categoriesMatch[1].split(',').map((c) => c.trim()).filter(Boolean);
		}
	}

	// Also check for HTML-style comments in .svelte files
	if (filePath.endsWith('.svelte')) {
		const htmlCommentMatch = content.match(/<!--[\s\S]*?-->/);
		if (htmlCommentMatch) {
			const comment = htmlCommentMatch[0];

			// Same extraction logic for HTML comments
			if (!metadata.name) {
				const nameMatch = comment.match(/@name\s+(\S+)/);
				if (nameMatch) metadata.name = nameMatch[1];
			}

			if (!metadata.description) {
				const descMatch = comment.match(/@description\s+(.+)/);
				if (descMatch) metadata.description = descMatch[1].trim();
			}
		}
	}

	return metadata;
}


/**
 * Recursively scans a directory for component files
 */
function scanDirectory(dir: string, baseDir: string): string[] {
	const files: string[] = [];

	if (!existsSync(dir)) {
		return files;
	}

	const entries = readdirSync(dir);

	for (const entry of entries) {
		// Skip hidden files and directories
		if (entry.startsWith('.')) {
			continue;
		}

		const fullPath = join(dir, entry);
		const stat = statSync(fullPath);

		if (stat.isDirectory()) {
			// Recursively scan subdirectories
			files.push(...scanDirectory(fullPath, baseDir));
		} else if (stat.isFile()) {
			// Include relevant file types
			const ext = extname(entry).toLowerCase();
			if (['.svelte', '.ts', '.js', '.mts', '.mjs'].includes(ext)) {
				files.push(fullPath);
			}
		}
	}

	return files;
}

/**
 * Groups files by component name
 * Files in the same directory or with the same base name are grouped together
 * For nested structures like ui/button/, blocks/card/, hooks/counter/,
 * the component name is the innermost directory (button, card, counter)
 */
function groupFilesByComponent(
	files: string[],
	sourceDir: string
): Map<string, string[]> {
	const groups = new Map<string, string[]>();

	for (const file of files) {
		const relativePath = relative(sourceDir, file);
		const parts = relativePath.split('/');

		// Determine component name based on directory structure
		let componentName: string;

		if (parts.length === 1) {
			// File is directly in source dir - use filename without extension
			const fileName = basename(file);
			// Handle .svelte.ts files
			if (fileName.endsWith('.svelte.ts') || fileName.endsWith('.svelte.js')) {
				componentName = fileName.replace(/\.svelte\.(ts|js)$/, '');
			} else {
				componentName = fileName.replace(/\.(svelte|ts|js|mts|mjs)$/, '');
			}
		} else if (parts.length === 2) {
			// File is one level deep (e.g., button/Button.svelte)
			// Use the directory name as component name
			componentName = parts[0];
		} else {
			// File is in nested directories (e.g., ui/button/Button.svelte or blocks/card/Card.svelte)
			// Use the second-to-last directory as component name (the actual component folder)
			// This handles structures like: ui/button/, blocks/card/, hooks/counter/
			componentName = parts[parts.length - 2];
		}

		// Convert to kebab-case for consistency
		componentName = componentName
			.replace(/([a-z])([A-Z])/g, '$1-$2')
			.toLowerCase();

		if (!groups.has(componentName)) {
			groups.set(componentName, []);
		}
		groups.get(componentName)!.push(file);
	}

	return groups;
}

/**
 * Builds a registry item from a group of files
 */
function buildRegistryItem(
	name: string,
	files: string[],
	sourceDir: string
): RegistryItem {
	const registryFiles: RegistryFile[] = [];
	let primaryMetadata: Partial<ComponentMetadata> = {};
	let itemType: FileType = 'registry:ui';
	const allDependencies = new Set<string>();

	// Determine if this is a block (multi-file component)
	const isBlock = files.length > 1;

	for (const filePath of files) {
		const content = readFileSync(filePath, 'utf-8');
		const relativePath = relative(sourceDir, filePath);
		const fileType = determineFileType(filePath);
		const fileName = basename(filePath);

		// Auto-detect npm dependencies from imports
		const detectedDeps = extractDependenciesFromContent(content);
		for (const dep of detectedDeps) {
			allDependencies.add(dep);
		}

		// Parse metadata from the primary file (first .svelte file or main file)
		const isPrimaryFile =
			fileName.toLowerCase() === `${name}.svelte` ||
			fileName.toLowerCase() === `${name}.ts` ||
			fileName.toLowerCase() === `${name}.svelte.ts` ||
			(files.length === 1);

		if (isPrimaryFile || Object.keys(primaryMetadata).length === 0) {
			const parsedMetadata = parseMetadataFromContent(content, filePath);
			primaryMetadata = { ...primaryMetadata, ...parsedMetadata };
		}

		// Determine target path based on file type
		// For nested structures like ui/button/Button.svelte, we want $lib/components/button/Button.svelte
		// For hooks/counter/counter.svelte.ts, we want $lib/hooks/counter/counter.svelte.ts
		const pathParts = relativePath.split('/');
		let targetPath: string;
		
		if (fileType === 'registry:hook') {
			// For hooks, strip the category folder (hooks/) and put in $lib/hooks/
			if (pathParts[0] === 'hooks' && pathParts.length > 1) {
				targetPath = `$lib/hooks/${pathParts.slice(1).join('/')}`;
			} else {
				targetPath = `$lib/hooks/${relativePath}`;
			}
		} else if (fileType === 'registry:lib') {
			// For lib files (index.ts), determine based on parent folder type
			if (pathParts[0] === 'hooks' && pathParts.length > 1) {
				targetPath = `$lib/hooks/${pathParts.slice(1).join('/')}`;
			} else if (pathParts[0] === 'ui' && pathParts.length > 1) {
				targetPath = `$lib/components/${pathParts.slice(1).join('/')}`;
			} else if (pathParts[0] === 'blocks' && pathParts.length > 1) {
				targetPath = `$lib/components/${pathParts.slice(1).join('/')}`;
			} else {
				targetPath = `$lib/${relativePath}`;
			}
		} else {
			// For UI components, strip the category folder (ui/, blocks/) and put in $lib/components/
			if ((pathParts[0] === 'ui' || pathParts[0] === 'blocks') && pathParts.length > 1) {
				targetPath = `$lib/components/${pathParts.slice(1).join('/')}`;
			} else {
				targetPath = `$lib/components/${relativePath}`;
			}
		}

		registryFiles.push({
			path: relativePath,
			content,
			type: fileType,
			target: targetPath,
		});

		// Update item type based on files
		if (fileType === 'registry:hook') {
			itemType = 'registry:hook';
		}
	}

	// If multiple files, it's a block
	if (isBlock) {
		itemType = 'registry:block';
	}

	// Use metadata type if specified
	if (primaryMetadata.type) {
		itemType = primaryMetadata.type;
	}

	const item: RegistryItem = {
		name: primaryMetadata.name || name,
		type: itemType,
		files: registryFiles,
	};

	// Add optional fields if present
	if (primaryMetadata.title) {
		item.title = primaryMetadata.title;
	}
	if (primaryMetadata.description) {
		item.description = primaryMetadata.description;
	}
	if (primaryMetadata.author) {
		item.author = primaryMetadata.author;
	}
	
	// Merge auto-detected dependencies with manually specified ones
	if (primaryMetadata.dependencies) {
		for (const dep of primaryMetadata.dependencies) {
			allDependencies.add(dep);
		}
	}
	
	// Add dependencies if any were found
	if (allDependencies.size > 0) {
		item.dependencies = Array.from(allDependencies).sort();
	}
	
	if (primaryMetadata.registryDependencies && primaryMetadata.registryDependencies.length > 0) {
		item.registryDependencies = primaryMetadata.registryDependencies;
	}
	if (primaryMetadata.categories && primaryMetadata.categories.length > 0) {
		item.categories = primaryMetadata.categories;
	}

	return item;
}


/**
 * Validates a registry item against the schema
 */
function validateItem(item: RegistryItem): { valid: boolean; error?: string } {
	const result = RegistryItemSchema.safeParse(item);
	if (!result.success) {
		const errors = result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
		return { valid: false, error: errors.join('; ') };
	}
	return { valid: true };
}

/**
 * Validates the complete registry against the schema
 */
function validateRegistry(registry: Registry): { valid: boolean; error?: string } {
	const result = RegistrySchema.safeParse(registry);
	if (!result.success) {
		const errors = result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
		return { valid: false, error: errors.join('; ') };
	}
	return { valid: true };
}

/**
 * Builds the registry from source files
 *
 * @param options - Build options
 * @returns Build result with item count and output paths
 * @throws BuildValidationError if validation fails
 */
export async function build(options: BuildOptions): Promise<BuildResult> {
	const {
		cwd,
		sourceDir = 'src/lib/registry',
		outputDir = 'static/r',
		name = 'svelte-registry',
		homepage,
		verbose = false,
		dryRun = false,
	} = options;

	const result: BuildResult = {
		itemCount: 0,
		items: [],
		outputPaths: {
			registry: '',
			items: [],
		},
		hashes: new Map(),
		errors: [],
	};

	const sourcePath = join(cwd, sourceDir);
	const outputPath = join(cwd, outputDir);

	if (verbose) {
		console.log(pc.dim(`Scanning source directory: ${sourcePath}`));
	}

	// Requirement 8.1: Scan registry source directory
	const files = scanDirectory(sourcePath, sourcePath);

	if (files.length === 0) {
		if (verbose) {
			console.log(pc.yellow('No component files found in source directory'));
		}
		return result;
	}

	if (verbose) {
		console.log(pc.dim(`Found ${files.length} files`));
	}

	// Group files by component
	const componentGroups = groupFilesByComponent(files, sourcePath);

	if (verbose) {
		console.log(pc.dim(`Grouped into ${componentGroups.size} components`));
	}

	// Build registry items
	const items: RegistryItem[] = [];

	for (const [componentName, componentFiles] of componentGroups) {
		if (verbose) {
			console.log(pc.dim(`  Building: ${componentName}`));
		}

		try {
			// Requirement 8.2: Parse each component file and extract metadata
			const item = buildRegistryItem(componentName, componentFiles, sourcePath);

			// Requirement 8.5: Validate against schema
			const validation = validateItem(item);
			if (!validation.valid) {
				result.errors.push({
					item: componentName,
					error: validation.error || 'Unknown validation error',
				});
				continue;
			}

			items.push(item);
			// Use the item's actual name (which may be overridden by metadata)
			result.items.push(item.name);

			// Requirement 8.7: Compute content hash for change detection
			const itemJson = JSON.stringify(item, null, 2);
			const hash = computeContentHash(itemJson);
			result.hashes.set(item.name, hash);

		} catch (error) {
			result.errors.push({
				item: componentName,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	// Check for validation errors
	if (result.errors.length > 0 && items.length === 0) {
		throw new BuildValidationError(result.errors);
	}

	// Build the complete registry
	const registry: Registry = {
		$schema: 'https://rum.dev/schema/registry.json',
		name,
		items,
	};

	if (homepage) {
		registry.homepage = homepage;
	}

	// Validate complete registry
	const registryValidation = validateRegistry(registry);
	if (!registryValidation.valid) {
		throw new BuildValidationError([
			{ item: 'registry.json', error: registryValidation.error || 'Unknown validation error' },
		]);
	}

	result.itemCount = items.length;

	// Write output files (unless dry run)
	if (!dryRun) {
		// Ensure output directory exists
		if (!existsSync(outputPath)) {
			mkdirSync(outputPath, { recursive: true });
		}

		// Requirement 8.4: Generate root registry.json
		const registryPath = join(outputPath, 'registry.json');
		const registryJson = JSON.stringify(registry, null, 2);
		writeFileSync(registryPath, registryJson, 'utf-8');
		result.outputPaths.registry = registryPath;

		if (verbose) {
			console.log(pc.green(`  ✓ ${relative(cwd, registryPath)}`));
		}

		// Requirement 8.3: Generate individual JSON files at /r/{name}.json
		for (const item of items) {
			const itemPath = join(outputPath, `${item.name}.json`);
			const itemJson = JSON.stringify(item, null, 2);
			writeFileSync(itemPath, itemJson, 'utf-8');
			result.outputPaths.items.push(itemPath);

			if (verbose) {
				console.log(pc.green(`  ✓ ${relative(cwd, itemPath)}`));
			}
		}
	}

	return result;
}

/**
 * Prints a summary of the build operation
 */
export function printBuildSummary(result: BuildResult): void {
	console.log();

	if (result.itemCount > 0) {
		console.log(pc.green(`✓ Built ${result.itemCount} registry item(s):`));
		for (const name of result.items) {
			const hash = result.hashes.get(name);
			const hashPreview = hash ? pc.dim(` (${hash.substring(0, 8)})`) : '';
			console.log(`  ${pc.cyan(name)}${hashPreview}`);
		}
	} else {
		console.log(pc.yellow('No registry items were built'));
	}

	if (result.errors.length > 0) {
		console.log(pc.red(`\n✗ ${result.errors.length} error(s):`));
		for (const { item, error } of result.errors) {
			console.log(`  ${pc.red(item)}: ${error}`);
		}
	}

	if (result.outputPaths.registry) {
		console.log(pc.dim(`\nOutput:`));
		console.log(pc.dim(`  ${result.outputPaths.registry}`));
		console.log(pc.dim(`  ${result.outputPaths.items.length} individual item files`));
	}

	console.log();
}
