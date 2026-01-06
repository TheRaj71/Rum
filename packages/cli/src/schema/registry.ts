import { z } from 'zod';

/**
 * Registry Schema Definitions
 * Implements Zod schemas for registry validation as specified in Requirements 2.2, 2.6, 2.7, 2.8
 */

/**
 * FileTypeSchema - Enum for registry item types
 * Supports: registry:ui, registry:hook, registry:block, registry:lib, registry:component, registry:page, registry:file
 */
export const FileTypeSchema = z.enum([
  'registry:ui',
  'registry:hook',
  'registry:block',
  'registry:lib',
  'registry:component',
  'registry:page',
  'registry:file',
]);

/**
 * RegistryFileSchema - Schema for individual files within a registry item
 * Each file includes path, content, type, and target properties (Requirement 2.7)
 */
export const RegistryFileSchema = z.object({
  path: z.string().describe('Source path in registry'),
  content: z.string().describe('Raw file content'),
  type: FileTypeSchema,
  target: z.string().describe('Target path in consumer project'),
});

/**
 * CssVarsSchema - Schema for CSS variable theming configuration
 * Supports theme, light, and dark mode variables (Requirement 10.1)
 */
export const CssVarsSchema = z.object({
  theme: z.record(z.string()).optional(),
  light: z.record(z.string()).optional(),
  dark: z.record(z.string()).optional(),
});


/**
 * RegistryItemSchema - Schema for a single distributable unit
 * Includes name, type, files, and optional dependencies, registryDependencies, cssVars fields (Requirement 2.6)
 */
export const RegistryItemSchema = z.object({
  $schema: z.string().optional(),
  name: z.string().min(1),
  type: FileTypeSchema,
  title: z.string().optional(),
  description: z.string().optional(),
  author: z.string().optional(),
  dependencies: z.array(z.string()).optional(),
  registryDependencies: z.array(z.string()).optional(),
  files: z.array(RegistryFileSchema),
  cssVars: CssVarsSchema.optional(),
  docs: z.string().optional(),
  categories: z.array(z.string()).optional(),
  meta: z.record(z.unknown()).optional(),
});

/**
 * RegistrySchema - Root schema for the registry JSON
 * Includes $schema, name, homepage, and items array (Requirement 2.8)
 */
export const RegistrySchema = z.object({
  $schema: z.string().optional(),
  name: z.string().min(1),
  homepage: z.string().url().optional(),
  items: z.array(RegistryItemSchema),
});

// Type exports
export type FileType = z.infer<typeof FileTypeSchema>;
export type RegistryFile = z.infer<typeof RegistryFileSchema>;
export type CssVars = z.infer<typeof CssVarsSchema>;
export type RegistryItem = z.infer<typeof RegistryItemSchema>;
export type Registry = z.infer<typeof RegistrySchema>;
