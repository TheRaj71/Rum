import { describe, it, expect } from 'vitest';
import {
	mergeCssVariables,
	parseCssVariables,
	hasLayerBase,
	createLayerBaseBlock,
} from './css.js';

describe('parseCssVariables', () => {
	it('should parse :root variables', () => {
		const css = `
			:root {
				--primary: blue;
				--secondary: green;
			}
		`;
		const result = parseCssVariables(css);
		expect(result.theme.get('--primary')).toBe('blue');
		expect(result.theme.get('--secondary')).toBe('green');
	});

	it('should parse .dark variables', () => {
		const css = `
			.dark {
				--primary: darkblue;
				--background: #1a1a1a;
			}
		`;
		const result = parseCssVariables(css);
		expect(result.dark.get('--primary')).toBe('darkblue');
		expect(result.dark.get('--background')).toBe('#1a1a1a');
	});

	it('should parse .light variables', () => {
		const css = `
			.light {
				--primary: lightblue;
				--background: #ffffff;
			}
		`;
		const result = parseCssVariables(css);
		expect(result.light.get('--primary')).toBe('lightblue');
		expect(result.light.get('--background')).toBe('#ffffff');
	});

	it('should parse variables within @layer base', () => {
		const css = `
			@layer base {
				:root {
					--primary: blue;
				}
				.dark {
					--primary: darkblue;
				}
			}
		`;
		const result = parseCssVariables(css);
		expect(result.theme.get('--primary')).toBe('blue');
		expect(result.dark.get('--primary')).toBe('darkblue');
	});

	it('should parse variables with complex values', () => {
		const css = `
			:root {
				--font-family: 'Inter', sans-serif;
				--shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
				--gradient: linear-gradient(to right, red, blue);
			}
		`;
		const result = parseCssVariables(css);
		expect(result.theme.get('--font-family')).toBe("'Inter', sans-serif");
		expect(result.theme.get('--shadow')).toBe('0 4px 6px rgba(0, 0, 0, 0.1)');
		expect(result.theme.get('--gradient')).toBe('linear-gradient(to right, red, blue)');
	});

	it('should handle empty CSS', () => {
		const result = parseCssVariables('');
		expect(result.theme.size).toBe(0);
		expect(result.light.size).toBe(0);
		expect(result.dark.size).toBe(0);
	});
});

describe('mergeCssVariables', () => {
	it('should add new variables to existing @layer base', () => {
		const existingCss = `
@layer base {
  :root {
    --existing: red;
  }
}`;
		const result = mergeCssVariables({
			existingCss,
			cssVars: {
				theme: { '--new-var': 'blue' },
			},
		});

		expect(result.content).toContain('--new-var: blue');
		expect(result.content).toContain('--existing: red');
		expect(result.added).toContain('--new-var');
	});

	it('should not overwrite existing variables', () => {
		const existingCss = `
@layer base {
  :root {
    --primary: red;
  }
}`;
		const result = mergeCssVariables({
			existingCss,
			cssVars: {
				theme: { '--primary': 'blue', '--secondary': 'green' },
			},
		});

		expect(result.skipped).toContain('--primary');
		expect(result.added).toContain('--secondary');
		// Original value should be preserved
		expect(result.content).toContain('--primary: red');
	});

	it('should create @layer base if not present', () => {
		const existingCss = `
body {
  margin: 0;
}`;
		const result = mergeCssVariables({
			existingCss,
			cssVars: {
				theme: { '--primary': 'blue' },
			},
		});

		expect(result.content).toContain('@layer base');
		expect(result.content).toContain(':root');
		expect(result.content).toContain('--primary: blue');
	});

	it('should handle dark mode variables', () => {
		const existingCss = `@layer base { }`;
		const result = mergeCssVariables({
			existingCss,
			cssVars: {
				dark: { '--background': '#1a1a1a' },
			},
		});

		expect(result.content).toContain('.dark');
		expect(result.content).toContain('--background: #1a1a1a');
		expect(result.added).toContain('--background');
	});

	it('should handle light mode variables', () => {
		const existingCss = `@layer base { }`;
		const result = mergeCssVariables({
			existingCss,
			cssVars: {
				light: { '--background': '#ffffff' },
			},
		});

		expect(result.content).toContain('.light');
		expect(result.content).toContain('--background: #ffffff');
	});

	it('should handle all three scopes together', () => {
		const existingCss = `@layer base { }`;
		const result = mergeCssVariables({
			existingCss,
			cssVars: {
				theme: { '--primary': 'blue' },
				light: { '--bg': 'white' },
				dark: { '--bg': 'black' },
			},
		});

		expect(result.content).toContain(':root');
		expect(result.content).toContain('.light');
		expect(result.content).toContain('.dark');
		expect(result.added).toHaveLength(3);
	});

	it('should handle empty cssVars', () => {
		const existingCss = `@layer base { :root { --existing: red; } }`;
		const result = mergeCssVariables({
			existingCss,
			cssVars: {},
		});

		expect(result.content).toBe(existingCss);
		expect(result.added).toHaveLength(0);
	});

	it('should handle empty existing CSS', () => {
		const result = mergeCssVariables({
			existingCss: '',
			cssVars: {
				theme: { '--primary': 'blue' },
			},
		});

		expect(result.content).toContain('@layer base');
		expect(result.content).toContain('--primary: blue');
	});

	it('should insert after @import statements', () => {
		const existingCss = `@import 'tailwindcss';

body { margin: 0; }`;
		const result = mergeCssVariables({
			existingCss,
			cssVars: {
				theme: { '--primary': 'blue' },
			},
		});

		// @layer base should come after @import
		const importIndex = result.content.indexOf('@import');
		const layerIndex = result.content.indexOf('@layer base');
		expect(layerIndex).toBeGreaterThan(importIndex);
	});
});

describe('hasLayerBase', () => {
	it('should return true when @layer base exists', () => {
		expect(hasLayerBase('@layer base { }')).toBe(true);
		expect(hasLayerBase('@layer base {\n  :root { }\n}')).toBe(true);
	});

	it('should return false when @layer base does not exist', () => {
		expect(hasLayerBase('')).toBe(false);
		expect(hasLayerBase(':root { --primary: blue; }')).toBe(false);
		expect(hasLayerBase('@layer components { }')).toBe(false);
	});
});

describe('createLayerBaseBlock', () => {
	it('should create a valid @layer base block', () => {
		const result = createLayerBaseBlock({
			theme: { '--primary': 'blue' },
		});

		expect(result).toContain('@layer base');
		expect(result).toContain(':root');
		expect(result).toContain('--primary: blue');
	});

	it('should include all scopes', () => {
		const result = createLayerBaseBlock({
			theme: { '--primary': 'blue' },
			light: { '--bg': 'white' },
			dark: { '--bg': 'black' },
		});

		expect(result).toContain(':root');
		expect(result).toContain('.light');
		expect(result).toContain('.dark');
	});

	it('should return empty string for empty cssVars', () => {
		expect(createLayerBaseBlock({})).toBe('');
		expect(createLayerBaseBlock({ theme: {} })).toBe('');
	});
});
