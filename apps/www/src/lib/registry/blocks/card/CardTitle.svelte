<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils';

	interface Props extends HTMLAttributes<HTMLHeadingElement> {
		children?: Snippet;
		class?: string;
	}

	let { children, class: className, ...restProps }: Props = $props();
</script>

<h3 class={cn('font-semibold leading-none tracking-tight', className)} {...restProps}>
	{@render children?.()}
</h3>
