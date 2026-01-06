/**
 * String Similarity Utilities
 * Implements fuzzy matching for suggesting similar component names
 */

/**
 * Calculate Levenshtein distance between two strings
 * This measures the minimum number of single-character edits needed
 * to change one string into the other
 */
export function levenshteinDistance(a: string, b: string): number {
	const matrix: number[][] = [];

	// Initialize first column
	for (let i = 0; i <= a.length; i++) {
		matrix[i] = [i];
	}

	// Initialize first row
	for (let j = 0; j <= b.length; j++) {
		matrix[0][j] = j;
	}

	// Fill in the rest of the matrix
	for (let i = 1; i <= a.length; i++) {
		for (let j = 1; j <= b.length; j++) {
			if (a[i - 1] === b[j - 1]) {
				matrix[i][j] = matrix[i - 1][j - 1];
			} else {
				matrix[i][j] = Math.min(
					matrix[i - 1][j - 1] + 1, // substitution
					matrix[i][j - 1] + 1, // insertion
					matrix[i - 1][j] + 1 // deletion
				);
			}
		}
	}

	return matrix[a.length][b.length];
}

/**
 * Calculate similarity score between two strings (0-1)
 * 1 means identical, 0 means completely different
 */
export function similarityScore(a: string, b: string): number {
	const maxLength = Math.max(a.length, b.length);
	if (maxLength === 0) return 1;
	const distance = levenshteinDistance(a.toLowerCase(), b.toLowerCase());
	return 1 - distance / maxLength;
}

/**
 * Find similar strings from a list
 * Returns strings sorted by similarity (most similar first)
 */
export function findSimilar(
	target: string,
	candidates: string[],
	options: {
		/** Minimum similarity score (0-1) to include in results */
		threshold?: number;
		/** Maximum number of results to return */
		maxResults?: number;
	} = {}
): string[] {
	const { threshold = 0.3, maxResults = 3 } = options;

	const scored = candidates
		.map((candidate) => ({
			name: candidate,
			score: similarityScore(target, candidate),
		}))
		.filter((item) => item.score >= threshold)
		.sort((a, b) => b.score - a.score)
		.slice(0, maxResults);

	return scored.map((item) => item.name);
}

/**
 * Check if a string starts with or contains the target
 * This catches common typos and partial matches
 */
export function findByPrefix(target: string, candidates: string[]): string[] {
	const lowerTarget = target.toLowerCase();
	return candidates.filter(
		(candidate) =>
			candidate.toLowerCase().startsWith(lowerTarget) ||
			candidate.toLowerCase().includes(lowerTarget)
	);
}

/**
 * Find similar component names combining multiple strategies
 * Returns a deduplicated list of suggestions
 */
export function suggestSimilarNames(
	target: string,
	availableNames: string[],
	maxSuggestions: number = 3
): string[] {
	const suggestions = new Set<string>();

	// First, try prefix/contains matching
	const prefixMatches = findByPrefix(target, availableNames);
	for (const match of prefixMatches.slice(0, maxSuggestions)) {
		suggestions.add(match);
	}

	// Then, try fuzzy matching
	const fuzzyMatches = findSimilar(target, availableNames, {
		threshold: 0.4,
		maxResults: maxSuggestions,
	});
	for (const match of fuzzyMatches) {
		if (suggestions.size < maxSuggestions) {
			suggestions.add(match);
		}
	}

	return Array.from(suggestions).slice(0, maxSuggestions);
}
