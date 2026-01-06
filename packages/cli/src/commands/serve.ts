import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import pc from 'picocolors';

/**
 * Serve Command Implementation
 * Starts a local HTTP server to host registry JSON files for testing
 */

export interface ServeOptions {
	/** Working directory */
	cwd: string;
	/** Directory containing registry JSON files */
	dir?: string;
	/** Port to listen on */
	port?: number;
	/** Verbose output */
	verbose?: boolean;
}

export interface ServeResult {
	/** Server URL */
	url: string;
	/** Port number */
	port: number;
	/** Files being served */
	files: string[];
}

/**
 * MIME types for common file extensions
 */
const MIME_TYPES: Record<string, string> = {
	'.json': 'application/json',
	'.html': 'text/html',
	'.css': 'text/css',
	'.js': 'application/javascript',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.ico': 'image/x-icon',
};

/**
 * Get MIME type for a file extension
 */
function getMimeType(filePath: string): string {
	const ext = extname(filePath).toLowerCase();
	return MIME_TYPES[ext] || 'application/octet-stream';
}


/**
 * List all JSON files in a directory
 */
function listJsonFiles(dir: string): string[] {
	const files: string[] = [];
	
	if (!existsSync(dir)) {
		return files;
	}

	const entries = readdirSync(dir);
	for (const entry of entries) {
		const fullPath = join(dir, entry);
		const stat = statSync(fullPath);
		if (stat.isFile() && entry.endsWith('.json')) {
			files.push(entry);
		}
	}

	return files;
}

/**
 * Starts a local HTTP server to host registry files
 */
export async function serve(options: ServeOptions): Promise<ServeResult> {
	const {
		cwd,
		dir = 'static/r',
		port = 5555,
		verbose = false,
	} = options;

	const registryDir = join(cwd, dir);

	// Check if directory exists
	if (!existsSync(registryDir)) {
		throw new Error(`Registry directory not found: ${registryDir}\nRun 'pnpm registry:build' first.`);
	}

	// List available files
	const files = listJsonFiles(registryDir);

	if (files.length === 0) {
		throw new Error(`No JSON files found in ${registryDir}\nRun 'pnpm registry:build' first.`);
	}

	// Create HTTP server
	const server = createServer((req, res) => {
		const url = req.url || '/';
		
		// Enable CORS for local development
		res.setHeader('Access-Control-Allow-Origin', '*');
		res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
		res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

		if (req.method === 'OPTIONS') {
			res.writeHead(200);
			res.end();
			return;
		}

		// Handle root path - show available files
		if (url === '/' || url === '/index.html') {
			const html = generateIndexHtml(files, port);
			res.writeHead(200, { 'Content-Type': 'text/html' });
			res.end(html);
			return;
		}

		// Serve JSON files
		const filePath = join(registryDir, url.slice(1));
		
		if (!existsSync(filePath)) {
			res.writeHead(404, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: 'Not found' }));
			if (verbose) {
				console.log(pc.red(`404 ${url}`));
			}
			return;
		}

		try {
			const content = readFileSync(filePath, 'utf-8');
			const mimeType = getMimeType(filePath);
			res.writeHead(200, { 'Content-Type': mimeType });
			res.end(content);
			if (verbose) {
				console.log(pc.green(`200 ${url}`));
			}
		} catch (error) {
			res.writeHead(500, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: 'Internal server error' }));
			if (verbose) {
				console.log(pc.red(`500 ${url}`));
			}
		}
	});

	// Start server
	return new Promise((resolve, reject) => {
		server.on('error', (err: NodeJS.ErrnoException) => {
			if (err.code === 'EADDRINUSE') {
				reject(new Error(`Port ${port} is already in use. Try a different port with --port`));
			} else {
				reject(err);
			}
		});

		server.listen(port, () => {
			resolve({
				url: `http://localhost:${port}`,
				port,
				files,
			});
		});
	});
}


/**
 * Generate an HTML index page showing available registry items
 */
function generateIndexHtml(files: string[], port: number): string {
	const registryFile = files.find(f => f === 'registry.json');
	const componentFiles = files.filter(f => f !== 'registry.json');

	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Svelte Registry - Local Server</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 2rem;
      background: #0a0a0a;
      color: #fafafa;
    }
    h1 { color: #ff3e00; margin-bottom: 0.5rem; }
    .subtitle { color: #888; margin-bottom: 2rem; }
    .section { margin-bottom: 2rem; }
    .section h2 { color: #ccc; font-size: 1rem; margin-bottom: 1rem; }
    .card {
      background: #1a1a1a;
      border: 1px solid #333;
      border-radius: 8px;
      padding: 1rem;
      margin-bottom: 0.5rem;
    }
    .card:hover { border-color: #ff3e00; }
    a { color: #ff3e00; text-decoration: none; }
    a:hover { text-decoration: underline; }
    code {
      background: #2a2a2a;
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
      font-size: 0.9rem;
    }
    .url { color: #888; font-size: 0.85rem; margin-top: 0.5rem; }
    .usage {
      background: #1a1a1a;
      border: 1px solid #333;
      border-radius: 8px;
      padding: 1rem;
      margin-top: 1rem;
    }
    .usage pre {
      margin: 0;
      overflow-x: auto;
      color: #ccc;
    }
  </style>
</head>
<body>
  <h1>🧡 Svelte Registry</h1>
  <p class="subtitle">Local development server running on port ${port}</p>

  ${registryFile ? `
  <div class="section">
    <h2>📦 Registry Index</h2>
    <div class="card">
      <a href="/registry.json">registry.json</a>
      <div class="url">http://localhost:${port}/registry.json</div>
    </div>
  </div>
  ` : ''}

  <div class="section">
    <h2>🧩 Components (${componentFiles.length})</h2>
    ${componentFiles.map(file => {
      const name = file.replace('.json', '');
      return `
    <div class="card">
      <a href="/${file}">${name}</a>
      <div class="url">http://localhost:${port}/${file}</div>
    </div>`;
    }).join('')}
  </div>

  <div class="section">
    <h2>🚀 Usage</h2>
    <div class="usage">
      <pre>
# In your project's components.json, add:
{
  "registries": {
    "local": "http://localhost:${port}/registry.json"
  }
}

# Then add components:
npx svelte-registry add button
      </pre>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Prints server startup information
 */
export function printServeInfo(result: ServeResult): void {
	console.log();
	console.log(pc.green('✓ Registry server started!'));
	console.log();
	console.log(`  ${pc.cyan('URL:')}      ${result.url}`);
	console.log(`  ${pc.cyan('Registry:')} ${result.url}/registry.json`);
	console.log();
	console.log(pc.dim('Available components:'));
	for (const file of result.files) {
		if (file !== 'registry.json') {
			const name = file.replace('.json', '');
			console.log(pc.dim(`  - ${name}`));
		}
	}
	console.log();
	console.log(pc.dim('Add to your components.json:'));
	console.log(pc.dim(`  "registries": { "local": "${result.url}/registry.json" }`));
	console.log();
	console.log(pc.yellow('Press Ctrl+C to stop the server'));
	console.log();
}
