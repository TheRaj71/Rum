import { defineConfig } from 'tsup';

export default defineConfig({
	entry: ['src/index.ts', 'src/schema/index.ts', 'src/utils/index.ts'],
	format: ['esm'],
	dts: true,
	clean: true,
	sourcemap: true,
	target: 'node18',
	shims: true,
	banner(ctx) {
		// Only add shebang to the CLI entry point
		if (ctx.format === 'esm') {
			return {
				js: '#!/usr/bin/env node'
			};
		}
		return {};
	}
});
