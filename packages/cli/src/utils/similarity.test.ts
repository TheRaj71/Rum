import { describe, it, expect } from 'vitest';
import {
	levenshteinDistance,
	similarityScore,
	findSimilar,
	findByPrefix,
	suggestSimilarNames,
} from './similarity.js';

describe('Similarity Utilities', () => {
	describe('levenshteinDistance', () => {
		it('should return 0 for identical strings', () => {
			expect(levenshteinDistance('button', 'button')).toBe(0);
		});

		it('should return correct distance for single character difference', () => {
			expect(levenshteinDistance('button', 'buttons')).toBe(1);
			expect(levenshteinDistance('button', 'buttn')).toBe(1);
		});

		it('should return correct distance for multiple differences', () => {
			expect(levenshteinDistance('button', 'card')).toBe(6);
			expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
		});

		it('should handle empty strings', () => {
			expect(levenshteinDistance('', '')).toBe(0);
			expect(levenshteinDistance('button', '')).toBe(6);
			expect(levenshteinDistance('', 'button')).toBe(6);
		});
	});


	describe('similarityScore', () => {
		it('should return 1 for identical strings', () => {
			expect(similarityScore('button', 'button')).toBe(1);
		});

		it('should return 0 for completely different strings', () => {
			expect(similarityScore('abc', 'xyz')).toBe(0);
		});

		it('should return value between 0 and 1 for similar strings', () => {
			const score = similarityScore('button', 'buttons');
			expect(score).toBeGreaterThan(0);
			expect(score).toBeLessThan(1);
		});

		it('should be case insensitive', () => {
			expect(similarityScore('Button', 'button')).toBe(1);
			expect(similarityScore('BUTTON', 'button')).toBe(1);
		});
	});

	describe('findSimilar', () => {
		const candidates = ['button', 'card', 'dialog', 'dropdown', 'input', 'select'];

		it('should find similar strings', () => {
			const results = findSimilar('buton', candidates);
			expect(results).toContain('button');
		});

		it('should respect threshold', () => {
			const results = findSimilar('xyz', candidates, { threshold: 0.9 });
			expect(results).toHaveLength(0);
		});

		it('should respect maxResults', () => {
			const results = findSimilar('d', candidates, { maxResults: 2, threshold: 0.1 });
			expect(results.length).toBeLessThanOrEqual(2);
		});

		it('should sort by similarity', () => {
			const results = findSimilar('button', ['buttons', 'button-group', 'card']);
			expect(results[0]).toBe('buttons');
		});
	});


	describe('findByPrefix', () => {
		const candidates = ['button', 'button-group', 'card', 'card-header', 'dialog'];

		it('should find strings starting with prefix', () => {
			const results = findByPrefix('but', candidates);
			expect(results).toContain('button');
			expect(results).toContain('button-group');
		});

		it('should find strings containing the target', () => {
			const results = findByPrefix('header', candidates);
			expect(results).toContain('card-header');
		});

		it('should be case insensitive', () => {
			const results = findByPrefix('BUT', candidates);
			expect(results).toContain('button');
		});

		it('should return empty array for no matches', () => {
			const results = findByPrefix('xyz', candidates);
			expect(results).toHaveLength(0);
		});
	});

	describe('suggestSimilarNames', () => {
		const availableNames = [
			'button', 'button-group', 'card', 'card-header', 
			'dialog', 'dropdown', 'input', 'select', 'table'
		];

		it('should suggest similar names for typos', () => {
			const suggestions = suggestSimilarNames('buton', availableNames);
			expect(suggestions).toContain('button');
		});

		it('should suggest names with matching prefix', () => {
			const suggestions = suggestSimilarNames('card-', availableNames);
			expect(suggestions).toContain('card-header');
		});

		it('should limit suggestions to maxSuggestions', () => {
			const suggestions = suggestSimilarNames('b', availableNames, 2);
			expect(suggestions.length).toBeLessThanOrEqual(2);
		});

		it('should return empty array when no similar names', () => {
			const suggestions = suggestSimilarNames('zzzzz', availableNames);
			expect(suggestions).toHaveLength(0);
		});
	});
});
