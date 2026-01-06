import { describe, it, expect } from 'vitest';
import { transformImports, transformMultipleFiles, type TransformOptions } from './transformer.js';

/**
 * Tests for Import Transformer Utility
 */

describe('transformImports', () => {
	const defaultOptions: Omit<TransformOptions, 'content'> = {
		sourceAlias: '@/registry',
		targetAlias: '$lib/components',
		fileType: 'typescript',
	};

	describe('static imports', () => {
		it('should transform named imports', () => {
			const content = `import { Button } from "@/registry/ui/button";`;
			const result = transformImports({ ...defaultOptions, content });

			expect(result.content).toBe(`import { Button } from "$lib/components/ui/button";`);
			expect(result.imports).toHaveLength(1);
			expect(result.imports[0]).toEqual({
				original: '@/registry/ui/button',
				transformed: '$lib/components/ui/button',
			});
		});

		it('should transform multiple named imports', () => {
			const content = `import { Button, Card, Input } from "@/registry/ui/components";`;
			const result = transformImports({ ...defaultOptions, content });

			expect(result.content).toBe(
				`import { Button, Card, Input } from "$lib/components/ui/components";`
			);
			expect(result.imports).toHaveLength(1);
		});

		it('should transform default imports', () => {
			const content = `import Button from "@/registry/ui/button";`;
			const result = transformImports({ ...defaultOptions, content });

			expect(result.content).toBe(`import Button from "$lib/components/ui/button";`);
			expect(result.imports).toHaveLength(1);
		});

		it('should transform namespace imports', () => {
			const content = `import * as UI from "@/registry/ui";`;
			const result = transformImports({ ...defaultOptions, content });

			expect(result.content).toBe(`import * as UI from "$lib/components/ui";`);
			expect(result.imports).toHaveLength(1);
		});

		it('should transform side-effect imports', () => {
			const content = `import "@/registry/styles/global.css";`;
			const result = transformImports({ ...defaultOptions, content });

			expect(result.content).toBe(`import "$lib/components/styles/global.css";`);
			expect(result.imports).toHaveLength(1);
		});

		it('should transform mixed named and default imports', () => {
			const content = `import Button, { buttonVariants } from "@/registry/ui/button";`;
			const result = transformImports({ ...defaultOptions, content });

			expect(result.content).toBe(
				`import Button, { buttonVariants } from "$lib/components/ui/button";`
			);
			expect(result.imports).toHaveLength(1);
		});

		it('should handle single quotes', () => {
			const content = `import { Button } from '@/registry/ui/button';`;
			const result = transformImports({ ...defaultOptions, content });

			expect(result.content).toBe(`import { Button } from '$lib/components/ui/button';`);
			expect(result.imports).toHaveLength(1);
		});
	});

	describe('dynamic imports', () => {
		it('should transform dynamic imports with double quotes', () => {
			const content = `const Button = await import("@/registry/ui/button");`;
			const result = transformImports({ ...defaultOptions, content });

			expect(result.content).toBe(`const Button = await import("$lib/components/ui/button");`);
			expect(result.imports).toHaveLength(1);
		});

		it('should transform dynamic imports with single quotes', () => {
			const content = `const Button = await import('@/registry/ui/button');`;
			const result = transformImports({ ...defaultOptions, content });

			expect(result.content).toBe(`const Button = await import('$lib/components/ui/button');`);
			expect(result.imports).toHaveLength(1);
		});

		it('should transform dynamic imports in expressions', () => {
			const content = `const component = lazy(() => import("@/registry/ui/button"));`;
			const result = transformImports({ ...defaultOptions, content });

			expect(result.content).toBe(
				`const component = lazy(() => import("$lib/components/ui/button"));`
			);
			expect(result.imports).toHaveLength(1);
		});
	});

	describe('multiple imports', () => {
		it('should transform multiple imports in the same file', () => {
			const content = `
import { Button } from "@/registry/ui/button";
import { Card } from "@/registry/ui/card";
import { cn } from "@/registry/lib/utils";
`;
			const result = transformImports({ ...defaultOptions, content });

			expect(result.content).toContain(`from "$lib/components/ui/button"`);
			expect(result.content).toContain(`from "$lib/components/ui/card"`);
			expect(result.content).toContain(`from "$lib/components/lib/utils"`);
			expect(result.imports).toHaveLength(3);
		});

		it('should transform mixed static and dynamic imports', () => {
			const content = `
import { Button } from "@/registry/ui/button";
const Card = await import("@/registry/ui/card");
`;
			const result = transformImports({ ...defaultOptions, content });

			expect(result.content).toContain(`from "$lib/components/ui/button"`);
			expect(result.content).toContain(`import("$lib/components/ui/card")`);
			expect(result.imports).toHaveLength(2);
		});
	});

	describe('non-matching imports', () => {
		it('should not transform imports that do not match source alias', () => {
			const content = `import { something } from "other-package";`;
			const result = transformImports({ ...defaultOptions, content });

			expect(result.content).toBe(content);
			expect(result.imports).toHaveLength(0);
		});

		it('should not transform imports with similar but different prefix', () => {
			const content = `import { something } from "@/registry-other/ui/button";`;
			const result = transformImports({ ...defaultOptions, content });

			expect(result.content).toBe(content);
			expect(result.imports).toHaveLength(0);
		});

		it('should preserve non-matching imports alongside matching ones', () => {
			const content = `
import { Button } from "@/registry/ui/button";
import { something } from "other-package";
import React from "react";
`;
			const result = transformImports({ ...defaultOptions, content });

			expect(result.content).toContain(`from "$lib/components/ui/button"`);
			expect(result.content).toContain(`from "other-package"`);
			expect(result.content).toContain(`from "react"`);
			expect(result.imports).toHaveLength(1);
		});
	});

	describe('edge cases', () => {
		it('should handle empty content', () => {
			const result = transformImports({ ...defaultOptions, content: '' });

			expect(result.content).toBe('');
			expect(result.imports).toHaveLength(0);
		});

		it('should handle content with no imports', () => {
			const content = `const x = 1;\nconst y = 2;`;
			const result = transformImports({ ...defaultOptions, content });

			expect(result.content).toBe(content);
			expect(result.imports).toHaveLength(0);
		});

		it('should handle exact alias match without subpath', () => {
			const content = `import * as Registry from "@/registry";`;
			const result = transformImports({ ...defaultOptions, content });

			expect(result.content).toBe(`import * as Registry from "$lib/components";`);
			expect(result.imports).toHaveLength(1);
		});

		it('should preserve import structure with type imports', () => {
			const content = `import type { ButtonProps } from "@/registry/ui/button";`;
			const result = transformImports({ ...defaultOptions, content });

			expect(result.content).toBe(`import type { ButtonProps } from "$lib/components/ui/button";`);
			expect(result.imports).toHaveLength(1);
		});

		it('should handle multiline imports', () => {
			const content = `import {
  Button,
  Card,
  Input
} from "@/registry/ui/components";`;
			const result = transformImports({ ...defaultOptions, content });

			expect(result.content).toContain(`from "$lib/components/ui/components"`);
			expect(result.imports).toHaveLength(1);
		});
	});

	describe('Svelte file handling', () => {
		it('should transform imports in Svelte script tags', () => {
			const content = `<script lang="ts">
  import { Button } from "@/registry/ui/button";
  import { cn } from "@/registry/lib/utils";
</script>

<Button>Click me</Button>`;
			const result = transformImports({ ...defaultOptions, content, fileType: 'svelte' });

			expect(result.content).toContain(`from "$lib/components/ui/button"`);
			expect(result.content).toContain(`from "$lib/components/lib/utils"`);
			expect(result.imports).toHaveLength(2);
		});

		it('should transform imports in Svelte module context', () => {
			const content = `<script context="module" lang="ts">
  import type { ButtonProps } from "@/registry/ui/button";
</script>

<script lang="ts">
  import { Button } from "@/registry/ui/button";
</script>`;
			const result = transformImports({ ...defaultOptions, content, fileType: 'svelte' });

			expect(result.imports).toHaveLength(2);
		});
	});
});

describe('transformMultipleFiles', () => {
	it('should transform multiple files', () => {
		const files = [
			{ content: `import { Button } from "@/registry/ui/button";`, fileType: 'typescript' as const },
			{ content: `import { Card } from "@/registry/ui/card";`, fileType: 'typescript' as const },
		];

		const results = transformMultipleFiles(files, '@/registry', '$lib/components');

		expect(results).toHaveLength(2);
		expect(results[0].content).toContain('$lib/components/ui/button');
		expect(results[1].content).toContain('$lib/components/ui/card');
	});
});
