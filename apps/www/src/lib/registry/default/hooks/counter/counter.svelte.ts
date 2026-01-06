/**
 * A reactive counter hook demonstrating Svelte 5's universal reactivity pattern.
 * This hook can be used across multiple components to share reactive state.
 *
 * @example
 * ```svelte
 * <script>
 *   import { createCounter } from '$lib/registry/default/hooks/counter/counter.svelte';
 *
 *   const counter = createCounter(0);
 * </script>
 *
 * <button onclick={counter.increment}>
 *   Count: {counter.count}
 * </button>
 * ```
 */

interface CounterOptions {
	/** Initial count value (default: 0) */
	initial?: number;
	/** Minimum allowed value (default: -Infinity) */
	min?: number;
	/** Maximum allowed value (default: Infinity) */
	max?: number;
	/** Step value for increment/decrement (default: 1) */
	step?: number;
}

interface Counter {
	/** Current count value */
	readonly count: number;
	/** Increment the counter by step value */
	increment: () => void;
	/** Decrement the counter by step value */
	decrement: () => void;
	/** Reset the counter to initial value */
	reset: () => void;
	/** Set the counter to a specific value */
	set: (value: number) => void;
}

export function createCounter(options: CounterOptions = {}): Counter {
	const { initial = 0, min = -Infinity, max = Infinity, step = 1 } = options;

	let count = $state(initial);

	function clamp(value: number): number {
		return Math.min(Math.max(value, min), max);
	}

	return {
		get count() {
			return count;
		},
		increment: () => {
			count = clamp(count + step);
		},
		decrement: () => {
			count = clamp(count - step);
		},
		reset: () => {
			count = initial;
		},
		set: (value: number) => {
			count = clamp(value);
		}
	};
}
