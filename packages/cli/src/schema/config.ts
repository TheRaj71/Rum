import { z } from 'zod';

/**
 * Component Config Schema Definitions
 * Implements Zod schemas for components.json configuration (Requirements 4.4, 6.1, 6.6)
 */

/**
 * RegistryConfigSchema - Schema for registry URL configuration
 * Supports both simple URL strings and objects with URL and headers (Requirement 6.6)
 */
export const RegistryConfigSchema = z.union([
  z.string().url(),
  z.object({
    url: z.string(),
    headers: z.record(z.string()).optional(),
  }),
]);

/**
 * TailwindConfigSchema - Schema for Tailwind CSS configuration
 */
export const TailwindConfigSchema = z.object({
  config: z.string(),
  css: z.string(),
  baseColor: z.string().optional(),
});

/**
 * AliasesSchema - Schema for path aliases configuration
 */
export const AliasesSchema = z.object({
  components: z.string(),
  utils: z.string(),
  hooks: z.string().optional(),
  lib: z.string().optional(),
});

/**
 * ComponentConfigSchema - Schema for components.json configuration file
 * Stores style, tailwind config, path aliases, and registry URLs (Requirements 4.4, 6.1)
 */
export const ComponentConfigSchema = z.object({
  $schema: z.string().optional(),
  style: z.string().default('default'),
  tailwind: TailwindConfigSchema,
  aliases: AliasesSchema,
  registries: z.record(RegistryConfigSchema).default({
    default: 'https://rumcli.pages.dev/r/registry.json',
  }),
});

// Type exports
export type RegistryConfig = z.infer<typeof RegistryConfigSchema>;
export type TailwindConfig = z.infer<typeof TailwindConfigSchema>;
export type Aliases = z.infer<typeof AliasesSchema>;
export type ComponentConfig = z.infer<typeof ComponentConfigSchema>;
