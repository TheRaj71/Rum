import MagicString from 'magic-string';

/**
 * Import Transformer Utility
 * Transforms import paths from registry aliases to project aliases
 */

export interface TransformOptions {
	/** The source code content to transform */
	content: string;
	/** The source alias to replace (e.g., "@/registry") */
	sourceAlias: string;
	/** The target alias to use (e.g., "$lib/components") */
	targetAlias: string;
	/** The type of file being transformed */
	fileType: 'svelte' | 'typescript' | 'javascript';
}

export interface TransformedImport {
	/** The original import path */
	original: string;
	/** The transformed import path */
	transformed: string;
}

export interface TransformResult {
	/** The transformed content */
	content: string;
	/** List of imports that were transformed */
	imports: TransformedImport[];
}

/**
 * Regex patterns for matching different import types
 */
const IMPORT_PATTERNS = {
	/**
	 * Static imports - matches all forms:
	 * - import { x } from 'path'
	 * - import x from 'path'
	 * - import * as x from 'path'
	 * - import 'path' (side-effect imports)
	 *
	 * Captures the full import statement and the path in quotes
	 */
	static: /import\s+(?:(?:[\w*{}\s,]+)\s+from\s+)?(['"])([^'"]+)\1/g,

	/**
	 * Dynamic imports - matches:
	 * - import('path')
	 * - import("path")
	 *
	 * Captures the quote type and path
	 */
	dynamic: /import\s*\(\s*(['"])([^'"]+)\1\s*\)/g,
};

/**
 * Escapes special regex characters in a string
 * Currently unused but kept for potential future use
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Transforms a single import path from source alias to target alias
 */
function transformPath(
	importPath: string,
	sourceAlias: string,
	targetAlias: string
): string | null {
	// Check if the import path starts with the source alias
	if (!importPath.startsWith(sourceAlias)) {
		return null;
	}

	// Get the remainder of the path after the source alias
	const remainder = importPath.slice(sourceAlias.length);

	// Ensure we're matching at a path boundary
	// Either the path equals the alias exactly, or continues with /
	if (remainder.length > 0 && !remainder.startsWith('/')) {
		return null;
	}

	// Replace the source alias with the target alias
	return targetAlias + remainder;
}

/**
 * Transforms import paths in source code from registry aliases to project aliases
 *
 * @param options - Transform options including content, source alias, and target alias
 * @returns Transform result with transformed content and list of transformed imports
 *
 * @example
 * ```typescript
 * const result = transformImports({
 *   content: `import { Button } from "@/registry/ui/button";`,
 *   sourceAlias: "@/registry",
 *   targetAlias: "$lib/components",
 *   fileType: "typescript"
 * });
 * // result.content: `import { Button } from "$lib/components/ui/button";`
 * ```
 */
export function transformImports(options: TransformOptions): TransformResult {
	const { content, sourceAlias, targetAlias } = options;

	const s = new MagicString(content);
	const transformedImports: TransformedImport[] = [];

	// Process static imports
	// Reset regex lastIndex for fresh matching
	IMPORT_PATTERNS.static.lastIndex = 0;
	let match: RegExpExecArray | null;

	while ((match = IMPORT_PATTERNS.static.exec(content)) !== null) {
		const [fullMatch, quote, importPath] = match;
		const transformed = transformPath(importPath, sourceAlias, targetAlias);

		if (transformed !== null) {
			// Calculate the position of the path within the full match
			// The path is between quotes, so we find its position
			const pathStart = match.index + fullMatch.indexOf(quote + importPath);
			const pathEnd = pathStart + quote.length + importPath.length + quote.length;

			// Replace just the quoted path portion
			s.overwrite(pathStart, pathEnd, `${quote}${transformed}${quote}`);

			transformedImports.push({
				original: importPath,
				transformed,
			});
		}
	}

	// Process dynamic imports
	IMPORT_PATTERNS.dynamic.lastIndex = 0;

	while ((match = IMPORT_PATTERNS.dynamic.exec(content)) !== null) {
		const [fullMatch, quote, importPath] = match;
		const transformed = transformPath(importPath, sourceAlias, targetAlias);

		if (transformed !== null) {
			// Calculate the position of the path within the full match
			const pathStart = match.index + fullMatch.indexOf(quote + importPath);
			const pathEnd = pathStart + quote.length + importPath.length + quote.length;

			// Replace just the quoted path portion
			s.overwrite(pathStart, pathEnd, `${quote}${transformed}${quote}`);

			transformedImports.push({
				original: importPath,
				transformed,
			});
		}
	}

	return {
		content: s.toString(),
		imports: transformedImports,
	};
}

/**
 * Transforms imports in Svelte file content
 * Handles both script sections and module context
 *
 * @param options - Transform options
 * @returns Transform result
 */
export function transformSvelteImports(options: TransformOptions): TransformResult {
	// For Svelte files, we use the same transformation logic
	// The regex patterns work on both script content and full Svelte files
	return transformImports(options);
}

/**
 * Batch transform multiple files
 *
 * @param files - Array of file contents with their types
 * @param sourceAlias - Source alias to replace
 * @param targetAlias - Target alias to use
 * @returns Array of transform results
 */
export function transformMultipleFiles(
	files: Array<{ content: string; fileType: TransformOptions['fileType'] }>,
	sourceAlias: string,
	targetAlias: string
): TransformResult[] {
	return files.map((file) =>
		transformImports({
			content: file.content,
			sourceAlias,
			targetAlias,
			fileType: file.fileType,
		})
	);
}
