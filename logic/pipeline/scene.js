/**
 * @file data/default-user/extensions/personalyze/logic/pipeline/scene.js
 * @stamp {"utc":"2026-04-10T22:20:00.000Z"}
 * @architectural-role Orchestrator (Scene Logic)
 * @description
 * Manages the wardrobe "Redress" flow triggered by location changes.
 * 
 * Logic Flow:
 * 1. Batch Wardrobe Check: Determines which roster characters need a change.
 * 2. Targeted Redress: Extracts new outfits or applies "Everyday Wear" defaults.
 * 3. DNA Commitment: Writes new visual states for affected characters.
 *
 * @api-declaration
 * runScenePipeline(messageId) -> Promise<void>
 *
 * @contract
 *   assertions:
 *     purity: Stateful Orchestrator
 *     state_ownership: [state (via setters)]
 *     external_io: [LLM, dnaWriter.js, ensembleEngine.js, imageCache.js, portrait.js]
 */

import { getContext } from '../../../../extensions.js';
import { getSettings } from '../../settings.js';
import { log, error } from '../../utils/logger.js';
import { slugify } from '../../utils/history.js';
import {
    state,
    updateChainLayers,
    addToFileIndex
} from '../../state.js';
import { setPortrait } from '../../portrait.js';
import { detectWardrobeValidity, detectRedress } from '../../io/llm/scene.js';
import { getDefaultEnsembleLayers } from '../ensembleEngine.js';
import { parsePhase3, mergeLayeredUpdate } from '../parsers.js';
import { compilePrompt } from '../promptCompiler.js';
import { generate } from '../../imageCache.js';
import { lockedWriteVisualState, lockedPatchVisualStateImage } from '../../io/dnaWriter.js';

/**
 * Executes proactive wardrobe management for the entire active roster.
 * 
 * @param {number} messageId - The index of the trigger message.
 */
export async function runScenePipeline(messageId) {
    const context = getContext();
    const message = context.chat[messageId];
    const s = getSettings();

    // 1. Prepare Batch Data
    const rosterItems = state.activeRoster.map(id => {
        const char = state.chatCharacters[id];
        const chain = state.characterChain[id];
        const layers = chain?.layers || state.activeLayers;
        
        // Simple summary of current top-level clothes for the LLM
        const clothes = layers.outerwear?.item || layers.top?.item || 'standard clothes';
        
        return { 
            id, 
            name: id.replace(/_/g, ' '), 
            clothes, 
            layers, 
            anchor: char?.identityAnchor || '',
            seed: char?.seed || 1
        };
    });

    if (rosterItems.length === 0) return;

    try {
        // 2. Batched Wardrobe Validity Check (O(1) LLM Call)
        const sceneContext = message.mes; // Use the transition message text
        const validityMap = await detectWardrobeValidity(
            sceneContext, 
            rosterItems, 
            s.booleanProfileId || s.fastProfileId
        );

        // 3. Process each character that needs a change
        for (const item of rosterItems) {
            const needsRedress = validityMap[item.name] === true;
            if (!needsRedress) continue;

            log('Scene', `Character "${item.name}" requires redress for the new scene.`);

            // A. Extract Redress (Smart Model)
            const rawRedress = await detectRedress(
                item.name, 
                sceneContext, 
                s.describerProfileId || s.smartProfileId
            );

            let nextLayers;

            // B. Resolve Redress Strategy
            if (rawRedress.trim().toUpperCase() === 'USE_DEFAULT') {
                log('Scene', `Applying designated Default Ensemble for: ${item.id}`);
                nextLayers = getDefaultEnsembleLayers(item.id, state);
            } else {
                const parsed = parsePhase3(rawRedress);
                nextLayers = mergeLayeredUpdate(item.layers, parsed);
            }

            // C. Commit DNA (Intent)
            const recordId = await lockedWriteVisualState(messageId, item.id, nextLayers, null);
            updateChainLayers(item.id, nextLayers, null);

            // D. Background Generation (Async)
            // Note: We don't await this inside the loop so the UI remains responsive,
            // but the intent is already written to DNA.
            processSceneGeneration(messageId, item, nextLayers, s, recordId);
        }

    } catch (err) {
        error('Scene', 'Redress flow failed:', err.message);
    }
}

/**
 * Handles image generation for a scene redress.
 * Separated to prevent blocking the main pipeline flow.
 */
async function processSceneGeneration(messageId, item, layers, s, recordId) {
    try {
        const prompt = compilePrompt(item.anchor, layers);
        const filename = await generate(
            item.id, 'redress', slugify(layers.emotion),
            prompt, layers.emotion, item.anchor, item.seed,
            s.defaultEngine || 'pollinations'
        );

        addToFileIndex(filename);
        updateChainLayers(item.id, layers, filename);

        // Write 2: Asset Completion — use recordId to patch the exact intent record,
        // not the turn pipeline's record which may have been written after this one.
        await lockedPatchVisualStateImage(messageId, item.id, filename, recordId);

        // Update the portrait if this character is currently active.
        if (state.activeCharacterId === item.id) {
            setPortrait(filename);
        }

        log('Scene', `Redress portrait complete for ${item.id}: ${filename}`);
    } catch (err) {
        error('Scene', `Generation failed for ${item.id}:`, err.message);
    }
}