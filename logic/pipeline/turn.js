/**
 * @file data/default-user/extensions/personalyze/logic/pipeline/turn.js
 * @stamp {"utc":"2026-05-01T15:00:00.000Z"}
 * @architectural-role Orchestrator (Turn Logic)
 * @description
 * Implements the Hybrid Multi-Character Turn pipeline.
 * 
 * Updated for Responder Workflow:
 * 1. Logic evaluation (Phase 3.5) is now strictly nested inside the Master Trigger Gate.
 * 2. Probes only fire when a visual change is confirmed, preventing logic leaks during 
 *    asset healing cycles.
 *
 * @api-declaration
 * runTurnPipeline(messageId) -> Promise<void>
 * processKnownSubject(messageId, characterId, text, history, s) -> Promise<void>
 *
 * @contract
 *   assertions:
 *     purity: Stateful Orchestrator
 *     state_ownership: [state (via setters)]
 *     external_io: [LLM, heuristics.js, heuristicModal.js, TaskQueue, dnaWriter.js, imageCache.js, logicPhase.js]
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
    setCharacterArchived
} from '../../state.js';
import { getSettings } from '../../settings.js';
import { slugify, buildHistoryText } from '../../utils/history.js';
import { detectSubject, detectChange, detectLayers } from '../../io/llm/subject.js';
import { 
    parsePhase3,
    mergeLayeredUpdate,
    generateEnsembleLabel,
    generateEnsembleKey
} from '../parsers.js';
import { generate, deleteFiles, resolveStyle } from '../../imageCache.js';
import {
    lockedWriteVisualState,
    lockedPatchVisualStateImage,
    lockedWriteEnsemble,
    lockedWriteRoster,
    lockedWriteArchiveUpdate
} from '../../io/dnaWriter.js';
import { isIgnored, isPending, snooze } from '../blacklist.js';
import { runArchivistPipeline } from './archivist.js';
import { detectNamesInText } from '../heuristics.js';
import { showHeuristicApprovalModal } from '../../ui/heuristicModal.js';
import { TaskQueue } from '../../utils/queue.js';
import { evaluateLogic } from './logicPhase.js';

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

        const notSnoozed = newlyDetected.filter(id => !isIgnored(id, messageId));

        let modalResult = { load: [], snooze: [], archive: [] };
        if (notSnoozed.length > 0) {
            modalResult = await showHeuristicApprovalModal(notSnoozed);
        }

        for (const { id, duration } of modalResult.snooze) {
            snooze(id, messageId + duration);
        }

        for (const id of modalResult.archive) {
            setCharacterArchived(id, true);
            await lockedWriteArchiveUpdate(messageId, id, true);
            if (state.activeRoster.includes(id)) {
                const newRoster = state.activeRoster.filter(x => x !== id);
                setActiveRoster(newRoster);
                await lockedWriteRoster(messageId, newRoster);
                document.dispatchEvent(new CustomEvent('plz:roster-changed'));
            }
        }

        targetSubjects = [...alreadyActive, ...modalResult.load];
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
                if (!isIgnored(detectedString, messageId) && !isPending(detectedString)) {
                    await runArchivistPipeline(messageId, detectedString);
                }
                return;
            }
        }
    }

    if (targetSubjects.length === 0) return;

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
    const tasks = targetSubjects.map(id => {
        return pipelineQueue.enqueue(() =>
            processKnownSubject(messageId, id, message.mes, history, s, signal)
        );
    });

    await Promise.all(tasks);
}

/**
 * Executes Phases 2 & 3 for a subject already present in the DNA/Roster.
 */
export async function processKnownSubject(messageId, characterId, text, history, s, signal) {
    const character = state.chatCharacters[characterId];
    if (!character) return;

    updateActiveCharacter(characterId);

    // ─── Phase 2: Change Gate ───
    const chainEntry = getChainEntry(characterId);
    const currentLayers = chainEntry?.layers || state.activeLayers;
    const charName = character.label || characterId.replace(/_/g, ' ');

    const needsHealing = chainEntry && (!chainEntry.image || !state.fileIndex.has(chainEntry.image));

    let hasChanged;
    try {
        hasChanged = await detectChange(text, history, charName, currentLayers, s.fastProfileId);
    } catch (err) {
        error('Turn', `Phase 2 failed for ${characterId}:`, err.message);
        return;
    }

    // Exit early if no change and asset is intact.
    if (!hasChanged && !needsHealing) return;

    let nextLayers = currentLayers;

    // ─── The Master Trigger Gate ───
    // Logic Probes (Phase 3.5) and Extraction (Phase 3) are RESPONDERS.
    // They only fire if a visual change is narratively confirmed.
    if (hasChanged) {
        // Phase 3: Extraction
        let rawUpdate;
        try {
            rawUpdate = await detectLayers(text, history, charName, character.identity, currentLayers, character.slots, s.smartProfileId);
        } catch (err) {
            error('Turn', `Phase 3 failed for ${characterId}:`, err.message);
            return;
        }
        nextLayers = mergeLayeredUpdate(currentLayers, parsePhase3(rawUpdate));

        // Phase 3.5: Logic Evaluation
        // Locked behind the trigger; does not fire for simple "healing" cycles.
        const styleObj = resolveStyle(characterId);
        await evaluateLogic(characterId, nextLayers, currentLayers, styleObj, text, history, signal, character.identity);

        // Commit resulting ensemble to DNA
        const ensembleLabel = generateEnsembleLabel(nextLayers);
        const ensembleKey   = generateEnsembleKey(nextLayers);
        await lockedWriteEnsemble(messageId, characterId, ensembleKey, ensembleLabel, nextLayers);
        upsertChatEnsemble(characterId, ensembleKey, ensembleLabel, nextLayers);
    }

    // ─── Phase 4: Compile & Commit ───
    // If we reach here, it means hasChanged is true OR we are simply healing a missing image.
    updateActiveLayers(nextLayers);
    updateChainLayers(characterId, nextLayers, null);

    const recordId = await lockedWriteVisualState(messageId, characterId, nextLayers, null);

    try {
        if (signal?.aborted) return;
        const emotionSlug = slugify(nextLayers.emotion);
        const file = await generate(characterId, 'layered', emotionSlug, nextLayers, nextLayers.emotion, nextLayers.pose, character.identity, character.seed, false, signal);

        addToFileIndex(file);
        updateActiveImage(file);
        updateChainLayers(characterId, nextLayers, file);
        await lockedPatchVisualStateImage(messageId, characterId, file, recordId);
        
        if (!s.keepCache) {
            const charPrefix = `plz_${characterId}_`;
            const staleFiles = Array.from(state.fileIndex).filter(f => f.startsWith(charPrefix) && f !== file);
            if (staleFiles.length > 0) {
                await deleteFiles(staleFiles);
                removeFromFileIndex(staleFiles);
            }
        }
        document.dispatchEvent(new CustomEvent('plz:roster-render-req'));
    } catch (err) {
        error('Turn', `Generation failed for ${characterId}:`, err.message);
    }
}