<p align="center">
  <img src="https://raw.githubusercontent.com/TheRaj71/Rum/main/assets/rum.png" alt="rum logo" width="120" />
</p>

<h1 align="center">rum</h1>

<p align="center">
  <strong>A delightful CLI for Svelte 5 component registry</strong>
</p>

<p align="center">
  Ship beautiful, accessible components with ease 🍹
</p>

<p align="center">
  <strong>⚠️ This project is unstable and intended for personal use only.</strong>
</p>

<p align="center">
  <a href="#installation">Installation</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#commands">Commands</a> •
  <a href="#creating-components">Creating Components</a> •
  <a href="#hosting-your-registry">Hosting</a> •
  <a href="#contributing">Contributing</a>
</p>

---

## What is rum?

rum is a CLI tool that lets you add beautifully designed Svelte 5 components directly into your project. Unlike traditional component libraries, rum doesn't install packages — it copies the source code into your project, giving you full ownership and the freedom to customize everything.

Inspired by [shadcn/ui](https://ui.shadcn.com), rum brings the same developer experience to the Svelte ecosystem with first-class support for:

- **Svelte 5** - Built with runes, snippets, and the latest Svelte features
- **Tailwind CSS v4** - Modern CSS-first configuration
- **TypeScript** - Full type safety out of the box
- **Accessibility** - Components follow WAI-ARIA guidelines

## Why rum?

**Own your components.** When you add a component with rum, you get the actual source code. No black-box dependencies, no version conflicts, no waiting for library updates.

**Customize everything.** Every component is yours to modify. Change colors, add features, remove what you don't need — it's your code.

**Stay up to date.** Components are built with the latest Svelte 5 patterns. No legacy code, no deprecated APIs.

**Works everywhere.** Add components from the official registry or any third-party registry via URL.

## Installation

rum works with any package manager. Install it globally or use it directly with `npx`/`pnpm dlx`:

```bash
# Using pnpm (recommended)
pnpm add -g rum

# Using npm
npm install -g rum

# Using bun
bun add -g rum

# Or use without installing
pnpm dlx rum add button
```

## Quick Start

### 1. Initialize your project

Navigate to your SvelteKit project and run:

```bash
rum init
```

This will:
- Create a `components.json` configuration file
- Add the `cn()` utility function to `src/lib/utils.ts`
- Inject CSS variables into your stylesheet

### 2. Add components

Add components by name from the official registry:

```bash
rum add button
rum add card
rum add button card dialog  # Add multiple at once
```

Or add from any URL:

```bash
rum add https://example.com/r/datepicker.json
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

That's it! The components are now part of your project.

## Commands

### `rum init`

Initialize your SvelteKit project for rum.

```bash
rum init [options]

Options:
  -c, --cwd <path>      Working directory (default: current directory)
  -s, --style <style>   Style/theme to use (default: "default")
  -f, --force           Force overwrite existing files
  -v, --verbose         Show verbose output
```

**What it does:**
- Detects your Svelte and Tailwind configuration
- Creates `components.json` with sensible defaults
- Adds the `cn()` helper for class merging
- Injects CSS variables for theming

### `rum add`

Add components to your project.

```bash
rum add <components...> [options]

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
rum add button

# Add multiple components
rum add button card dialog tooltip

# Add from a URL
rum add https://acme.dev/r/auth-form.json

# Add with auto-overwrite
rum add button --overwrite
```

**Auto-initialization:** If you haven't run `rum init`, the `add` command will automatically initialize your project when you add your first component.

### `rum build`

Build your component registry from source files.

```bash
rum build [options]

Options:
  -c, --cwd <path>       Working directory
  -s, --source <dir>     Source directory (default: "src/lib/registry")
  -o, --output <dir>     Output directory (default: "static/r")
  -n, --name <name>      Registry name
  --homepage <url>       Registry homepage URL
  -v, --verbose          Show verbose output
  --dry-run              Validate without writing files
```

**What it does:**
- Scans your registry source directory
- Extracts component metadata and dependencies
- Generates JSON files for each component
- Creates a `registry.json` index

### `rum serve`

Start a local server to test your registry.

```bash
rum serve [options]

Options:
  -c, --cwd <path>    Working directory
  -d, --dir <dir>     Directory with registry files (default: "static/r")
  -p, --port <port>   Port to listen on (default: 5555)
  -v, --verbose       Show verbose output
```

Perfect for testing your registry locally before deploying:

```bash
# In your registry project
rum build
rum serve

# In another project
rum add http://localhost:5555/button.json
```

## Configuration

rum uses a `components.json` file in your project root:

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

### Multiple Registries

You can configure multiple registries:

```json
{
  "registries": {
    "default": "https://rum.dev/r/registry.json",
    "acme": "https://acme.dev/r/registry.json",
    "internal": {
      "url": "https://internal.company.com/r/registry.json",
      "headers": {
        "Authorization": "Bearer ${REGISTRY_TOKEN}"
      }
    }
  }
}
```

Then specify which registry to use:

```bash
rum add button -r acme
```

## Creating Components

Want to create your own component registry? Here's how:

### Project Structure

```
my-registry/
├── src/lib/registry/
│   ├── ui/
│   │   ├── button/
│   │   │   ├── Button.svelte
│   │   │   └── index.ts
│   │   └── card/
│   │       ├── Card.svelte
│   │       ├── CardHeader.svelte
│   │       ├── CardContent.svelte
│   │       └── index.ts
│   └── hooks/
│       └── counter/
│           ├── counter.svelte.ts
│           └── index.ts
├── static/r/           # Generated registry files
└── package.json
```

### Component Example

```svelte
<!-- src/lib/registry/ui/button/Button.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { tv, type VariantProps } from 'tailwind-variants';

  const button = tv({
    base: 'inline-flex items-center justify-center rounded-md font-medium transition-colors',
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        outline: 'border border-input bg-background hover:bg-accent',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 px-3',
        lg: 'h-11 px-8',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  });

  type ButtonVariants = VariantProps<typeof button>;

  interface Props {
    variant?: ButtonVariants['variant'];
    size?: ButtonVariants['size'];
    class?: string;
    children: Snippet;
    onclick?: () => void;
  }

  let { variant, size, class: className, children, onclick }: Props = $props();
</script>

<button class={button({ variant, size, class: className })} {onclick}>
  {@render children()}
</button>
```

### Build and Serve

```bash
# Build the registry
rum build

# Start local server for testing
rum serve

# Test in another project
rum add http://localhost:5555/button.json
```

### Component Metadata

Add JSDoc comments to include metadata:

```svelte
<!--
  @name button
  @description A versatile button component with multiple variants
  @author Your Name
  @categories ui, forms
-->
```

Dependencies are auto-detected from imports, or you can specify them manually:

```svelte
<!--
  @dependencies tailwind-variants, clsx
  @registryDependencies icon
-->
```

## Hosting Your Registry

### Vercel (Recommended)

Deploy your SvelteKit app to Vercel. The `static/r/` folder is served automatically:

1. Push your code to GitHub
2. Import the repo in Vercel
3. Deploy

Your registry will be available at `https://your-app.vercel.app/r/registry.json`

### GitHub Pages

For static hosting:

1. Build your registry: `rum build`
2. Push `static/r/` to a `gh-pages` branch
3. Enable GitHub Pages in repo settings

### Cloudflare Pages

Similar to Vercel, with excellent global CDN performance.

### Custom Domain

Point your domain to any of the above services:
- `https://rum.dev/r/button.json`
- `https://components.yourcompany.com/r/button.json`

## Package Manager Support

rum works with all major package managers:

| Package Manager | Lock File | Install Command |
|----------------|-----------|-----------------|
| npm | `package-lock.json` | `npm install` |
| pnpm | `pnpm-lock.yaml` | `pnpm add` |
| yarn | `yarn.lock` | `yarn add` |
| bun | `bun.lockb` | `bun add` |

rum automatically detects your package manager and uses the correct install command.

## Tailwind CSS Support

rum supports both Tailwind CSS v3 and v4:

**Tailwind v3** - Detected via `tailwind.config.ts` or `tailwind.config.js`

**Tailwind v4** - Detected via CSS imports:
```css
@import 'tailwindcss';
```

## Svelte 5 Features

All components are built with Svelte 5 best practices:

- **Runes** - `$state`, `$derived`, `$effect` for reactive state
- **Snippets** - Type-safe content slots with `{@render}`
- **Props** - `$props()` for component properties
- **`.svelte.ts` files** - Shared reactive logic (hooks)
