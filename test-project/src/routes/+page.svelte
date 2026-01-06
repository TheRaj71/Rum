<script lang="ts">
	import { Button } from '$lib/components/button';
	import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '$lib/components/card';
</script>

<div class="container mx-auto p-8 space-y-8">
	<h1 class="text-3xl font-bold">Svelte Registry Test</h1>
	
	<section class="space-y-4">
		<h2 class="text-xl font-semibold">Button Component</h2>
		<div class="flex gap-4 flex-wrap">
			<Button>Default</Button>
			<Button variant="destructive">Destructive</Button>
			<Button variant="outline">Outline</Button>
			<Button variant="secondary">Secondary</Button>
			<Button variant="ghost">Ghost</Button>
			<Button variant="link">Link</Button>
		</div>
		<div class="flex gap-4">
			<Button size="sm">Small</Button>
			<Button size="default">Default</Button>
			<Button size="lg">Large</Button>
			<Button size="icon">🔥</Button>
		</div>
	</section>

	<section class="space-y-4">
		<h2 class="text-xl font-semibold">Card Component</h2>
		<Card class="max-w-md">
			<CardHeader>
				<CardTitle>Card Title</CardTitle>
				<CardDescription>Card description goes here</CardDescription>
			</CardHeader>
			<CardContent>
				<p>This is the card content. You can put anything here.</p>
			</CardContent>
			<CardFooter>
				<Button>Action</Button>
			</CardFooter>
		</Card>
	</section>
</div>
