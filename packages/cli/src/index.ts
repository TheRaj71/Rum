import { Command } from 'commander';
import pc from 'picocolors';
import ora from 'ora';
import {
	init,
	printInitSummary,
	InvalidProjectError,
	TailwindNotFoundError,
	add,
	build,
	printBuildSummary,
	BuildValidationError,
	serve,
	printServeInfo,
} from './commands/index.js';
import { ConfigNotFoundError } from './utils/config.js';
import { CircularDependencyError, ComponentNotFoundError } from './utils/resolver.js';

/**
 * rum - A delightful CLI for Svelte 5 component registry
 * Ship beautiful components with ease 🍹
 */

const LOGO = `
${pc.magenta('  ╭───────────────────────────╮')}
${pc.magenta('  │')}  ${pc.bold(pc.cyan('rum'))} ${pc.dim('- svelte registry')}   ${pc.magenta('│')}
${pc.magenta('  │')}  ${pc.dim('ship components with ease')} ${pc.magenta('│')}
${pc.magenta('  ╰───────────────────────────╯')}
`;

const program = new Command()
	.name('rum')
	.description('rum - A delightful CLI for Svelte 5 component registry 🍹')
	.version('1.0.0')
	.helpOption('-h, --help', 'Display help for command')
	.addHelpCommand('help [command]', 'Display help for command')
	.hook('preAction', () => {
		// Show logo on first command
		if (process.argv.length > 2 && !process.argv.includes('--help') && !process.argv.includes('-h')) {
			console.log(LOGO);
		}
	});

/**
 * Init Command
 * Initializes a SvelteKit project for the component registry
 */
const initCommand = new Command('init')
	.description('Initialize your SvelteKit project for rum')
	.option('-c, --cwd <path>', 'Working directory', process.cwd())
	.option('-s, --style <style>', 'Style/theme to use', 'default')
	.option('-f, --force', 'Force overwrite existing files', false)
	.option('-v, --verbose', 'Show verbose output', false)
	.action(async (options) => {
		const spinner = ora({ text: 'Initializing project...', spinner: 'dots' }).start();
		
		try {
			const result = await init({
				cwd: options.cwd,
				style: options.style,
				force: options.force,
				verbose: options.verbose,
			});

			spinner.succeed(pc.green('Project initialized!'));
			printInitSummary(result);
		} catch (error) {
			spinner.fail(pc.red('Initialization failed'));
			
			if (error instanceof InvalidProjectError) {
				console.error(pc.red(`\n  ${error.message}`));
				console.error(pc.dim('  Make sure you are in a SvelteKit project directory.'));
				process.exit(1);
			}

			if (error instanceof TailwindNotFoundError) {
				console.error(pc.red(`\n  ${error.message}`));
				console.error(pc.dim('  Run: npx svelte-add@latest tailwind'));
				process.exit(1);
			}

			console.error(pc.red('\n  An unexpected error occurred:'));
			console.error(pc.dim(`  ${error instanceof Error ? error.message : String(error)}`));
			process.exit(1);
		}
	});

program.addCommand(initCommand);


/**
 * Checks if a string looks like a URL
 */
function isUrl(str: string): boolean {
	return str.startsWith('http://') || str.startsWith('https://');
}

/**
 * Add Command
 * Adds components from the registry to your project
 * 
 * Usage:
 *   rum add button                              - Add from configured registry
 *   rum add https://example.com/r/button.json   - Add from URL directly (fetches component JSON)
 *   rum add button card                         - Add multiple components
 * 
 * Like shadcn, URLs point directly to component JSON files, not registry.json
 */
const addCommand = new Command('add')
	.description('Add components from the registry to your project')
	.argument('<components...>', 'Component names or URLs to add')
	.option('-c, --cwd <path>', 'Working directory', process.cwd())
	.option('-o, --overwrite', 'Overwrite existing files without prompting', false)
	.option('-r, --registry <registry>', 'Specific registry name to use')
	.option('-v, --verbose', 'Show verbose output', false)
	.option('--skip-install', 'Skip npm dependency installation', false)
	.action(async (components: string[], options) => {
		let initialized = false;
		
		try {
			// Process each component - could be a name or URL
			for (const input of components) {
				// If it's a URL, pass it directly - the resolver handles URL dependencies
				// If it's a name, pass it as component name
				const isDirectUrl = isUrl(input);
				const displayName = isDirectUrl 
					? input.split('/').pop()?.replace('.json', '') || input
					: input;
				
				const spinner = ora({ 
					text: `Adding ${pc.cyan(displayName)}...`, 
					spinner: 'dots' 
				}).start();

				try {
					const result = await add({
						cwd: options.cwd,
						// Pass the URL or name directly - resolver handles both
						components: [input],
						overwrite: options.overwrite,
						registry: options.registry,
						verbose: false,
						skipInstall: true, // We'll handle deps at the end
					});

					if (result.errors.length > 0) {
						spinner.fail(pc.red(`Failed to add ${displayName}`));
						const err = result.errors[0];
						console.error(pc.dim(`  ${err.error}`));
						continue;
					}

					// Check if project was auto-initialized
					if (!initialized && result.filesWritten.some(f => f.includes('utils.ts'))) {
						spinner.text = `Initialized project & adding ${pc.cyan(displayName)}...`;
						initialized = true;
					}

					spinner.succeed(pc.green(`Added ${pc.cyan(displayName)}`));
					
					// Show files
					for (const file of result.filesWritten) {
						const shortPath = file.replace(options.cwd, '').replace(/^\//, '');
						console.log(pc.dim(`    → ${shortPath}`));
					}

					// Collect deps for later
					if (result.npmDependencies.length > 0 && !options.skipInstall) {
						const depsSpinner = ora({ 
							text: `Installing dependencies...`, 
							spinner: 'dots' 
						}).start();
						
						// Re-run with install
						await add({
							cwd: options.cwd,
							components: [input],
							overwrite: true,
							registry: options.registry,
							verbose: false,
							skipInstall: false,
						});
						
						depsSpinner.succeed(pc.green(`Installed ${pc.cyan(result.npmDependencies.join(', '))}`));
					}
				} catch (error) {
					spinner.fail(pc.red(`Failed to add ${displayName}`));
					
					if (error instanceof ComponentNotFoundError) {
						console.error(pc.dim(`  Component not found`));
						if (error.suggestions.length > 0) {
							console.error(pc.yellow(`  Did you mean: ${error.suggestions.join(', ')}?`));
						}
					} else {
						console.error(pc.dim(`  ${error instanceof Error ? error.message : String(error)}`));
					}
				}
			}

			console.log();
			console.log(pc.green('✨ Done!'));
			console.log();
		} catch (error) {
			console.error(pc.red('\n  An unexpected error occurred:'));
			console.error(pc.dim(`  ${error instanceof Error ? error.message : String(error)}`));
			process.exit(1);
		}
	});

program.addCommand(addCommand);


/**
 * Build Command
 * Builds the registry from source files and generates JSON API
 */
const buildCommand = new Command('build')
	.description('Build the registry from source files')
	.option('-c, --cwd <path>', 'Working directory', process.cwd())
	.option('-s, --source <dir>', 'Source directory for registry components', 'src/lib/registry')
	.option('-o, --output <dir>', 'Output directory for generated JSON', 'static/r')
	.option('-n, --name <name>', 'Registry name', 'svelte-registry')
	.option('--homepage <url>', 'Registry homepage URL')
	.option('-v, --verbose', 'Show verbose output', false)
	.option('--dry-run', 'Validate without writing files', false)
	.action(async (options) => {
		const spinner = ora({ text: 'Building registry...', spinner: 'dots' }).start();
		
		try {
			const result = await build({
				cwd: options.cwd,
				sourceDir: options.source,
				outputDir: options.output,
				name: options.name,
				homepage: options.homepage,
				verbose: false,
				dryRun: options.dryRun,
			});

			if (result.itemCount === 0) {
				spinner.warn(pc.yellow('No components found'));
				return;
			}

			spinner.succeed(pc.green(`Built ${result.itemCount} component(s)`));
			
			// Show components
			for (const name of result.items) {
				const hash = result.hashes.get(name);
				const hashPreview = hash ? pc.dim(` #${hash.substring(0, 6)}`) : '';
				console.log(pc.dim(`    → ${pc.cyan(name)}${hashPreview}`));
			}

			if (result.errors.length > 0) {
				console.log();
				console.log(pc.yellow(`  ⚠ ${result.errors.length} warning(s)`));
				for (const { item, error } of result.errors) {
					console.log(pc.dim(`    ${item}: ${error}`));
				}
			}

			console.log();
			console.log(pc.green('✨ Registry built!'));
			console.log(pc.dim(`   Output: ${options.output}/registry.json`));
			console.log();
		} catch (error) {
			spinner.fail(pc.red('Build failed'));
			
			if (error instanceof BuildValidationError) {
				console.error(pc.red(`\n  ${error.message}`));
				process.exit(1);
			}

			console.error(pc.red('\n  An unexpected error occurred:'));
			console.error(pc.dim(`  ${error instanceof Error ? error.message : String(error)}`));
			process.exit(1);
		}
	});

program.addCommand(buildCommand);


/**
 * Serve Command
 * Starts a local HTTP server to host registry files for testing
 */
const serveCommand = new Command('serve')
	.description('Start a local server to host your registry for testing')
	.option('-c, --cwd <path>', 'Working directory', process.cwd())
	.option('-d, --dir <dir>', 'Directory containing registry JSON files', 'static/r')
	.option('-p, --port <port>', 'Port to listen on', '5555')
	.option('-v, --verbose', 'Show verbose output', false)
	.action(async (options) => {
		const spinner = ora({ text: 'Starting server...', spinner: 'dots' }).start();
		
		try {
			const result = await serve({
				cwd: options.cwd,
				dir: options.dir,
				port: parseInt(options.port, 10),
				verbose: options.verbose,
			});

			spinner.succeed(pc.green('Server started!'));
			printServeInfo(result);

			// Keep the process running
			process.on('SIGINT', () => {
				console.log(pc.dim('\n  Server stopped.'));
				process.exit(0);
			});
		} catch (error) {
			spinner.fail(pc.red('Failed to start server'));
			console.error(pc.red('\n  An unexpected error occurred:'));
			console.error(pc.dim(`  ${error instanceof Error ? error.message : String(error)}`));
			process.exit(1);
		}
	});

program.addCommand(serveCommand);

// Export program for testing
export { program };

// Re-export commands for direct usage
export { init, printInitSummary, InvalidProjectError, TailwindNotFoundError } from './commands/index.js';
export { add } from './commands/index.js';
export { build, printBuildSummary, BuildValidationError, computeContentHash } from './commands/index.js';
export { serve, printServeInfo } from './commands/index.js';
export { ConfigNotFoundError } from './utils/config.js';
export { CircularDependencyError, ComponentNotFoundError } from './utils/resolver.js';

// Only parse when run directly
if (process.argv[1]?.includes('rum') || process.argv[1]?.endsWith('index.js')) {
	program.parse();
}
