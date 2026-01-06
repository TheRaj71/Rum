import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { ComponentConfigSchema, type ComponentConfig } from '../schema/index.js';

/**
 * Configuration Loader
 * Finds and parses components.json configuration file
 */

/** Default configuration file name */
const CONFIG_FILE_NAME = 'components.json';

/**
 * Error thrown when configuration file is not found
 */
export class ConfigNotFoundError extends Error {
	public readonly searchPaths: string[];

	constructor(searchPaths: string[]) {
		super(`components.json not found. Run 'svelte-registry init' first.`);
		this.name = 'ConfigNotFoundError';
		this.searchPaths = searchPaths;
	}
}

/**
 * Error thrown when configuration file is invalid
 */
export class ConfigValidationError extends Error {
	public readonly issues: Array<{ path: string; message: string }>;

	constructor(issues: Array<{ path: string; message: string }>) {
		const formatted = issues.map((i) => `  - ${i.path}: ${i.message}`).join('\n');
		super(`Invalid components.json configuration:\n${formatted}`);
		this.name = 'ConfigValidationError';
		this.issues = issues;
	}
}

/**
 * Error thrown when configuration file contains invalid JSON
 */
export class ConfigParseError extends Error {
	public readonly filePath: string;

	constructor(filePath: string, cause: Error) {
		super(`Failed to parse ${filePath}: ${cause.message}`);
		this.name = 'ConfigParseError';
		this.filePath = filePath;
		this.cause = cause;
	}
}

/**
 * Find the configuration file by searching up the directory tree
 * @param cwd - Starting directory for search
 * @returns Path to the configuration file, or null if not found
 */
export function findConfigFile(cwd: string): string | null {
	let currentDir = cwd;
	const searchedPaths: string[] = [];

	while (true) {
		const configPath = join(currentDir, CONFIG_FILE_NAME);
		searchedPaths.push(configPath);

		if (existsSync(configPath)) {
			return configPath;
		}

		const parentDir = dirname(currentDir);
		// Stop if we've reached the root
		if (parentDir === currentDir) {
			break;
		}
		currentDir = parentDir;
	}

	return null;
}

/**
 * Load and validate the configuration file
 * @param cwd - Working directory to search from
 * @returns Validated configuration object
 * @throws ConfigNotFoundError if config file is not found
 * @throws ConfigParseError if config file contains invalid JSON
 * @throws ConfigValidationError if config file fails schema validation
 */
export function loadConfig(cwd: string): ComponentConfig {
	const configPath = findConfigFile(cwd);

	if (!configPath) {
		// Build list of searched paths for error message
		const searchedPaths: string[] = [];
		let currentDir = cwd;
		while (true) {
			searchedPaths.push(join(currentDir, CONFIG_FILE_NAME));
			const parentDir = dirname(currentDir);
			if (parentDir === currentDir) break;
			currentDir = parentDir;
		}
		throw new ConfigNotFoundError(searchedPaths);
	}

	return loadConfigFromPath(configPath);
}

/**
 * Load and validate configuration from a specific file path
 * @param configPath - Path to the configuration file
 * @returns Validated configuration object
 * @throws ConfigParseError if config file contains invalid JSON
 * @throws ConfigValidationError if config file fails schema validation
 */
export function loadConfigFromPath(configPath: string): ComponentConfig {
	// Read the file
	let rawContent: string;
	try {
		rawContent = readFileSync(configPath, 'utf-8');
	} catch (error) {
		throw new ConfigParseError(configPath, error as Error);
	}

	// Parse JSON
	let parsed: unknown;
	try {
		parsed = JSON.parse(rawContent);
	} catch (error) {
		throw new ConfigParseError(configPath, error as Error);
	}

	// Validate with Zod schema
	const result = ComponentConfigSchema.safeParse(parsed);

	if (!result.success) {
		const issues = result.error.issues.map((issue) => ({
			path: issue.path.join('.') || 'root',
			message: issue.message
		}));
		throw new ConfigValidationError(issues);
	}

	return result.data;
}

/**
 * Get the directory containing the configuration file
 * @param cwd - Working directory to search from
 * @returns Directory path containing the config file
 * @throws ConfigNotFoundError if config file is not found
 */
export function getConfigDir(cwd: string): string {
	const configPath = findConfigFile(cwd);
	if (!configPath) {
		throw new ConfigNotFoundError([join(cwd, CONFIG_FILE_NAME)]);
	}
	return dirname(configPath);
}
