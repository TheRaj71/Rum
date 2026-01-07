<p align="center">
  <img src="https://raw.githubusercontent.com/TheRaj71/Rum/main/assets/logo.png" alt="rumm logo" width="1050" />
</p>

<h1 align="center">Rumm</h1>

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

```bash
# Using npm
npm install -g rumm

# Using pnpm
pnpm add -g rumm

# Using bun
bun add -g rumm

# Using yarn
yarn global add rumm

# Or use without installing
npx rumm add button
```

## Quick Start

### 1. Initialize your project

Navigate to your SvelteKit project and run:

```bash
rumm init
```

This will:
- Create a `components.json` configuration file
- Add the `cn()` utility function to `src/lib/utils.ts`
- Inject CSS variables into your stylesheet

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
```

### `rumm add`

Add components to your project.

```bash
rumm add <components...> [options]

Arguments:
  components    Component names or URLs to add

Options:
  -c, --cwd <path>          Working directory
  -o, --overwrite           Overwrite existing files without prompting
  -r, --registry <name>     Use a specific registry from your config
  -v, --verbose             Show verbose output
  --skip-install            Skip npm dependency installation
```

**Examples:**

```bash
# Add a single component
rumm add button

# Add multiple components
rumm add button card dialog tooltip

# Add from a URL
rumm add https://acme.dev/r/auth-form.json

# Add with auto-overwrite
rumm add button --overwrite
```

### `rumm build`

Build your component registry from source files.

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

### `rumm serve`

Start a local server to test your registry.

```bash
rumm serve [options]

Options:
  -c, --cwd <path>    Working directory
  -d, --dir <dir>     Directory with registry files (default: "static/r")
  -p, --port <port>   Port to listen on (default: 5555)
  -v, --verbose       Show verbose output
```

## Configuration

rumm uses a `components.json` file in your project root:

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
    "default": "https://rum.dev/r/registry.json"
  }
}
```

## Package Manager Support

rumm works with all major package managers:

| Package Manager | Install Command |
|----------------|-----------------|
| npm | `npm install -g rumm` |
| pnpm | `pnpm add -g rumm` |
| yarn | `yarn global add rumm` |
| bun | `bun add -g rumm` |

## Documentation

For full documentation, visit the [GitHub repository](https://github.com/TheRaj71/Rum).

## License

MIT © [TheRaj71](https://github.com/TheRaj71)
