<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils';

	interface Props extends HTMLAttributes<HTMLParagraphElement> {
		children?: Snippet;
		class?: string;
	}

	let { children, class: className, ...restProps }: Props = $props();
</script>

<p class={cn('text-sm text-muted-foreground', className)} {...restProps}>
	{@render children?.()}
</p>
