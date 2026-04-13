/**
 * @file data/default-user/extensions/personalyze/logic/pipeline/scene.js
 * @stamp {"utc":"2026-04-15T13:10:00.000Z"}
 * @architectural-role Orchestrator (Scene Logic)
 * @description
 * Manages the wardrobe "Redress" flow triggered by location changes.
 * 
 * Updated for Generation Economy:
 * 1. Integrated broadened Ephemeral Cache cleanup after scene redress generation.
 *
 * @api-declaration
 * runScenePipeline(messageId) -> Promise<void>
 *
 * @contract
 *   assertions:
 *     purity: Stateful Orchestrator
 *     state_ownership: [state (via setters)]
 *     external_io: [LLM, dnaWriter.js, ensembleEngine.js, imageCache.js, state.js]
 */

import { getContext } from '../../../../../extensions.js';
import { getSettings } from '../../settings.js';
import { log, error } from '../../utils/logger.js';
import { slugify, buildHistoryText } from '../../utils/history.js';
import {
    state,
    updateChainLayers,
    addToFileIndex,
    upsertChatEnsemble,
    setActiveRoster,
    resolveAliasToId,
    removeFromFileIndex
} from '../../state.js';
import { detectRedress, detectSceneRoster, detectRedressRequirement } from '../../io/llm/scene.js';
import { getDefaultEnsembleLayers } from '../ensembleEngine.js';
import { 
    parsePhase3, 
    mergeLayeredUpdate,
    generateEnsembleLabel,
    generateEnsembleKey,
    parseSceneRoster
} from '../parsers.js';
import { compilePrompt } from '../promptCompiler.js';
import { generate, deleteFiles } from '../../imageCache.js';
import { 
    lockedWriteVisualState, 
    lockedPatchVisualStateImage,
    lockedWriteEnsemble,
    lockedWriteRoster
} from '../../io/dnaWriter.js';
import { detectNamesInText } from '../heuristics.js';
import { isIgnored, isPending } from '../blacklist.js';
import { runArchivistPipeline } from './archivist.js';

/**
 * Executes proactive wardrobe management for the entire active roster.
 * 
 * @param {number} messageId - The index of the trigger message.
 */
export async function runScenePipeline(messageId) {
    const context = getContext();
    const message = context.chat[messageId];
    const s = getSettings();
    const history = buildHistoryText(context.chat, messageId, s.detectionHistory ?? 4);

    // ─── Phase 1: Roster Discovery ──────────────────────────────────────────

    // discoveredEntities holds character IDs (heuristics) or raw Names (LLM)
    let discoveredEntities = detectNamesInText(message.mes, state.chatCharacters);
    
    if (discoveredEntities.length === 0) {
        log('Scene', 'Heuristics found no names in transition. Calling LLM Roster Discovery...');
        try {
            const raw = await detectSceneRoster(
                history, 
                message.mes, 
                state.activeRoster, 
                state.chatCharacters, 
                s.fastProfileId
            );
            discoveredEntities = parseSceneRoster(raw);
        } catch (err) {
            error('Scene', 'Roster discovery failed:', err.message);
            // On failure, we stick with the current roster to avoid accidental wipes
            discoveredEntities = state.activeRoster;
        }
    }

    // Resolve Entities to canonical IDs and handle unknowns
    const resolvedIds = [];
    for (const entity of discoveredEntities) {
        // If it's already a known canonical ID (heuristic path), use it directly
        if (state.chatCharacters[entity]) {
            resolvedIds.push(entity);
            continue;
        }

        const id = resolveAliasToId(entity);
        if (id) {
            resolvedIds.push(id);
        } else {
            if (!isIgnored(entity) && !isPending(entity)) {
                await runArchivistPipeline(messageId, entity);
            }
        }
    }

    // Sync Roster
    const nextRoster = [...new Set(resolvedIds)];
    if (JSON.stringify(nextRoster.sort()) !== JSON.stringify(state.activeRoster.sort())) {
        log('Scene', `Roster updated via discovery: ${nextRoster.join(', ')}`);
        await lockedWriteRoster(messageId, nextRoster);
        setActiveRoster(nextRoster);
        document.dispatchEvent(new CustomEvent('plz:roster-changed'));
    }

    // ─── Phase 2: Redress Flow ──────────────────────────────────────────────

    const rosterItems = state.activeRoster.map(id => {
        const char = state.chatCharacters[id];
        const chain = state.characterChain[id];
        const layers = chain?.layers || state.activeLayers;
        const clothes = layers.outerwear?.item || layers.top?.item || 'standard clothes';
        
        return {
            id,
            name: char?.label || id.replace(/_/g, ' '),
            clothes,
            layers,
            anchor:  char?.identityAnchor || '',
            seed:    char?.seed || 1,
            engine:  char?.engine || null,
        };
    });

    if (rosterItems.length === 0) return;

    try {
        const needsRedressMap = await detectRedressRequirement(
            history,
            message.mes,
            rosterItems,
            s.booleanProfileId || s.fastProfileId,
            s.wardrobeValidityPrompt
        );

        for (const item of rosterItems) {
            const needsRedress = needsRedressMap[item.name] === true;
            if (!needsRedress) continue;

            log('Scene', `Character "${item.name}" requires redress for the new scene.`);

            const rawRedress = await detectRedress(
                item.name,
                history,
                message.mes,
                s.describerProfileId || s.smartProfileId,
                s.redressPrompt
            );

            let nextLayers;

            if (rawRedress.trim().toUpperCase() === 'USE_DEFAULT') {
                log('Scene', `Applying designated Default Ensemble for: ${item.id}`);
                nextLayers = getDefaultEnsembleLayers(item.id, state);
            } else {
                const parsed = parsePhase3(rawRedress);
                nextLayers = mergeLayeredUpdate(item.layers, parsed);
            }

            const ensembleLabel = generateEnsembleLabel(nextLayers);
            const ensembleKey   = generateEnsembleKey(nextLayers);
            
            await lockedWriteEnsemble(messageId, item.id, ensembleKey, ensembleLabel, nextLayers);
            upsertChatEnsemble(item.id, ensembleKey, ensembleLabel, nextLayers);

            const recordId = await lockedWriteVisualState(messageId, item.id, nextLayers, null);
            updateChainLayers(item.id, nextLayers, null);

            processSceneGeneration(messageId, item, nextLayers, s, recordId);
        }

    } catch (err) {
        error('Scene', 'Redress flow failed:', err.message);
    }
}

/**
 * Handles image generation for a scene redress.
 */
async function processSceneGeneration(messageId, item, layers, s, recordId) {
    try {
        const prompt = compilePrompt(item.anchor, layers);
        const engine = item.engine || s.defaultEngine || 'pollinations';
        const emotionSlug = slugify(layers.emotion);

        const filename = await generate(
            item.id, 
            'redress', 
            emotionSlug,
            prompt, 
            layers.emotion, 
            layers.pose || 'upright', 
            item.anchor, 
            item.seed,
            engine
        );

        addToFileIndex(filename);
        updateChainLayers(item.id, layers, filename);
        await lockedPatchVisualStateImage(messageId, item.id, filename, recordId);

        // Ephemeral Cleanup: delete previous active images for this character (regardless of tag/emotion)
        if (!s.keepCache) {
            const charPrefix = `plz_${item.id}_`;
            const staleFiles = Array.from(state.fileIndex).filter(f => 
                f.startsWith(charPrefix) && f !== filename
            );
            
            if (staleFiles.length > 0) {
                await deleteFiles(staleFiles);
                removeFromFileIndex(staleFiles);
            }
        }

        // Notify UI to redraw cards
        document.dispatchEvent(new CustomEvent('plz:roster-render-req'));

        log('Scene', `Redress portrait complete for ${item.id}: ${filename}`);
    } catch (err) {
        error('Scene', `Generation failed for ${item.id}:`, err.message);
    }
}