/**
 * @file data/default-user/extensions/personalyze/imageCache.js
 * @stamp {"utc":"2026-04-17T14:20:00.000Z"}
 * @architectural-role IO Orchestrator (Facade)
 * @description
 * Single entry point for all image-related network and filesystem IO.
 * Orchestrates naming, prompt compilation, generation, and maintenance by
 * delegating to specialized sub-modules to maintain strict modularity (<300 LOC).
 * 
 * Updated for Dynamic Variable Architecture:
 * 1. generate() and finalizePrompt() now accept raw layers objects.
 * 
 * @api-declaration
 * buildFilenamePrefix(characterId, tag, emotion) -> string
 * findCachedImage(prefix, fileIndex) -> string|null
 * fetchFileIndex() -> Promise<{ fileIndex: Set<string>, allImages: string[] }>
 * resolveDimensions(characterId) -> { width: number, height: number }
 * resolveStyle(characterId) -> string
 * finalizePrompt(layers, anchor, emotion, pose, template) -> string
 * fetchPreviewBlob(prompt, characterId, provider, seed, emotion, pose) -> Promise<string>
 * generate(characterId, tag, emotion, layers, emotionLabel, poseLabel, anchor, seed, forceCacheBust) -> Promise<string>
 * deleteFiles(filenames) -> Promise<string[]>
 * flushAllImages() -> Promise<string[]>
 * flushChatImages(characterIds) -> Promise<string[]>
 * 
 * @contract
 *   assertions:
 *     purity: Facade
 *     state_ownership: []
 *     external_io: []
 */

export * from './io/image/registry.js';
export * from './io/image/compiler.js';
export * from './io/image/maintenance.js';
export * from './io/image/executor.js';