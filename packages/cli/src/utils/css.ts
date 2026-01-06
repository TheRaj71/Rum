import MagicString from 'magic-string';
import type { CssVars } from '../schema/registry.js';

/**
 * CSS Variable Merger Utility
 * Parses and merges CSS variables into app.css files
 */

export interface CssMergeOptions {
	/** The existing CSS content */
	existingCss: string;
	/** The new CSS variables to merge */
	cssVars: CssVars;
}

export interface CssMergeResult {
	/** The merged CSS content */
	content: string;
	/** Variables that were added */
	added: string[];
	/** Variables that were skipped (already existed) */
	skipped: string[];
}

export interface ParsedCssVariables {
	/** Variables in :root or theme scope */
	theme: Map<string, string>;
	/** Variables in light mode scope */
	light: Map<string, string>;
	/** Variables in dark mode scope */
	dark: Map<string, string>;
}

/**
 * Regex patterns for CSS parsing
 */
const CSS_PATTERNS = {
	/** Match @layer base block */
	layerBase: /@layer\s+base\s*\{([\s\S]*?)\}/g,
	/** Match :root selector block */
	rootSelector: /:root\s*\{([^}]*)\}/g,
	/** Match .dark selector block */
	darkSelector: /\.dark\s*\{([^}]*)\}/g,
	/** Match .light selector block */
	lightSelector: /\.light\s*\{([^}]*)\}/g,
	/** Match @media (prefers-color-scheme: dark) */
	darkMediaQuery: /@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)\s*\{([\s\S]*?)\}/g,
	/** Match @media (prefers-color-scheme: light) */
	lightMediaQuery: /@media\s*\(\s*prefers-color-scheme\s*:\s*light\s*\)\s*\{([\s\S]*?)\}/g,
	/** Match CSS variable declaration */
	cssVariable: /--([a-zA-Z0-9_-]+)\s*:\s*([^;]+);/g,
};

/**
 * Extracts CSS variables from a CSS block content
 */
function extractVariablesFromBlock(blockContent: string): Map<string, string> {
	const variables = new Map<string, string>();
	CSS_PATTERNS.cssVariable.lastIndex = 0;

	let match: RegExpExecArray | null;
	while ((match = CSS_PATTERNS.cssVariable.exec(blockContent)) !== null) {
		const [, name, value] = match;
		variables.set(`--${name}`, value.trim());
	}

	return variables;
}

/**
 * Parses existing CSS content to extract all CSS variables
 *
 * @param cssContent - The CSS content to parse
 * @returns Parsed CSS variables organized by scope
 */
export function parseCssVariables(cssContent: string): ParsedCssVariables {
	const result: ParsedCssVariables = {
		theme: new Map(),
		light: new Map(),
		dark: new Map(),
	};

	// Helper to search in content
	const searchInContent = (content: string) => {
		// Extract :root variables (theme/default)
		const rootPattern = /:root\s*\{([^}]*)\}/g;
		let match: RegExpExecArray | null;
		while ((match = rootPattern.exec(content)) !== null) {
			const vars = extractVariablesFromBlock(match[1]);
			vars.forEach((value, key) => result.theme.set(key, value));
		}

		// Extract .dark variables
		const darkPattern = /\.dark\s*\{([^}]*)\}/g;
		while ((match = darkPattern.exec(content)) !== null) {
			const vars = extractVariablesFromBlock(match[1]);
			vars.forEach((value, key) => result.dark.set(key, value));
		}

		// Extract .light variables
		const lightPattern = /\.light\s*\{([^}]*)\}/g;
		while ((match = lightPattern.exec(content)) !== null) {
			const vars = extractVariablesFromBlock(match[1]);
			vars.forEach((value, key) => result.light.set(key, value));
		}

		// Also check media queries for dark/light mode
		const darkMediaPattern = /@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)\s*\{([\s\S]*?)\}/g;
		while ((match = darkMediaPattern.exec(content)) !== null) {
			// Look for :root inside the media query
			const innerRootPattern = /:root\s*\{([^}]*)\}/g;
			let innerMatch: RegExpExecArray | null;
			while ((innerMatch = innerRootPattern.exec(match[1])) !== null) {
				const vars = extractVariablesFromBlock(innerMatch[1]);
				vars.forEach((value, key) => result.dark.set(key, value));
			}
		}

		const lightMediaPattern = /@media\s*\(\s*prefers-color-scheme\s*:\s*light\s*\)\s*\{([\s\S]*?)\}/g;
		while ((match = lightMediaPattern.exec(content)) !== null) {
			const innerRootPattern = /:root\s*\{([^}]*)\}/g;
			let innerMatch: RegExpExecArray | null;
			while ((innerMatch = innerRootPattern.exec(match[1])) !== null) {
				const vars = extractVariablesFromBlock(innerMatch[1]);
				vars.forEach((value, key) => result.light.set(key, value));
			}
		}
	};

	// First, try to find variables within @layer base
	const layerBasePattern = /@layer\s+base\s*\{([\s\S]*?)\}/g;
	const layerBaseMatch = layerBasePattern.exec(cssContent);

	if (layerBaseMatch) {
		// Search within @layer base content
		searchInContent(layerBaseMatch[1]);
	}

	// Also search in the full content (for variables outside @layer base)
	searchInContent(cssContent);

	return result;
}

/**
 * Formats CSS variables as a CSS block
 */
function formatVariablesBlock(
	variables: Record<string, string>,
	existingVars: Map<string, string>,
	indent: string = '    '
): { css: string; added: string[]; skipped: string[] } {
	const added: string[] = [];
	const skipped: string[] = [];
	const lines: string[] = [];

	for (const [name, value] of Object.entries(variables)) {
		const varName = name.startsWith('--') ? name : `--${name}`;
		if (existingVars.has(varName)) {
			skipped.push(varName);
		} else {
			added.push(varName);
			lines.push(`${indent}${varName}: ${value};`);
		}
	}

	return {
		css: lines.join('\n'),
		added,
		skipped,
	};
}

/**
 * Generates the CSS content for new variables within @layer base
 */
function generateLayerBaseContent(
	cssVars: CssVars,
	existingVars: ParsedCssVariables
): { css: string; added: string[]; skipped: string[] } {
	const allAdded: string[] = [];
	const allSkipped: string[] = [];
	const sections: string[] = [];

	// Generate :root block for theme variables
	if (cssVars.theme && Object.keys(cssVars.theme).length > 0) {
		const { css, added, skipped } = formatVariablesBlock(
			cssVars.theme,
			existingVars.theme
		);
		allAdded.push(...added);
		allSkipped.push(...skipped);
		if (css) {
			sections.push(`  :root {\n${css}\n  }`);
		}
	}

	// Generate .light block for light mode variables
	if (cssVars.light && Object.keys(cssVars.light).length > 0) {
		const { css, added, skipped } = formatVariablesBlock(
			cssVars.light,
			existingVars.light
		);
		allAdded.push(...added);
		allSkipped.push(...skipped);
		if (css) {
			sections.push(`  .light {\n${css}\n  }`);
		}
	}

	// Generate .dark block for dark mode variables
	if (cssVars.dark && Object.keys(cssVars.dark).length > 0) {
		const { css, added, skipped } = formatVariablesBlock(
			cssVars.dark,
			existingVars.dark
		);
		allAdded.push(...added);
		allSkipped.push(...skipped);
		if (css) {
			sections.push(`  .dark {\n${css}\n  }`);
		}
	}

	return {
		css: sections.length > 0 ? sections.join('\n\n') : '',
		added: allAdded,
		skipped: allSkipped,
	};
}

/**
 * Finds the position to insert new content within @layer base
 * Returns the position right before the closing brace of @layer base
 */
function findLayerBaseInsertPosition(cssContent: string): number | null {
	CSS_PATTERNS.layerBase.lastIndex = 0;
	const match = CSS_PATTERNS.layerBase.exec(cssContent);

	if (!match) {
		return null;
	}

	// Find the position of the closing brace
	// match.index is the start of @layer base
	// We need to find the matching closing brace
	const startIndex = match.index;
	let braceCount = 0;
	let inLayerBase = false;

	for (let i = startIndex; i < cssContent.length; i++) {
		if (cssContent[i] === '{') {
			braceCount++;
			inLayerBase = true;
		} else if (cssContent[i] === '}') {
			braceCount--;
			if (inLayerBase && braceCount === 0) {
				// Return position just before the closing brace
				return i;
			}
		}
	}

	return null;
}

/**
 * Merges new CSS variables into existing CSS content
 *
 * @param options - Merge options including existing CSS and new variables
 * @returns Merge result with updated content and lists of added/skipped variables
 *
 * @example
 * ```typescript
 * const result = mergeCssVariables({
 *   existingCss: `@layer base { :root { --primary: blue; } }`,
 *   cssVars: {
 *     theme: { '--secondary': 'green' },
 *     dark: { '--primary': 'darkblue' }
 *   }
 * });
 * ```
 */
export function mergeCssVariables(options: CssMergeOptions): CssMergeResult {
	const { existingCss, cssVars } = options;

	// Parse existing variables
	const existingVars = parseCssVariables(existingCss);

	// Generate new content
	const { css: newContent, added, skipped } = generateLayerBaseContent(
		cssVars,
		existingVars
	);

	// If nothing to add, return original
	if (!newContent) {
		return {
			content: existingCss,
			added: [],
			skipped,
		};
	}

	const s = new MagicString(existingCss);

	// Try to find existing @layer base
	const insertPos = findLayerBaseInsertPosition(existingCss);

	if (insertPos !== null) {
		// Insert before the closing brace of @layer base
		// Add newline before new content if there's existing content
		const beforeInsert = existingCss.slice(0, insertPos).trimEnd();
		const needsNewline = beforeInsert.length > 0 && !beforeInsert.endsWith('\n');
		const prefix = needsNewline ? '\n\n' : '';
		s.appendLeft(insertPos, `${prefix}${newContent}\n`);
	} else {
		// No @layer base exists, create one
		const layerBaseBlock = `@layer base {\n${newContent}\n}\n`;

		// Find a good insertion point
		// Prefer after @import statements or at the beginning
		const importMatch = /@import[^;]+;/g;
		let lastImportEnd = 0;
		let match: RegExpExecArray | null;
		while ((match = importMatch.exec(existingCss)) !== null) {
			lastImportEnd = match.index + match[0].length;
		}

		if (lastImportEnd > 0) {
			// Insert after the last @import
			s.appendRight(lastImportEnd, `\n\n${layerBaseBlock}`);
		} else if (existingCss.length === 0) {
			// Empty file, just return the content directly
			return {
				content: layerBaseBlock,
				added,
				skipped,
			};
		} else if (existingCss.trim().length === 0) {
			// Whitespace-only file, replace with content
			return {
				content: layerBaseBlock,
				added,
				skipped,
			};
		} else {
			// Prepend to the file
			s.prepend(`${layerBaseBlock}\n`);
		}
	}

	return {
		content: s.toString(),
		added,
		skipped,
	};
}

/**
 * Checks if CSS content has @layer base block
 */
export function hasLayerBase(cssContent: string): boolean {
	CSS_PATTERNS.layerBase.lastIndex = 0;
	return CSS_PATTERNS.layerBase.test(cssContent);
}

/**
 * Creates a minimal @layer base block with the given CSS variables
 */
export function createLayerBaseBlock(cssVars: CssVars): string {
	const emptyVars: ParsedCssVariables = {
		theme: new Map(),
		light: new Map(),
		dark: new Map(),
	};

	const { css } = generateLayerBaseContent(cssVars, emptyVars);

	if (!css) {
		return '';
	}

	return `@layer base {\n${css}\n}`;
}
