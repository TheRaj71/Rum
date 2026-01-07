<p align="center">
  <img src="https://raw.githubusercontent.com/TheRaj71/Rum/main/assets/logo.png" alt="rumm logo" width="1050" />
</p>

<h1 align="center">Rumm CLI</h1>

<p align="center">
  <strong>A delightful CLI for Svelte 5 component registry</strong>
</p>

<p align="center">
  Ship beautiful, accessible components with ease 🍹
</p>

<p align="center">
  <a href="https://github.com/TheRaj71/Rum">GitHub</a> •
  <a href="https://github.com/TheRaj71/Rum#quick-start">Quick Start</a> •
  <a href="https://github.com/TheRaj71/Rum#commands">Commands</a>
</p>

---

## What is rumm?

rumm is a CLI tool that lets you add beautifully designed Svelte 5 components directly into your project. Unlike traditional component libraries, rumm doesn't install packages — it copies the source code into your project, giving you full ownership and the freedom to customize everything.

Inspired by [shadcn/ui](https://ui.shadcn.com), rumm brings the same developer experience to the Svelte ecosystem with first-class support for:

- **Svelte 5** - Built with runes, snippets, and the latest Svelte features
- **Tailwind CSS v4** - Modern CSS-first configuration
- **TypeScript** - Full type safety out of the box
- **Accessibility** - Components follow WAI-ARIA guidelines

## Installation

rumm works with any package manager. Install it globally or use it directly with `npx`/`pnpm dlx`:

```bash
# Using pnpm (recommended)
pnpm add -g rumm

# Using npm
npm install -g rumm

# Using bun
bun add -g rumm

# Or use without installing
pnpm dlx rumm add button
```

## Quick Start

### 1. Initialize your project

Navigate to your SvelteKit project and run:

```bash
rumm init
```

This will:
- Detect your Svelte and Tailwind configuration (supports Tailwind v3 and v4)
- Create a `components.json` configuration file
- Add the `cn()` utility function to `src/lib/utils.ts`
- Inject CSS variables into your stylesheet (e.g., `src/app.css` or `src/routes/layout.css`)

### 2. Add components

Add components by name from the official registry:

```bash
rumm add button
rumm add card
rumm add button card dialog  # Add multiple at once
```

Or add from any URL:

```bash
rumm add https://example.com/r/datepicker.json
```

### 3. Use in your app

```svelte
<script>
  import { Button } from '$lib/components/button';
  import { Card, CardHeader, CardTitle, CardContent } from '$lib/components/card';
</script>

<Card>
  <CardHeader>
    <CardTitle>Welcome</CardTitle>
  </CardHeader>
  <CardContent>
    <Button>Get Started</Button>
  </CardContent>
</Card>
```

---

## Commands

### `rumm init`

Initialize your SvelteKit project for rumm.

```bash
rumm init [options]

Options:
  -c, --cwd <path>      Working directory (default: current directory)
  -s, --style <style>   Style/theme to use (default: "default")
  -f, --force           Force overwrite existing files
  -v, --verbose         Show verbose output
  --registry <url>      Default registry URL
```

**What it does:**
- Detects `svelte.config.js` and Tailwind configuration.
- **Auto-installs Tailwind CSS** if not found (using `sv add tailwindcss`).
- Creates `components.json` with sensible defaults based on your project structure.
- Adds the `cn()` helper for merging Tailwind classes safely.
- Injects a set of standard CSS variables for theming into your main CSS file.

### `rumm add`

Add components to your project.

```bash
rumm add <components...> [options]

Arguments:
  components    Component names, URLs, or namespaced references (e.g., @acme/button)

Options:
  -c, --cwd <path>          Working directory
  -o, --overwrite           Overwrite existing files without prompting
  -r, --registry <name>     Use a specific registry from your config
  -v, --verbose             Show verbose output
  --skip-install            Skip npm dependency installation
  --yes                     Skip confirmation prompts
```

**Smart Resolution:**
Rumm uses a sophisticated resolution system to find components:
1. **Direct URL**: If it starts with `http`, it fetches the JSON directly.
2. **Namespaced**: `@myorg/button` searches only the registry named `myorg` in your config.
3. **Name-based**: Searches all configured registries in order.
4. **Typo Suggestions**: If a component isn't found, rumm suggests similar names using Levenshtein distance.
5. **Multiple Matches**: If a component exists in multiple registries, rumm prompts you to choose one.

**Clean Installation:**
Components are installed to clean paths like `$lib/components/button/` instead of nested paths like `$lib/components/default/ui/button/`. Rumm automatically transforms imports within the source code to match your project's aliases.

### `rumm build`

Build your component registry from source files. Ideal for hosting your own component library.

```bash
rumm build [options]

Options:
  -c, --cwd <path>       Working directory
  -s, --source <dir>     Source directory (default: "src/lib/registry")
  -o, --output <dir>     Output directory (default: "static/r")
  -n, --name <name>      Registry name
  --homepage <url>       Registry homepage URL
  -v, --verbose          Show verbose output
  --dry-run              Validate without writing files
```

**Key Features:**
- **Auto-Discovery**: Recursively scans your source directory.
- **Metadata Extraction**: Parses JSDoc or HTML comments for `@name`, `@description`, `@dependencies`, etc.
- **Dependency Detection**: Automatically detects npm packages used in your components.
- **Content Hashing**: Generates SHA-256 hashes for each component for reliable change detection.
- **Registry Index**: Generates a `registry.json` index and individual `{name}.json` files for each component.

### `rumm serve`

Start a local server to test your registry during development.

```bash
rumm serve [options]

Options:
  -c, --cwd <path>    Working directory
  -d, --dir <dir>     Directory with registry files (default: "static/r")
  -p, --port <port>   Port to listen on (default: 5555)
  -v, --verbose       Show verbose output
```

This allows you to test your registry in another project by adding it to `components.json`:
```json
"registries": {
  "local": "http://localhost:5555/registry.json"
}
```

---

## Configuration

Rumm uses a `components.json` file in your project root to manage settings:

```json
{
  "$schema": "https://rum.dev/schema/config.json",
  "style": "default",
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "src/app.css",
    "baseColor": "slate"
  },
  "aliases": {
    "components": "$lib/components",
    "utils": "$lib/utils",
    "hooks": "$lib/hooks",
    "lib": "$lib"
  },
  "registries": {
    "default": "https://rumcli.pages.dev/r/registry.json"
  }
}
```

### Multiple Registries & Authentication

You can configure multiple registries and even include custom headers for private registries:

```json
{
  "registries": {
    "default": "https://rum.dev/r/registry.json",
    "acme": {
      "url": "https://registry.acme.com/r/registry.json",
      "headers": {
        "Authorization": "Bearer ${AUTH_TOKEN}"
      }
    },
    "template": "https://cdn.example.com/{name}.json"
  }
}
```

---

## Technical Details

### Smart Path Aliases
Rumm supports standard SvelteKit aliases and custom ones defined in your `components.json`. When adding a component, it dynamically transforms imports like `@/registry/ui/button` into your local component path, e.g., `$lib/components/button`.

### CSS Variable Injection
The `init` and `add` commands can automatically merge CSS variables into your project's main CSS file. This ensures that themes and component-specific styles work out of the box without manual configuration.

### Package Manager Detection
Rumm automatically detects whether you are using `npm`, `pnpm`, `yarn`, or `bun` by looking for lock files in your project and its parent directories (supporting monorepos).

---

## Troubleshooting

### "Component not found"
- Check if the registry URL in `components.json` is correct.
- If using a private registry, ensure your headers are correctly configured.
- Try running with `--verbose` to see exactly where rumm is looking.

### Tailwind CSS issues
- If styles aren't applying, ensure your CSS file (e.g., `src/app.css`) is imported in your root `+layout.svelte`.
- For Tailwind v4, ensure you have `@import "tailwindcss";` at the top of your CSS file.

---

## License

MIT © [TheRaj71](https://github.com/TheRaj71)
