/**
 * Svelte 5 Compliance Validator
 *
 * Uses the official Svelte compiler to parse and validate .svelte files.
 * Validates that components follow Svelte 5 patterns:
 * - Uses runes ($state, $derived, $effect, $props)
 * - Does NOT use legacy patterns (export let, $:, createEventDispatcher, <slot>)
 * - Uses snippets instead of slots
 * - Uses $props() pattern for prop definition
 */

import { parse, compile } from 'svelte/compiler';
import type { AST } from 'svelte/compiler';
import type {
  Node as ESTreeNode,
  ExportNamedDeclaration,
  VariableDeclaration,
  LabeledStatement,
  ImportDeclaration,
  CallExpression,
  Identifier,
} from 'estree';

// ============================================================================
// Types
// ============================================================================

export interface Svelte5ValidationResult {
  isValid: boolean;
  runesDetected: RunesDetected;
  legacyPatternsDetected: LegacyPatternsDetected;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  compilerMetadata?: {
    runes: boolean;
  };
}

export interface RunesDetected {
  $state: boolean;
  $derived: boolean;
  $effect: boolean;
  $props: boolean;
  $bindable: boolean;
  $inspect: boolean;
  $host: boolean;
}

export interface LegacyPatternsDetected {
  exportLet: ExportLetMatch[];
  reactiveStatements: ReactiveStatementMatch[];
  createEventDispatcher: boolean;
  slots: SlotMatch[];
  onDirectives: OnDirectiveMatch[];
}

export interface ExportLetMatch {
  line: number;
  column: number;
  name: string;
}

export interface ReactiveStatementMatch {
  line: number;
  column: number;
}

export interface SlotMatch {
  line: number;
  column: number;
  isNamed: boolean;
  name?: string;
}

export interface OnDirectiveMatch {
  line: number;
  column: number;
  eventName: string;
  modifiers: string[];
}

export interface ValidationError {
  type: 'legacy-pattern' | 'parse-error';
  message: string;
  line?: number;
  column?: number;
  suggestion?: string;
}

export interface ValidationWarning {
  type: 'missing-rune' | 'potential-issue' | 'compiler-warning';
  message: string;
  line?: number;
  column?: number;
  suggestion?: string;
}

// ============================================================================
// Rune names - single source of truth
// ============================================================================

const RUNE_NAMES = ['$state', '$derived', '$effect', '$props', '$bindable', '$inspect', '$host'] as const;
type RuneName = (typeof RUNE_NAMES)[number];

// ============================================================================
// AST Walking Utilities
// ============================================================================

/**
 * Walk the Svelte template AST
 */
function walkSvelteAst(
  node: AST.SvelteNode | AST.Fragment | null | undefined,
  callback: (node: AST.SvelteNode) => void
): void {
  if (!node) return;

  if ('type' in node) {
    callback(node as AST.SvelteNode);
  }

  // Walk all possible child properties
  const childProps = [
    'fragment',
    'nodes',
    'attributes',
    'body',
    'consequent',
    'alternate',
    'pending',
    'then',
    'catch',
    'fallback',
  ] as const;

  for (const prop of childProps) {
    const child = (node as unknown as Record<string, unknown>)[prop];
    if (Array.isArray(child)) {
      for (const item of child) {
        walkSvelteAst(item as AST.SvelteNode, callback);
      }
    } else if (child && typeof child === 'object') {
      walkSvelteAst(child as AST.SvelteNode, callback);
    }
  }
}

/**
 * Walk the ESTree JavaScript AST
 */
function walkJsAst(node: ESTreeNode | null | undefined, callback: (node: ESTreeNode) => void): void {
  if (!node || typeof node !== 'object') return;

  callback(node);

  for (const key of Object.keys(node)) {
    const child = (node as unknown as Record<string, unknown>)[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item === 'object' && 'type' in item) {
          walkJsAst(item as ESTreeNode, callback);
        }
      }
    } else if (child && typeof child === 'object' && 'type' in child) {
      walkJsAst(child as ESTreeNode, callback);
    }
  }
}

// ============================================================================
// Detection Functions using AST
// ============================================================================

/**
 * Detect runes usage from the JavaScript AST
 */
function detectRunesFromAst(ast: AST.Root): RunesDetected {
  const detected: RunesDetected = {
    $state: false,
    $derived: false,
    $effect: false,
    $props: false,
    $bindable: false,
    $inspect: false,
    $host: false,
  };

  const scriptContent = ast.instance?.content;
  if (!scriptContent) return detected;

  walkJsAst(scriptContent as unknown as ESTreeNode, (node) => {
    // Check for rune calls: $state(), $derived(), etc.
    if (node.type === 'CallExpression') {
      const callExpr = node as CallExpression;
      if (callExpr.callee.type === 'Identifier') {
        const name = (callExpr.callee as Identifier).name as RuneName;
        if (name in detected) {
          detected[name] = true;
        }
      }
      // Check for $state.raw(), $derived.by(), etc.
      if (callExpr.callee.type === 'MemberExpression') {
        const memberExpr = callExpr.callee;
        if (memberExpr.object.type === 'Identifier') {
          const name = (memberExpr.object as Identifier).name as RuneName;
          if (name in detected) {
            detected[name] = true;
          }
        }
      }
    }
  });

  return detected;
}

/**
 * Detect export let declarations from the JavaScript AST
 */
function detectExportLetFromAst(ast: AST.Root): ExportLetMatch[] {
  const matches: ExportLetMatch[] = [];
  const scriptContent = ast.instance?.content;
  if (!scriptContent) return matches;

  walkJsAst(scriptContent as unknown as ESTreeNode, (node) => {
    if (node.type === 'ExportNamedDeclaration') {
      const exportDecl = node as ExportNamedDeclaration;
      if (exportDecl.declaration?.type === 'VariableDeclaration') {
        const varDecl = exportDecl.declaration as VariableDeclaration;
        if (varDecl.kind === 'let') {
          for (const declarator of varDecl.declarations) {
            if (declarator.id.type === 'Identifier') {
              matches.push({
                line: exportDecl.loc?.start.line ?? 0,
                column: exportDecl.loc?.start.column ?? 0,
                name: declarator.id.name,
              });
            }
          }
        }
      }
    }
  });

  return matches;
}

/**
 * Detect reactive statements ($:) from the JavaScript AST
 */
function detectReactiveStatementsFromAst(ast: AST.Root): ReactiveStatementMatch[] {
  const matches: ReactiveStatementMatch[] = [];
  const scriptContent = ast.instance?.content;
  if (!scriptContent) return matches;

  walkJsAst(scriptContent as unknown as ESTreeNode, (node) => {
    if (node.type === 'LabeledStatement') {
      const labeled = node as LabeledStatement;
      if (labeled.label.name === '$') {
        matches.push({
          line: labeled.loc?.start.line ?? 0,
          column: labeled.loc?.start.column ?? 0,
        });
      }
    }
  });

  return matches;
}

/**
 * Detect createEventDispatcher import/usage from the JavaScript AST
 */
function detectCreateEventDispatcherFromAst(ast: AST.Root): boolean {
  const scriptContent = ast.instance?.content;
  if (!scriptContent) return false;

  let found = false;
  walkJsAst(scriptContent as unknown as ESTreeNode, (node) => {
    // Check imports
    if (node.type === 'ImportDeclaration') {
      const importDecl = node as ImportDeclaration;
      if (importDecl.source.value === 'svelte') {
        for (const specifier of importDecl.specifiers) {
          if (
            specifier.type === 'ImportSpecifier' &&
            specifier.imported.type === 'Identifier' &&
            specifier.imported.name === 'createEventDispatcher'
          ) {
            found = true;
          }
        }
      }
    }
    // Check calls
    if (node.type === 'CallExpression') {
      const callExpr = node as CallExpression;
      if (callExpr.callee.type === 'Identifier' && callExpr.callee.name === 'createEventDispatcher') {
        found = true;
      }
    }
  });

  return found;
}


/**
 * Detect <slot> elements from the Svelte template AST
 */
function detectSlotsFromAst(ast: AST.Root): SlotMatch[] {
  const matches: SlotMatch[] = [];

  walkSvelteAst(ast, (node) => {
    if (node.type === 'SlotElement') {
      const slotNode = node as AST.SlotElement;

      // Find name attribute
      const nameAttr = slotNode.attributes.find(
        (attr): attr is AST.Attribute => attr.type === 'Attribute' && attr.name === 'name'
      );

      let name: string | undefined;
      if (nameAttr && nameAttr.value !== true && Array.isArray(nameAttr.value)) {
        const textNode = nameAttr.value.find((v): v is AST.Text => v.type === 'Text');
        name = textNode?.data;
      }

      matches.push({
        line: slotNode.start, // Will be converted to line/col later if needed
        column: 0,
        isNamed: !!name,
        name,
      });
    }
  });

  return matches;
}

/**
 * Detect on: directives from the Svelte template AST
 */
function detectOnDirectivesFromAst(ast: AST.Root): OnDirectiveMatch[] {
  const matches: OnDirectiveMatch[] = [];

  walkSvelteAst(ast, (node) => {
    if (node.type === 'OnDirective') {
      const onNode = node as AST.OnDirective;
      matches.push({
        line: onNode.start, // Will be converted to line/col later if needed
        column: 0,
        eventName: onNode.name,
        modifiers: onNode.modifiers,
      });
    }
  });

  return matches;
}

// ============================================================================
// Position Utilities
// ============================================================================

/**
 * Convert character position to line and column
 */
function positionToLineColumn(source: string, position: number): { line: number; column: number } {
  const lines = source.slice(0, position).split('\n');
  return {
    line: lines.length,
    column: lines[lines.length - 1].length + 1,
  };
}

// ============================================================================
// Error Generation
// ============================================================================

interface LegacyPatternSuggestion {
  pattern: string;
  suggestion: string;
}

const LEGACY_PATTERN_SUGGESTIONS: Record<string, LegacyPatternSuggestion> = {
  exportLet: {
    pattern: 'export let',
    suggestion: 'Use $props() instead: let { propName } = $props();',
  },
  reactiveStatement: {
    pattern: '$:',
    suggestion: 'Use $derived() for computed values or $effect() for side effects',
  },
  createEventDispatcher: {
    pattern: 'createEventDispatcher',
    suggestion: 'Use callback props instead (e.g., onValueChange)',
  },
  slot: {
    pattern: '<slot>',
    suggestion: 'Use snippets instead: {#snippet name()}...{/snippet} and {@render name()}',
  },
  onDirective: {
    pattern: 'on:',
    suggestion: 'Use event attribute instead: onclick={handler}',
  },
};

function generateErrors(legacy: LegacyPatternsDetected, source: string): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const match of legacy.exportLet) {
    errors.push({
      type: 'legacy-pattern',
      message: `Legacy "export let ${match.name}" found`,
      line: match.line,
      column: match.column,
      suggestion: LEGACY_PATTERN_SUGGESTIONS.exportLet.suggestion,
    });
  }

  for (const match of legacy.reactiveStatements) {
    errors.push({
      type: 'legacy-pattern',
      message: `Legacy reactive statement "$:" found`,
      line: match.line,
      column: match.column,
      suggestion: LEGACY_PATTERN_SUGGESTIONS.reactiveStatement.suggestion,
    });
  }

  if (legacy.createEventDispatcher) {
    errors.push({
      type: 'legacy-pattern',
      message: 'Legacy "createEventDispatcher" found',
      suggestion: LEGACY_PATTERN_SUGGESTIONS.createEventDispatcher.suggestion,
    });
  }

  for (const match of legacy.slots) {
    const { line, column } = positionToLineColumn(source, match.line);
    const namedInfo = match.isNamed ? ` (named: "${match.name}")` : '';
    errors.push({
      type: 'legacy-pattern',
      message: `Legacy <slot> element found${namedInfo}`,
      line,
      column,
      suggestion: LEGACY_PATTERN_SUGGESTIONS.slot.suggestion,
    });
  }

  for (const match of legacy.onDirectives) {
    const { line, column } = positionToLineColumn(source, match.line);
    const modifiersInfo = match.modifiers.length > 0 ? `|${match.modifiers.join('|')}` : '';
    errors.push({
      type: 'legacy-pattern',
      message: `Legacy "on:${match.eventName}${modifiersInfo}" directive found`,
      line,
      column,
      suggestion: `Use event attribute instead: on${match.eventName}={handler}`,
    });
  }

  return errors;
}

// ============================================================================
// Main Validation Function
// ============================================================================

/**
 * Main validation function for Svelte 5 compliance using the official compiler
 */
export function validateSvelte5Compliance(content: string): Svelte5ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  let ast: AST.Root;
  let compilerMetadata: { runes: boolean } | undefined;

  // Parse with the Svelte compiler
  try {
    ast = parse(content, { modern: true });
  } catch (parseError) {
    return createFallbackResult(content, parseError as Error);
  }

  // Compile to get metadata about runes mode
  try {
    const compileResult = compile(content, {
      generate: false,
      dev: false,
    });
    compilerMetadata = { runes: compileResult.metadata.runes };

    // Add compiler warnings
    for (const warning of compileResult.warnings) {
      warnings.push({
        type: 'compiler-warning',
        message: `${warning.code}: ${warning.message}`,
        line: warning.start?.line,
        column: warning.start?.column,
      });
    }
  } catch {
    // Compilation might fail, continue with AST analysis
  }

  // Detect patterns using AST
  const runesDetected = detectRunesFromAst(ast);
  const legacyPatternsDetected: LegacyPatternsDetected = {
    exportLet: detectExportLetFromAst(ast),
    reactiveStatements: detectReactiveStatementsFromAst(ast),
    createEventDispatcher: detectCreateEventDispatcherFromAst(ast),
    slots: detectSlotsFromAst(ast),
    onDirectives: detectOnDirectivesFromAst(ast),
  };

  // Generate errors
  errors.push(...generateErrors(legacyPatternsDetected, content));

  // Determine validity
  const hasLegacyPatterns =
    legacyPatternsDetected.exportLet.length > 0 ||
    legacyPatternsDetected.reactiveStatements.length > 0 ||
    legacyPatternsDetected.createEventDispatcher ||
    legacyPatternsDetected.slots.length > 0 ||
    legacyPatternsDetected.onDirectives.length > 0;

  return {
    isValid: !hasLegacyPatterns,
    runesDetected,
    legacyPatternsDetected,
    errors,
    warnings,
    compilerMetadata,
  };
}

// ============================================================================
// Fallback for Parse Errors
// ============================================================================

/**
 * Fallback validation using regex when AST parsing fails
 */
function createFallbackResult(content: string, parseError: Error): Svelte5ValidationResult {
  const warnings: ValidationWarning[] = [
    {
      type: 'potential-issue',
      message: `Could not parse with Svelte compiler: ${parseError.message}. Using regex fallback.`,
    },
  ];

  // Simple regex-based detection as fallback
  const runesDetected = detectRunesWithRegex(content);
  const legacyPatternsDetected = detectLegacyPatternsWithRegex(content);
  const errors = generateErrorsFromRegex(legacyPatternsDetected);

  const hasLegacyPatterns =
    legacyPatternsDetected.exportLet.length > 0 ||
    legacyPatternsDetected.reactiveStatements.length > 0 ||
    legacyPatternsDetected.createEventDispatcher ||
    legacyPatternsDetected.slots.length > 0 ||
    legacyPatternsDetected.onDirectives.length > 0;

  return {
    isValid: !hasLegacyPatterns,
    runesDetected,
    legacyPatternsDetected,
    errors,
    warnings,
  };
}

function detectRunesWithRegex(content: string): RunesDetected {
  const detected: RunesDetected = {
    $state: false,
    $derived: false,
    $effect: false,
    $props: false,
    $bindable: false,
    $inspect: false,
    $host: false,
  };

  for (const rune of RUNE_NAMES) {
    // Match rune() or rune.something()
    const pattern = new RegExp(`\\${rune}\\s*[(<.]`);
    detected[rune] = pattern.test(content);
  }

  return detected;
}

function detectLegacyPatternsWithRegex(content: string): LegacyPatternsDetected {
  const lines = content.split('\n');

  const exportLet: ExportLetMatch[] = [];
  const reactiveStatements: ReactiveStatementMatch[] = [];
  const slots: SlotMatch[] = [];
  const onDirectives: OnDirectiveMatch[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // export let
    const exportMatch = line.match(/export\s+let\s+(\w+)/);
    if (exportMatch) {
      exportLet.push({ line: lineNum, column: line.indexOf('export') + 1, name: exportMatch[1] });
    }

    // $: reactive statements
    if (/^\s*\$:\s/.test(line)) {
      reactiveStatements.push({ line: lineNum, column: line.indexOf('$:') + 1 });
    }

    // <slot>
    for (const match of line.matchAll(/<slot(\s[^>]*)?\s*\/?>/g)) {
      const attrs = match[1] || '';
      const nameMatch = attrs.match(/name\s*=\s*["']([^"']+)["']/);
      slots.push({
        line: lineNum,
        column: (match.index || 0) + 1,
        isNamed: !!nameMatch,
        name: nameMatch?.[1],
      });
    }

    // on: directives
    for (const match of line.matchAll(/on:([a-zA-Z]+)(?:\|([a-zA-Z|]+))?/g)) {
      onDirectives.push({
        line: lineNum,
        column: (match.index || 0) + 1,
        eventName: match[1],
        modifiers: match[2]?.split('|') || [],
      });
    }
  }

  return {
    exportLet,
    reactiveStatements,
    createEventDispatcher: /createEventDispatcher/.test(content),
    slots,
    onDirectives,
  };
}

function generateErrorsFromRegex(legacy: LegacyPatternsDetected): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const match of legacy.exportLet) {
    errors.push({
      type: 'legacy-pattern',
      message: `Legacy "export let ${match.name}" found`,
      line: match.line,
      column: match.column,
      suggestion: LEGACY_PATTERN_SUGGESTIONS.exportLet.suggestion,
    });
  }

  for (const match of legacy.reactiveStatements) {
    errors.push({
      type: 'legacy-pattern',
      message: `Legacy reactive statement "$:" found`,
      line: match.line,
      column: match.column,
      suggestion: LEGACY_PATTERN_SUGGESTIONS.reactiveStatement.suggestion,
    });
  }

  if (legacy.createEventDispatcher) {
    errors.push({
      type: 'legacy-pattern',
      message: 'Legacy "createEventDispatcher" found',
      suggestion: LEGACY_PATTERN_SUGGESTIONS.createEventDispatcher.suggestion,
    });
  }

  for (const match of legacy.slots) {
    const namedInfo = match.isNamed ? ` (named: "${match.name}")` : '';
    errors.push({
      type: 'legacy-pattern',
      message: `Legacy <slot> element found${namedInfo}`,
      line: match.line,
      column: match.column,
      suggestion: LEGACY_PATTERN_SUGGESTIONS.slot.suggestion,
    });
  }

  for (const match of legacy.onDirectives) {
    const modifiersInfo = match.modifiers.length > 0 ? `|${match.modifiers.join('|')}` : '';
    errors.push({
      type: 'legacy-pattern',
      message: `Legacy "on:${match.eventName}${modifiersInfo}" directive found`,
      line: match.line,
      column: match.column,
      suggestion: `Use event attribute instead: on${match.eventName}={handler}`,
    });
  }

  return errors;
}

// ============================================================================
// Public Helper Functions
// ============================================================================

/**
 * Quick check if a file uses any Svelte 5 runes
 */
export function hasRunesUsage(content: string): boolean {
  try {
    const ast = parse(content, { modern: true });
    const runes = detectRunesFromAst(ast);
    return Object.values(runes).some(Boolean);
  } catch {
    // Fallback to regex
    const runes = detectRunesWithRegex(content);
    return Object.values(runes).some(Boolean);
  }
}

/**
 * Quick check if a file has any legacy patterns
 */
export function hasLegacyPatterns(content: string): boolean {
  const result = validateSvelte5Compliance(content);
  return !result.isValid;
}

/**
 * Check if the Svelte compiler detects the file as using runes mode
 */
export function isRunesMode(content: string): boolean | null {
  try {
    const result = compile(content, { generate: false });
    return result.metadata.runes;
  } catch {
    return null;
  }
}
