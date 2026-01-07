<p align="center">
  <img src="https://raw.githubusercontent.com/TheRaj71/Rum/main/assets/logo.png" alt="rum logo" width="1020" />
</p>

<h1 align="center">Rumm</h1>

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
  <a href="#component-resolution">Resolution</a> •
  <a href="#creating-components">Creating Components</a> •
  <a href="#hosting-your-registry">Hosting</a> •
  <a href="#packages">Packages</a> •
  <a href="#contributing">Contributing</a>
</p>

---

## What is Rumm?

Rumm is a comprehensive component registry system for Svelte 5, inspired by [shadcn/ui](https://ui.shadcn.com). Unlike traditional component libraries, Rumm doesn't install packages — it copies source code into your project, giving you full ownership and the freedom to customize everything.

### ✨ Key Features

- **Smart Resolution** - Name-based lookup with shadcn/ui-style registry search
- **Clean Installation** - Components install to `$lib/components/` without nested prefixes
- **Svelte 5 First** - Built with runes, snippets, and the latest Svelte features
- **TypeScript Ready** - Full type safety with generated `.d.ts` files
- **Tailwind CSS v4** - Modern CSS-first configuration with `@tailwindcss/vite`
- **Registry Based** - Decentralized component distribution
- **Multi-Package** - Monorepo structure with CLI and web components
- **Developer Experience** - Fast, intuitive CLI with excellent error handling

### 🏗️ Architecture

Rumm consists of three main packages:

| Package | Description | Status |
|---------|-------------|--------|
| [`@svelte-registry/cli`](./packages/cli/) | Command-line interface for component management | Stable |
| [`@svelte-registry/www`](./apps/www/) | Web application serving the component registry | Stable |
| [`svelte-registry`](./) | Root monorepo with shared configuration | Meta-package |

---

## Installation

### Prerequisites

- **Node.js** >= 18.0.0
- **pnpm** >= 8.0.0 (recommended) or npm/yarn/bun

### Global Installation

Install the CLI globally:

```bash
# Using pnpm (recommended)
pnpm add -g rumm

# Using npm
npm install -g rumm

# Using yarn
yarn global add rumm

# Using bun
bun add -g rumm
```

### Local Development

Clone and set up the monorepo:

```bash
git clone https://github.com/TheRaj71/Rum.git
cd Rum
pnpm install
pnpm build
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
rumm add button card counter  # Add multiple at once
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

That's it! The components are now part of your project.

## Component Resolution

Rumm implements a sophisticated component resolution system inspired by shadcn/ui:

### Resolution Priority

1. **Direct URL** → Fetch immediately
   ```bash
   rumm add https://example.com/r/button.json
   ```

2. **Namespaced Reference** → Use specific registry
   ```bash
   rumm add @acme/button  # → acme registry only
   ```

3. **Name-based Search** → Lookup in `registry.json`
   ```bash
   rumm add button  # → search items array in registry.json
   ```

4. **Fallback Pattern** → Try `/r/{name}.json`
   ```bash
   rumm add button  # → fetch /r/button.json
   ```

### Smart Registry Search

When you run `rumm add button`, Rumm:

1. **Fetches `registry.json`** from your configured registry
2. **Searches the `items` array** using `.find(item => item.name === 'button')`
3. **Returns the component** if found
4. **Provides suggestions** if not found using Levenshtein distance

### Installation Paths

Components install to clean, predictable paths:

```
src/lib/
├── components/
│   ├── button/        # UI components
│   │   ├── Button.svelte
│   │   └── index.ts
│   └── card/          # Multi-file components
│       ├── Card.svelte
│       ├── CardHeader.svelte
│       └── index.ts
└── hooks/
    └── counter/       # Reactive hooks
        ├── counter.svelte.ts
        └── index.ts
```

**No nested prefixes** like `default/ui/button/` - just clean, logical paths!

## Commands

### `rumm init`

Initialize your SvelteKit project for Rumm.

```bash
rumm init [options]

Options:
  -c, --cwd <path>      Working directory (default: current directory)
  -s, --style <style>   Style/theme to use (default: "default")
  -f, --force           Force overwrite existing files
  -v, --verbose         Show verbose output
  --registry <url>      Custom registry URL (default: https://rumcli.pages.dev/r/registry.json)
```

**What it does:**
- Detects your Svelte and Tailwind configuration
- Creates `components.json` with sensible defaults
- Adds the `cn()` helper for class merging
- Injects CSS variables for theming

### `rumm add`

Add components to your project.

```bash
rumm add <components...> [options]

Arguments:
  components    Component names, URLs, or namespaced references

Options:
  -c, --cwd <path>          Working directory
  -o, --overwrite           Overwrite existing files without prompting
  -r, --registry <name>     Use a specific registry from your config
  -v, --verbose             Show verbose output
  --skip-install            Skip npm dependency installation
  --yes                     Skip confirmation prompts
```

**Examples:**

```bash
# Add by name (smart resolution)
rumm add button

# Add multiple components
rumm add button card dialog tooltip

# Add from URL
rumm add https://acme.dev/r/auth-form.json

# Add with namespaced reference
rumm add @acme/button

# Add from specific registry
rumm add button -r acme

# Force overwrite
rumm add button --overwrite

# Skip dependency installation
rumm add button --skip-install
```

**Auto-initialization:** If you haven't run `rumm init`, the `add` command will automatically initialize your project when you add your first component.

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

**What it does:**
- Scans your registry source directory recursively
- Parses component metadata from JSDoc comments
- Auto-detects npm dependencies from imports
- Generates JSON files for each component
- Creates a `registry.json` index with component metadata
- Computes content hashes for change detection

**Build Process:**
1. **File Discovery**: Recursively scan source directory
2. **Component Grouping**: Group files by component name
3. **Metadata Extraction**: Parse JSDoc comments and imports
4. **Dependency Analysis**: Detect npm and registry dependencies
5. **Schema Validation**: Validate against Zod schemas
6. **JSON Generation**: Write component and registry JSON files

**Examples:**
```bash
# Basic build
rumm build

# Custom source/output
rumm build -s src/components -o dist/registry

# Dry run for validation
rumm build --dry-run --verbose

# Build with custom name
rumm build -n "my-components" --homepage "https://my-site.com"
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

**Features:**
- Serves registry JSON files over HTTP
- CORS enabled for cross-origin requests
- Automatic content-type detection
- Directory listing for debugging

**Examples:**
```bash
# Serve on default port
rumm serve

# Serve on custom port
rumm serve -p 3000

# Serve from custom directory
rumm serve -d dist/registry

# Test in another terminal
curl http://localhost:5555/registry.json
```

## Configuration

Rumm uses a `components.json` file in your project root:

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

### Configuration Schema

#### `style` (string)
Default style/theme to use. Currently only "default" is supported.

#### `tailwind` (object)
Tailwind CSS configuration:
- `config`: Path to Tailwind config file
- `css`: Path to CSS file where variables are injected
- `baseColor`: Base color scheme (slate, gray, zinc, etc.)

#### `aliases` (object)
SvelteKit path aliases:
- `components`: Where UI components are installed
- `utils`: Where utility functions are placed
- `hooks`: Where reactive hooks are installed
- `lib`: General lib directory

#### `registries` (record)
Registry URL mappings. Each registry can be:
- **Simple URL**: `"default": "https://example.com/r/registry.json"`
- **URL with headers**: `"private": {"url": "...", "headers": {"Authorization": "Bearer token"}}`
- **URL template**: `"template": "https://example.com/r/{name}.json"`

### Multiple Registries

Configure multiple registries for different sources:

```json
{
  "registries": {
    "default": "https://rumcli.pages.dev/r/registry.json",
    "acme": "https://acme.dev/r/registry.json",
    "internal": {
      "url": "https://internal.company.com/r/registry.json",
      "headers": {
        "Authorization": "Bearer ${REGISTRY_TOKEN}"
      }
    },
    "template": "https://cdn.example.com/{name}.json"
  }
}
```

**Usage:**
```bash
rumm add button              # Uses default registry
rumm add button -r acme      # Uses acme registry
rumm add @acme/button        # Namespaced reference
```

## Creating Components

Want to create your own component registry? Here's how:

### Project Structure

```
my-registry/
├── src/lib/registry/
│   ├── default/           # Style/theme directory
│   │   ├── ui/            # UI components (buttons, cards, etc.)
│   │   │   ├── button/
│   │   │   │   ├── Button.svelte
│   │   │   │   └── index.ts
│   │   │   └── card/
│   │   │       ├── Card.svelte
│   │   │       ├── CardHeader.svelte
│   │   │       ├── CardContent.svelte
│   │   │       └── index.ts
│   │   └── hooks/         # Reactive hooks
│   │       └── counter/
│   │           ├── counter.svelte.ts
│   │           └── index.ts
│   └── .gitkeep
├── static/r/              # Generated registry JSON files
│   ├── registry.json      # Registry index
│   ├── button.json        # Individual component
│   └── card.json
├── package.json
├── components.json        # Rumm configuration
└── svelte.config.js
```

### Component Types

Rumm supports different component types:

#### UI Components
Located in `src/lib/registry/default/ui/`, these are single or multi-file Svelte components:

```
ui/button/
├── Button.svelte      # Main component
└── index.ts          # Exports
```

#### Block Components
Located in `src/lib/registry/default/ui/`, these are complex multi-file components:

```
ui/card/
├── Card.svelte
├── CardHeader.svelte
├── CardContent.svelte
├── CardFooter.svelte
├── CardTitle.svelte
├── CardDescription.svelte
└── index.ts
```

#### Hook Components
Located in `src/lib/registry/default/hooks/`, these are reactive utilities:

```
hooks/counter/
├── counter.svelte.ts  # Reactive hook
└── index.ts          # Exports
```

### Component Example

```svelte
<!-- src/lib/registry/default/ui/button/Button.svelte -->
<script lang="ts">
  import { tv, type VariantProps } from 'tailwind-variants';
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';

  const buttonVariants = tv({
    base: 'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
        outline: 'border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-10 rounded-md px-8',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  });

  type ButtonVariants = VariantProps<typeof buttonVariants>;

  interface Props extends HTMLButtonAttributes {
    variant?: ButtonVariants['variant'];
    size?: ButtonVariants['size'];
    children?: Snippet;
    class?: string;
  }

  let {
    variant = 'default',
    size = 'default',
    children,
    class: className,
    ...restProps
  }: Props = $props();
</script>

<button class={buttonVariants({ variant, size, class: className })} {...restProps}>
  {@render children?.()}
</button>
```

### Hook Example

```typescript
// src/lib/registry/default/hooks/counter/counter.svelte.ts
interface CounterOptions {
  initial?: number;
  min?: number;
  max?: number;
  step?: number;
}

interface Counter {
  readonly count: number;
  increment: () => void;
  decrement: () => void;
  reset: () => void;
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
    },
  };
}
```

### Build and Serve

```bash
# Build the registry
rumm build

# Start local server for testing
rumm serve

# Test in another project
rumm add http://localhost:5555/button.json
```

### Component Metadata

Add JSDoc comments to include metadata:

```svelte
<!--
  @name button
  @description A versatile button component with multiple variants
  @author Rumm Team
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

### Cloudflare Pages

Similar to Vercel, with excellent global CDN performance.

### GitHub Pages

For static hosting:

1. Build your registry: `rum build`
2. Push `static/r/` to a `gh-pages` branch
3. Enable GitHub Pages in repo settings

### Custom Domain

Point your domain to any of the above services:
- `https://rum.dev/r/button.json`
- `https://components.yourcompany.com/r/button.json`

## Technology Stack

### Core Technologies

- **Svelte 5** - Latest Svelte with runes and snippets
- **TypeScript** - Full type safety throughout
- **Tailwind CSS v4** - Modern CSS framework
- **Node.js** - Server-side runtime
- **Vite** - Fast build tool and dev server

### Key Dependencies

| Package | Purpose | Version |
|---------|---------|---------|
| `svelte` | UI framework | `^5.0.0` |
| `zod` | Schema validation | `^3.25.67` |
| `commander` | CLI framework | `^13.1.0` |
| `tailwind-variants` | Component variants | `^3.2.2` |
| `clsx` + `tailwind-merge` | Class utilities | `^2.1.1` + `^3.3.1` |

## Package Manager Support

Rumm automatically detects and works with all major package managers:

| Package Manager | Lock File | Install Command | Global Install |
|----------------|-----------|-----------------|----------------|
| npm | `package-lock.json` | `npm install` | `npm install -g rumm` |
| pnpm | `pnpm-lock.yaml` | `pnpm add` | `pnpm add -g rumm` |
| yarn | `yarn.lock` | `yarn add` | `yarn global add rumm` |
| bun | `bun.lockb` | `bun add` | `bun add -g rumm` |

## Development

### Monorepo Setup

This project uses pnpm workspaces:

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Start development servers
pnpm dev

# CLI development
pnpm --filter rumm run dev

# Web app development
pnpm --filter @svelte-registry/www run dev
```

### Development Commands

```bash
# Development server
pnpm dev

# Build for production
pnpm build

# Preview production build
pnpm preview

# Build component registry
pnpm registry:build

# Serve registry locally (for testing)
pnpm dev:server

# Type checking
pnpm check

# Linting
pnpm lint

# Formatting
pnpm format
```

### Testing

```bash
# Run all tests
pnpm test

# Run CLI tests
pnpm --filter rumm run test

# Run with coverage
pnpm test --coverage
```

### Code Quality

- **TypeScript**: Strict mode enabled
- **ESLint**: Configured for Svelte and TypeScript
- **Prettier**: Code formatting
- **Vitest**: Unit testing with 100% coverage goal

## Packages

### 📦 `@svelte-registry/cli`

The command-line interface for Rumm. Install globally or use with `npx`.

**Features:**
- Component installation and management
- Registry building and serving
- Project initialization
- TypeScript-first with full type safety

**Installation:**
```bash
pnpm add -g rumm
```

### 🌐 `@svelte-registry/www`

Web application that serves the component registry.

**Features:**
- SvelteKit-based web interface
- Component documentation and examples
- Registry API endpoints
- Static generation for fast hosting

**Development:**
```bash
pnpm --filter @svelte-registry/www run dev
```

## Contributing

We welcome contributions! Please see our [Contributing Guide](./CONTRIBUTING.md) for details.

### Development Workflow

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes
4. Add tests for new functionality
5. Run the test suite: `pnpm test`
6. Submit a pull request

### Code Quality

- **TypeScript**: Strict mode enabled
- **ESLint**: Configured for Svelte and TypeScript
- **Prettier**: Code formatting
- **Vitest**: Unit testing with 100% coverage goal

## Acknowledgments

- Inspired by [shadcn/ui](https://ui.shadcn.com)
- Built with [Svelte](https://svelte.dev) and [SvelteKit](https://kit.svelte.dev)
- Uses [Tailwind CSS](https://tailwindcss.com) for styling
- CLI framework by [Commander.js](https://github.com/tj/commander.js)

## License

MIT © [TheRaj71](https://github.com/TheRaj71)

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

That's it! The components are now part of your project.

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

**What it does:**
- Detects your Svelte and Tailwind configuration
- Creates `components.json` with sensible defaults
- Adds the `cn()` helper for class merging
- Injects CSS variables for theming

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

**Auto-initialization:** If you haven't run `rumm init`, the `add` command will automatically initialize your project when you add your first component.

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

**What it does:**
- Scans your registry source directory
- Extracts component metadata and dependencies
- Generates JSON files for each component
- Creates a `registry.json` index

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

Perfect for testing your registry locally before deploying:

```bash
# In your registry project
rumm build
rumm serve

# In another project
rumm add http://localhost:5555/button.json
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
rumm add button -r acme
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
rumm build

# Start local server for testing
rumm serve

# Test in another project
rumm add http://localhost:5555/button.json
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

rumm works with all major package managers:

| Package Manager | Lock File | Install Command |
|----------------|-----------|-----------------|
| npm | `package-lock.json` | `npm install` |
| pnpm | `pnpm-lock.yaml` | `pnpm add` |
| yarn | `yarn.lock` | `yarn add` |
| bun | `bun.lockb` | `bun add` |

rumm automatically detects your package manager and uses the correct install command.

## Tailwind CSS Support

rumm supports both Tailwind CSS v3 and v4:

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
