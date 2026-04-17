/**
 * @file data/default-user/extensions/personalyze/logic/pipeline/turn.js
 * @stamp {"utc":"2026-04-17T15:40:00.000Z"}
 * @architectural-role Orchestrator (Turn Logic)
 * @description
 * Implements the Hybrid Multi-Character Turn pipeline.
 * 
 * Updated for Granular Identity Architecture:
 * 1. Fixed Bug 3: Passes character.identity map to generate() to ensure granular variable injection.
 * 2. Fixed Bug 4: Corrected stringSlots argument in mergeLayeredUpdate for physical traits.
 *
 * @api-declaration
 * runTurnPipeline(messageId, signal) -> Promise<void>
 * processKnownSubject(messageId, characterId, text, history, s, signal) -> Promise<void>
 *
 * @contract
 *   assertions:
 *     purity: Stateful Orchestrator
 *     state_ownership: [state (via setters)]
 *     external_io: [LLM, heuristics.js, heuristicModal.js, TaskQueue, dnaWriter.js, imageCache.js]
 */

import { getContext } from '../../../../../extensions.js';
import { log, error } from '../../utils/logger.js';
import { 
    state, 
    updateActiveCharacter, 
    updateActiveLayers, 
    updateActiveImage, 
    addToFileIndex, 
    getChainEntry, 
    updateChainLayers,
    resolveAliasToId,
    upsertChatEnsemble,
    setActiveRoster,
    removeFromFileIndex,
    upsertChatCharacterDef
} from '../../state.js';
import { getSettings } from '../../settings.js';
import { slugify, buildHistoryText } from '../../utils/history.js';
import { detectSubject, detectChange, detectLayers } from '../../io/llm/subject.js';
import { 
    parsePhase3, 
    mergeLayeredUpdate,
    generateEnsembleLabel,
    generateEnsembleKey,
    compileIdentityString
} from '../parsers.js';
import { compilePrompt } from '../promptCompiler.js';
import { generate, deleteFiles } from '../../imageCache.js';
import { 
    lockedWriteVisualState, 
    lockedPatchVisualStateImage, 
    lockedWriteEnsemble,
    lockedWriteRoster,
    lockedWriteIdentityUpdate
} from '../../io/dnaWriter.js';
import { isIgnored, isPending } from '../blacklist.js';
import { runArchivistPipeline } from './archivist.js';
import { detectNamesInText } from '../heuristics.js';
import { showHeuristicApprovalModal } from '../../ui/heuristicModal.js';
import { TaskQueue } from '../../utils/queue.js';
import { META_SLOTS, BASE_SLOTS } from '../../defaults.js';

/** Singleton queue for pipeline concurrency control. */
const pipelineQueue = new TaskQueue(2);

/**
 * Hybrid multi-character processing for a single message.
 * @param {number} messageId
 * @param {AbortSignal} [signal]
 */
export async function runTurnPipeline(messageId, signal) {
    const context = getContext();
    const message = context.chat[messageId];
    const s = getSettings();
    const history = buildHistoryText(context.chat, messageId, s.detectionHistory ?? 4);

    let targetSubjects = [];

    // ─── Phase 1a: Heuristics ───
    const heuristicIds = detectNamesInText(message.mes, state.chatCharacters);
    
    if (heuristicIds.length > 0) {
        log('Turn', `Heuristics found: ${heuristicIds.join(', ')}`);
        
        const alreadyActive = heuristicIds.filter(id => state.activeRoster.includes(id));
        const newlyDetected = heuristicIds.filter(id => !state.activeRoster.includes(id));
        
        let approvedNew = [];
        if (newlyDetected.length > 0) {
            approvedNew = await showHeuristicApprovalModal(newlyDetected);
        }
        
        targetSubjects = [...alreadyActive, ...approvedNew];
    }

    // ─── Phase 1b: Fallback LLM ───
    if (targetSubjects.length === 0) {
        log('Turn', 'Heuristics found nothing. Falling back to Phase 1 LLM.');
        
        let detectedString;
        try {
            detectedString = await detectSubject(
                message.mes,
                history,
                state.activeRoster,
                state.chatCharacters,
                s.fastProfileId
            );
        } catch (err) {
            error('Turn', 'Phase 1 fallback failed:', err.message);
            return;
        }

        if (detectedString) {
            const resolvedId = resolveAliasToId(detectedString);
            if (resolvedId) {
                targetSubjects = [resolvedId];
            } else {
                // Route to Archivist for unknown subject
                log('Turn', `Unknown subject: "${detectedString}". Checking resolution guards...`);
                if (!isIgnored(detectedString) && !isPending(detectedString)) {
                    await runArchivistPipeline(messageId, detectedString);
                }
                return;
            }
        }
    }

    if (targetSubjects.length === 0) {
        log('Turn', 'No subjects identified. Skipping turn extraction.');
        return;
    }

    // ─── Phase 1c: Roster Sync ───
    const currentRoster = new Set(state.activeRoster);
    let rosterChanged = false;
    
    for (const id of targetSubjects) {
        if (!currentRoster.has(id)) {
            currentRoster.add(id);
            rosterChanged = true;
        }
    }

    if (rosterChanged) {
        const nextRoster = Array.from(currentRoster);
        await lockedWriteRoster(messageId, nextRoster);
        setActiveRoster(nextRoster);
        document.dispatchEvent(new CustomEvent('plz:roster-changed'));
    }

    // ─── Phases 2-4: Parallel Execution ───
    log('Turn', `Enqueuing ${targetSubjects.length} character updates.`);

    const tasks = targetSubjects.map(id => {
        return pipelineQueue.enqueue(() =>
            processKnownSubject(messageId, id, message.mes, history, s, signal)
        );
    });

    await Promise.all(tasks);
}

/**
 * Executes Phases 2 & 3 for a subject already present in the DNA/Roster.
 * @param {AbortSignal} [signal]
 */
export async function processKnownSubject(messageId, characterId, text, history, s, signal) {
    const character = state.chatCharacters[characterId];
    if (!character) return;

    // Track last active for breadcrumb/badge logic
    updateActiveCharacter(characterId);

    // ─── Phase 2: Change Gate ───
    const chainEntry = getChainEntry(characterId);
    const currentLayers = chainEntry?.layers || state.activeLayers;
    const charName = character.label || characterId.replace(/_/g, ' ');

    // Check if character is stuck with a spinner (null or missing image)
    const needsHealing = chainEntry && (!chainEntry.image || !state.fileIndex.has(chainEntry.image));

    let hasChanged;
    try {
        hasChanged = await detectChange(
            text,
            history,
            charName,
            currentLayers,
            s.fastProfileId
        );
    } catch (err) {
        error('Turn', `Phase 2 failed for ${characterId}:`, err.message);
        return;
    }

    if (!hasChanged && !needsHealing) {
        log('Turn', `${characterId}: No visual change detected.`);
        return;
    }

    let nextLayers = currentLayers;

    // ─── Phase 3: Extraction ───
    if (hasChanged) {
        let rawUpdate;
        try {
            rawUpdate = await detectLayers(
                text,
                history,
                charName,
                character.identity,
                currentLayers,
                character.slots,
                s.smartProfileId
            );
        } catch (err) {
            error('Turn', `Phase 3 failed for ${characterId}:`, err.message);
            return;
        }

        const parsedUpdate = parsePhase3(rawUpdate);

        // ─── Split Identity vs. Wardrobe Updates ───
        const identityKeys = Object.keys(character.identity);
        const wardrobeKeys = character.slots || [...BASE_SLOTS];
        
        const identityParsed = {};
        const wardrobeParsed = {};

        for (const [key, val] of Object.entries(parsedUpdate)) {
            if (identityKeys.includes(key) || (!wardrobeKeys.includes(key) && !META_SLOTS.includes(key))) {
                identityParsed[key] = val;
            } else {
                wardrobeParsed[key] = val;
            }
        }

        // 1. Commit Permanent Identity Changes
        if (Object.keys(identityParsed).length > 0) {
            // Fix Bug 4: Use identityKeys for the string-slot list
            const nextIdentity = mergeLayeredUpdate(character.identity, identityParsed, identityKeys);
            
            // Check if identity map actually changed to avoid DNA bloat
            if (JSON.stringify(nextIdentity) !== JSON.stringify(character.identity)) {
                log('Turn', `Permanent physical change detected for ${characterId}. Updating DNA.`);
                upsertChatCharacterDef(characterId, nextIdentity, character.seed);
                await lockedWriteIdentityUpdate(messageId, characterId, nextIdentity);
            }
        }

        // 2. Merge Temporary Wardrobe Changes
        nextLayers = mergeLayeredUpdate(currentLayers, wardrobeParsed);

        // ─── Phase 3.5: Ensemble Autosave ───
        const ensembleLabel = generateEnsembleLabel(nextLayers);
        const ensembleKey   = generateEnsembleKey(nextLayers);

        await lockedWriteEnsemble(messageId, characterId, ensembleKey, ensembleLabel, nextLayers);
        upsertChatEnsemble(characterId, ensembleKey, ensembleLabel, nextLayers);
    }

    // ─── Phase 4: Compile & Commit ───
    updateActiveLayers(nextLayers);
    updateChainLayers(characterId, nextLayers, null);

    const identityAnchor = compileIdentityString(character.identity);
    const prompt = compilePrompt(identityAnchor, nextLayers);
    const recordId = await lockedWriteVisualState(messageId, characterId, nextLayers, null);

    try {
        if (signal?.aborted) return;
        const emotionSlug = slugify(nextLayers.emotion);
        const file = await generate(
            characterId,
            'layered',
            emotionSlug,
            prompt,
            nextLayers.emotion,
            nextLayers.pose,
            character.identity, // Fix Bug 3: Pass map instead of identityAnchor string
            character.seed,
            false,
            signal
        );

        addToFileIndex(file);
        updateActiveImage(file);
        updateChainLayers(characterId, nextLayers, file);
        await lockedPatchVisualStateImage(messageId, characterId, file, recordId);
        
        // Ephemeral Cleanup
        if (!s.keepCache) {
            const charPrefix = `plz_${characterId}_`;
            const staleFiles = Array.from(state.fileIndex).filter(f => 
                f.startsWith(charPrefix) && f !== file
            );
            
            if (staleFiles.length > 0) {
                await deleteFiles(staleFiles);
                removeFromFileIndex(staleFiles);
            }
        }

        // Notify UI to redraw cards
        document.dispatchEvent(new CustomEvent('plz:roster-render-req'));
        
    } catch (err) {
        error('Turn', `Generation failed for ${characterId}:`, err.message);
    }
}