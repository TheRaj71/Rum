// Utils exports
export {
	loadConfig,
	loadConfigFromPath,
	findConfigFile,
	getConfigDir,
	ConfigNotFoundError,
	ConfigValidationError,
	ConfigParseError
} from './config.js';

// Transformer exports
export {
	transformImports,
	transformSvelteImports,
	transformMultipleFiles,
	type TransformOptions,
	type TransformResult,
	type TransformedImport,
} from './transformer.js';

// Fetcher exports
export {
	fetchRegistry,
	fetchItem,
	fetchFromGitHub,
	fetchRegistryFromGitHub,
	fetchItemFromGitHub,
	parseGitHubReference,
	clearCache,
	clearCacheForUrl,
	getCacheStats,
	RegistryFetchError,
	SchemaValidationError,
	GitHubRateLimitError,
	type FetchOptions,
	type FetchResult,
} from './fetcher.js';

// Resolver exports
export {
	resolveTree,
	detectCircularDependencies,
	collectNpmDependencies,
	collectFiles,
	CircularDependencyError,
	ComponentNotFoundError,
	type ResolvedItem,
	type DependencyTree,
} from './resolver.js';

// URL Parser exports
export {
	parseNamespacedReference,
	isNamespacedReference,
	substituteUrlTemplate,
	hasNamePlaceholder,
	isUrlDependency,
	buildItemUrl,
	parseGitHubRepoReference,
	isGitHubRepoReference,
	normalizeRegistryUrl,
	type NamespacedReference,
} from './url-parser.js';

// CSS utilities exports
export {
	mergeCssVariables,
	parseCssVariables,
	hasLayerBase,
	createLayerBaseBlock,
	type CssMergeOptions,
	type CssMergeResult,
	type ParsedCssVariables,
} from './css.js';

// Svelte 5 Validator exports
export {
	validateSvelte5Compliance,
	hasRunesUsage,
	hasLegacyPatterns,
	isRunesMode,
	type Svelte5ValidationResult,
	type RunesDetected,
	type LegacyPatternsDetected,
	type ExportLetMatch,
	type ReactiveStatementMatch,
	type SlotMatch,
	type OnDirectiveMatch,
	type ValidationError,
	type ValidationWarning,
} from './svelte5-validator.js';

// Similarity utilities exports
export {
	levenshteinDistance,
	similarityScore,
	findSimilar,
	findByPrefix,
	suggestSimilarNames,
} from './similarity.js';
