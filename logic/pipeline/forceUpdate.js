/**
 * @file data/default-user/extensions/personalyze/logic/pipeline/forceUpdate.js
 * @stamp {"utc":"2026-05-01T09:00:00.000Z"}
 * @architectural-role Stateful Orchestrator
 * @description
 * Implements the Force Apparel Update pipeline triggered by the "Update Apparel"
 * gear menu button. Bypasses the Phase 2 "Change Gate" and runs Phase 3 layered
 * extraction directly against the most recent AI message.
 *
 * Updated for Reactive Logic Engine:
 * 1. Now calls evaluateLogic (Phase 3.5) after manual extraction.
 *
 * @api-declaration
 * forceApparelUpdate(characterId) -> Promise<void>
 *
 * @contract
 *   assertions:
 *     purity: Stateful Orchestrator
 *     state_ownership: [state (via setters)]
 *     external_io:[LLM, imageCache.js, dnaWriter.js, callLog.js, logicPhase.js]
 */

import { getContext } from '../../../../../extensions.js';
import { getSettings } from '../../settings.js';
import {
    state,
    getChainEntry,
    updateChainLayers,
    addToFileIndex,
    removeFromFileIndex
} from '../../state.js';
import { buildHistoryText, slugify } from '../../utils/history.js';
import { detectLayers } from '../../io/llm/subject.js';
import { parsePhase3, mergeLayeredUpdate } from '../parsers.js';
import { generate, deleteFiles, resolveStyle } from '../../imageCache.js';
import { lockedWriteVisualState, lockedPatchVisualStateImage } from '../../io/dnaWriter.js';
import { startWorkshopTurn } from '../../utils/callLog.js';
import { TaskQueue } from '../../utils/queue.js';
import { error } from '../../utils/logger.js';
import { evaluateLogic } from './logicPhase.js';

/** Dedicated queue for manual force-update requests (max 1 concurrent). */
const forceQueue = new TaskQueue(1);

/**
 * Enqueues a forced wardrobe extraction and image regeneration for the given character.
 * Fire-and-forget safe: UI feedback is delivered via plz:portrait-status events.
 *
 * @param {string} characterId
 */
export function forceApparelUpdate(characterId) {
    forceQueue.enqueue(() => _runForceUpdate(characterId)).catch(err => {
        error('ForceUpdate', `Unhandled error for ${characterId}:`, err.message);
    });
}

async function _runForceUpdate(characterId) {
    const context   = getContext();
    const s         = getSettings();
    const character = state.chatCharacters[characterId];
    if (!character) return;

    const charName = character.label || characterId.replace(/_/g, ' ');

    // Find the most recent AI message to extract from
    const lastAiIdx = context.chat.findLastIndex(m => !m.is_user);
    if (lastAiIdx === -1) {
        window.toastr?.info('No AI message yet.', 'PersonaLyze');
        return;
    }

    const message      = context.chat[lastAiIdx];
    const history      = buildHistoryText(context.chat, lastAiIdx, s.detectionHistory ?? 4);
    const chainEntry   = getChainEntry(characterId);
    const currentLayers = chainEntry?.layers || {};

    // Signal spinner immediately — covers both the LLM and image generation phases
    document.dispatchEvent(new CustomEvent('plz:portrait-status', {
        detail: { characterId, status: 'generating' }
    }));

    // Open forensic log so the user can audit this extraction in the flight recorder
    startWorkshopTurn(`Force Apparel: ${charName}`);

    // ── Phase 3: Layered Extraction ───────────────────────────────────────────
    let rawUpdate;
    try {
        rawUpdate = await detectLayers(
            message.mes,
            history,
            charName,
            character.identity,
            currentLayers,
            character.slots,
            s.smartProfileId
        );
    } catch (err) {
        error('ForceUpdate', `Phase 3 failed for ${characterId}:`, err.message);
        window.toastr?.error('Wardrobe extraction failed.', 'PersonaLyze');
        document.dispatchEvent(new CustomEvent('plz:portrait-status', {
            detail: { characterId, status: 'failed', error: 'LLM error' }
        }));
        return;
    }

    const nextLayers = mergeLayeredUpdate(currentLayers, parsePhase3(rawUpdate));

    // ── Phase 3.5: Reactive Logic Evaluation ──────────────────────────────────
    const styleObj = resolveStyle(characterId);
    await evaluateLogic(characterId, nextLayers, currentLayers, styleObj, message.mes, history, undefined);

    // ── KEEP Guard: abort if LLM returned all-KEEP (no actual change) ─────────
    if (JSON.stringify(nextLayers) === JSON.stringify(currentLayers)) {
        window.toastr?.info('No wardrobe changes detected in the text.', 'PersonaLyze');
        document.dispatchEvent(new CustomEvent('plz:portrait-status', {
            detail: { characterId, status: 'success' }
        }));
        return;
    }

    // ── Two-Write Pattern ─────────────────────────────────────────────────────
    // Write 1: commit narrative intent immediately (image field starts as null)
    updateChainLayers(characterId, nextLayers, null);
    const recordId = await lockedWriteVisualState(lastAiIdx, characterId, nextLayers, null);

    const emotionSlug = slugify(nextLayers.emotion || '');

    try {
        // Write 2: generate image, then patch the DNA record with the filename
        const file = await generate(
            characterId,
            'layered',
            emotionSlug,
            nextLayers,
            nextLayers.emotion,
            nextLayers.pose,
            character.identity,
            character.seed ?? 1,
            false
        );

        addToFileIndex(file);
        updateChainLayers(characterId, nextLayers, file);
        await lockedPatchVisualStateImage(lastAiIdx, characterId, file, recordId);

        // Ephemeral cleanup: remove stale portraits for this character
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

        document.dispatchEvent(new CustomEvent('plz:roster-render-req'));

    } catch (err) {
        // Generation failure: the DNA record is valid but points to a null image.
        // The card will correctly display a loading spinner until the user retries.
        error('ForceUpdate', `Generation failed for ${characterId}:`, err.message);
        window.toastr?.error('Generation failed, but wardrobe was saved.', 'PersonaLyze');
    }
}