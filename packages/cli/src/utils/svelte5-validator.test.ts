import { describe, it, expect } from 'vitest';
import {
  validateSvelte5Compliance,
  hasRunesUsage,
  hasLegacyPatterns,
  isRunesMode,
} from './svelte5-validator.js';

describe('validateSvelte5Compliance', () => {
  describe('runes detection', () => {
    it('should detect $state usage', () => {
      const content = `
<script>
  let count = $state(0);
</script>
<button>{count}</button>
`;
      const result = validateSvelte5Compliance(content);
      expect(result.runesDetected.$state).toBe(true);
      expect(result.isValid).toBe(true);
    });

    it('should detect $derived usage', () => {
      const content = `
<script>
  let count = $state(0);
  let doubled = $derived(count * 2);
</script>
`;
      const result = validateSvelte5Compliance(content);
      expect(result.runesDetected.$derived).toBe(true);
    });

    it('should detect $effect usage', () => {
      const content = `
<script>
  let count = $state(0);
  $effect(() => {
    console.log(count);
  });
</script>
`;
      const result = validateSvelte5Compliance(content);
      expect(result.runesDetected.$effect).toBe(true);
    });

    it('should detect $props usage', () => {
      const content = `
<script>
  let { name, value } = $props();
</script>
`;
      const result = validateSvelte5Compliance(content);
      expect(result.runesDetected.$props).toBe(true);
    });

    it('should detect $bindable usage', () => {
      const content = `
<script>
  let { value = $bindable() } = $props();
</script>
`;
      const result = validateSvelte5Compliance(content);
      expect(result.runesDetected.$bindable).toBe(true);
    });

    it('should detect $state.raw usage', () => {
      const content = `
<script>
  let items = $state.raw([1, 2, 3]);
</script>
`;
      const result = validateSvelte5Compliance(content);
      expect(result.runesDetected.$state).toBe(true);
    });

    it('should detect $derived.by usage', () => {
      const content = `
<script>
  let count = $state(0);
  let doubled = $derived.by(() => count * 2);
</script>
`;
      const result = validateSvelte5Compliance(content);
      expect(result.runesDetected.$derived).toBe(true);
    });
  });

  describe('legacy pattern detection', () => {
    it('should detect export let (legacy props)', () => {
      const content = `
<script>
  export let name;
  export let value = 'default';
</script>
`;
      const result = validateSvelte5Compliance(content);
      expect(result.legacyPatternsDetected.exportLet.length).toBe(2);
      expect(result.legacyPatternsDetected.exportLet[0].name).toBe('name');
      expect(result.legacyPatternsDetected.exportLet[1].name).toBe('value');
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should detect reactive statements ($:)', () => {
      const content = `
<script>
  let count = 0;
  $: doubled = count * 2;
  $: console.log(count);
</script>
`;
      const result = validateSvelte5Compliance(content);
      expect(result.legacyPatternsDetected.reactiveStatements.length).toBe(2);
      expect(result.isValid).toBe(false);
    });

    it('should detect createEventDispatcher', () => {
      const content = `
<script>
  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher();
</script>
`;
      const result = validateSvelte5Compliance(content);
      expect(result.legacyPatternsDetected.createEventDispatcher).toBe(true);
      expect(result.isValid).toBe(false);
    });

    it('should detect <slot> elements using AST', () => {
      const content = `
<script>
  let { children } = $props();
</script>
<div>
  <slot />
</div>
`;
      const result = validateSvelte5Compliance(content);
      expect(result.legacyPatternsDetected.slots.length).toBe(1);
      expect(result.isValid).toBe(false);
    });

    it('should detect named slots using AST', () => {
      const content = `
<div>
  <slot name="header" />
  <slot />
  <slot name="footer" />
</div>
`;
      const result = validateSvelte5Compliance(content);
      expect(result.legacyPatternsDetected.slots.length).toBe(3);
      const namedSlots = result.legacyPatternsDetected.slots.filter((s) => s.isNamed);
      expect(namedSlots.length).toBe(2);
      expect(namedSlots[0].name).toBe('header');
      expect(namedSlots[1].name).toBe('footer');
    });

    it('should detect on: directives using AST', () => {
      const content = `
<button on:click={handleClick}>Click</button>
<input on:input={handleInput} on:focus={handleFocus} />
`;
      const result = validateSvelte5Compliance(content);
      expect(result.legacyPatternsDetected.onDirectives.length).toBe(3);
      expect(result.isValid).toBe(false);
    });

    it('should detect on: directives with modifiers', () => {
      const content = `
<button on:click|preventDefault={handleClick}>Click</button>
<form on:submit|preventDefault|stopPropagation={handleSubmit}>
</form>
`;
      const result = validateSvelte5Compliance(content);
      expect(result.legacyPatternsDetected.onDirectives.length).toBe(2);
      expect(result.legacyPatternsDetected.onDirectives[0].modifiers).toContain('preventDefault');
      expect(result.legacyPatternsDetected.onDirectives[1].modifiers).toContain('stopPropagation');
    });
  });

  describe('valid Svelte 5 components', () => {
    it('should validate a proper Svelte 5 component', () => {
      const content = `
<script lang="ts">
  let { name, onclick }: { name: string; onclick: () => void } = $props();
  let count = $state(0);
  let doubled = $derived(count * 2);
  
  $effect(() => {
    console.log('Count changed:', count);
  });
</script>

<button {onclick}>
  {name}: {count} (doubled: {doubled})
</button>
`;
      const result = validateSvelte5Compliance(content);
      expect(result.isValid).toBe(true);
      expect(result.errors.length).toBe(0);
      expect(result.runesDetected.$state).toBe(true);
      expect(result.runesDetected.$derived).toBe(true);
      expect(result.runesDetected.$effect).toBe(true);
      expect(result.runesDetected.$props).toBe(true);
    });

    it('should validate component with snippets', () => {
      const content = `
<script>
  let { header, children } = $props();
</script>

<div>
  {@render header?.()}
  {@render children?.()}
</div>
`;
      const result = validateSvelte5Compliance(content);
      expect(result.isValid).toBe(true);
    });

    it('should validate component with event attributes', () => {
      const content = `
<script>
  let count = $state(0);
</script>

<button onclick={() => count++}>
  Count: {count}
</button>
`;
      const result = validateSvelte5Compliance(content);
      expect(result.isValid).toBe(true);
    });
  });

  describe('compiler metadata', () => {
    it('should detect runes mode from compiler', () => {
      const content = `
<script>
  let count = $state(0);
</script>
<p>{count}</p>
`;
      const result = validateSvelte5Compliance(content);
      expect(result.compilerMetadata?.runes).toBe(true);
    });

    it('should detect non-runes mode for legacy code', () => {
      const content = `
<script>
  let count = 0;
</script>
<p>{count}</p>
`;
      const result = validateSvelte5Compliance(content);
      expect(result.compilerMetadata?.runes).toBe(false);
    });
  });

  describe('error messages', () => {
    it('should provide helpful suggestions for export let', () => {
      const content = `
<script>
  export let name;
</script>
`;
      const result = validateSvelte5Compliance(content);
      const error = result.errors.find((e) => e.message.includes('export let'));
      expect(error).toBeDefined();
      expect(error?.suggestion).toContain('$props()');
    });

    it('should provide helpful suggestions for reactive statements', () => {
      const content = `
<script>
  let count = 0;
  $: doubled = count * 2;
</script>
`;
      const result = validateSvelte5Compliance(content);
      const error = result.errors.find((e) => e.message.includes('$:'));
      expect(error).toBeDefined();
      expect(error?.suggestion).toContain('$derived');
    });

    it('should provide helpful suggestions for slots', () => {
      const content = `
<div>
  <slot />
</div>
`;
      const result = validateSvelte5Compliance(content);
      const error = result.errors.find((e) => e.message.includes('slot'));
      expect(error).toBeDefined();
      expect(error?.suggestion).toContain('snippet');
    });

    it('should include line information', () => {
      const content = `
<script>
  export let name;
</script>
`;
      const result = validateSvelte5Compliance(content);
      const error = result.errors[0];
      expect(error.line).toBeDefined();
      expect(error.line).toBeGreaterThan(0);
    });
  });
});

describe('hasRunesUsage', () => {
  it('should return true when runes are used', () => {
    const content = `
<script>
  let count = $state(0);
</script>
`;
    expect(hasRunesUsage(content)).toBe(true);
  });

  it('should return false when no runes are used', () => {
    const content = `
<script>
  let count = 0;
</script>
`;
    expect(hasRunesUsage(content)).toBe(false);
  });

  it('should return false for files without script', () => {
    const content = `<div>Hello</div>`;
    expect(hasRunesUsage(content)).toBe(false);
  });
});

describe('hasLegacyPatterns', () => {
  it('should return true when legacy patterns exist', () => {
    const content = `
<script>
  export let name;
</script>
`;
    expect(hasLegacyPatterns(content)).toBe(true);
  });

  it('should return false for Svelte 5 compliant code', () => {
    const content = `
<script>
  let { name } = $props();
</script>
`;
    expect(hasLegacyPatterns(content)).toBe(false);
  });
});

describe('isRunesMode', () => {
  it('should return true for runes mode code', () => {
    const content = `
<script>
  let count = $state(0);
</script>
`;
    expect(isRunesMode(content)).toBe(true);
  });

  it('should return false for legacy mode code', () => {
    const content = `
<script>
  let count = 0;
</script>
`;
    expect(isRunesMode(content)).toBe(false);
  });

  it('should return null for invalid code', () => {
    const content = `<script>invalid syntax {{{{</script>`;
    expect(isRunesMode(content)).toBe(null);
  });
});
