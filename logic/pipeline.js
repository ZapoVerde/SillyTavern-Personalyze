/**
 * @file data/default-user/extensions/personalyze/logic/pipeline.js
 * @stamp {"utc":"2026-04-04T00:00:00.000Z"}
 * @architectural-role Orchestrator / Narrative Logic
 * @description
 * Implements the PersonaLyze "Falling Water" detection pipeline.
 *
 * Triggered on every incoming AI message. Halts as early as possible
 * to minimise LLM spend. The cascade is:
 *
 *   Step 1   — Subject Match:     Is the active character the main subject? (YES/NO)
 *   Step 2   — Subject From List: If not, who is? (key or NONE)
 *   Step 2.9 — Change Check:      Still same outfit + expression? (YES/NO)
 *   Step 3   — Combined:          What outfit + expression? (two lines)
 *   Step 3a  — Outfit Describer:  Describe the new outfit (only if NEW)
 *
 * Expressions use the global DEFAULT_EXPRESSION_LABELS set — no per-character
 * expression registry. Images are built on demand.
 *
 * @api-declaration
 * runPipeline(messageId) → Promise<void>
 *
 * @contract
 *   assertions:
 *     purity: Stateful IO
 *     state_ownership: [state (mutates via setters)]
 *     external_io: [LLM calls, chat writes, image generation, portrait UI]
 */

import { getContext } from '../../../../extensions.js';
import { error } from '../utils/logger.js';
import { state, updateActiveCharacter, updateActivePointers, updateActiveImage, addToFileIndex, getChainEntry, updateChainEntry } from '../state.js';
import { getSettings } from '../settings.js';
import { getAllCharacterIds, getCharacter, upsertOutfit } from '../registry.js';
import { buildHistoryText, buildDescriberContext, slugify } from '../utils/history.js';
import {
    detectSubjectMatch,
    detectSubjectFromList,
    detectChangeCheck,
    detectCombined,
    detectOutfitDescriber,
} from '../detector.js';
import { generate, buildFilename } from '../imageCache.js';
import { setPortrait } from '../portrait.js';
import { lockedWritePointer, lockedPatchPointerImage } from './pointerWriter.js';
import { openDressingRoom } from '../ui/dressingRoom.js';

// ─── Entry Point ──────────────────────────────────────────────────────────────

/**
 * Main entry point for the per-turn detection logic.
 * @param {number} messageId
 */
export async function runPipeline(messageId) {
    const context = getContext();
    const message = context.chat[messageId];

    if (!message || message.is_user) return;

    const s       = getSettings();
    if (!s.enabled) return;

    const history = buildHistoryText(context.chat, messageId, s.detectionHistory ?? 2);

    // ── Step 1: Subject Match ────────────────────────────────────────────────
    // Check whether the currently tracked character is the main subject.
    // Fast path: if we already know who's active, a cheap YES/NO confirms it.

    let characterId = null;

    if (state.activeCharacterId) {
        const activeCharacter = getCharacter(state.activeCharacterId);
        if (activeCharacter) {
            const isMatch = await detectSubjectMatch(
                message.mes,
                state.activeCharacterId.replace(/_/g, ' '),
                history,
                s.subjectMatchPrompt,
                s.booleanProfileId,
            );
            if (isMatch) characterId = state.activeCharacterId;
        }
    }

    // ── Step 2: Subject From List ────────────────────────────────────────────
    // Current character wasn't the subject — identify from the full roster.

    if (!characterId) {
        const allIds = getAllCharacterIds();
        if (allIds.length === 0) return;   // Nothing registered — nothing to do.

        const userName = context.name1 ?? 'User';
        characterId = await detectSubjectFromList(
            message.mes,
            allIds,
            userName,
            history,
            s.subjectListPrompt,
            s.classifierProfileId,
        );

        if (!characterId) return;   // NONE — no known character is the main subject.
    }

    const character = getCharacter(characterId);
    if (!character) return;

    updateActiveCharacter(characterId);

    // ── Step 2.9: Change Check ───────────────────────────────────────────────
    // Cheap boolean: is everything still the same? Skip the classifier if so.
    // Read from the DNA chain — this character's own last-known state, not the
    // global active pointers (which may belong to a different character).
    //
    // If there is no chain entry for this character (first time we've seen them
    // this session), skip the check entirely — we have nothing to compare against
    // and must run the classifier unconditionally.

    const chainEntry = getChainEntry(characterId);

    if (chainEntry?.outfit && chainEntry?.expression) {
        const currentOutfitLabel     = character.outfits[chainEntry.outfit]?.label ?? chainEntry.outfit;
        const currentExpressionLabel = chainEntry.expression;

        const unchanged = await detectChangeCheck(
            message.mes,
            characterId.replace(/_/g, ' '),
            currentOutfitLabel,
            currentExpressionLabel,
            history,
            s.changeCheckPrompt,
            s.booleanProfileId,
        );

        if (unchanged) {
            // Portrait is already correct — just ensure it's visible.
            if (chainEntry.image) setPortrait(chainEntry.image);
            return;
        }
    }

    // ── Step 3: Combined Classifier ──────────────────────────────────────────
    // One call, two answers: current outfit key + current expression label.

    const outfitKeys = Object.keys(character.outfits);
    const { outfitKey, expressionKey } = await detectCombined(
        message.mes,
        characterId.replace(/_/g, ' '),
        outfitKeys,
        character.outfits,
        s.expressionLabels,
        history,
        s.combinedClassifierPrompt,
        s.classifierProfileId,
    );

    // Both NULL — classifier found nothing actionable.
    if (!outfitKey && !expressionKey) return;

    // ── Step 3a: Outfit Describer (only if NEW) ──────────────────────────────

    let finalOutfitKey = outfitKey !== 'NEW' ? outfitKey : null;

    if (outfitKey === 'NEW') {
        const contextText = buildDescriberContext(context.chat, messageId, s.describerHistory ?? 3);
        const described   = await detectOutfitDescriber(
            contextText,
            message.name,
            character.identityAnchor,
            s.outfitDescriberPrompt,
            s.describerProfileId,
        );

        if (described) {
            const newKey  = slugify(described.label);
            const approved = await openDressingRoom({ dimension: 'outfit', ...described, key: newKey });
            if (approved) {
                upsertOutfit(characterId, approved.key, approved.label, approved.description);
                finalOutfitKey = approved.key;
            }
        }
    }

    // Fall back to this character's chain entry if the classifier returned NULL.
    const resolvedOutfitKey     = finalOutfitKey  ?? chainEntry?.outfit     ?? null;
    const resolvedExpressionKey = expressionKey   ?? chainEntry?.expression ?? null;

    if (!resolvedOutfitKey || !resolvedExpressionKey) return;

    updateActivePointers(resolvedOutfitKey, resolvedExpressionKey);
    updateChainEntry(characterId, resolvedOutfitKey, resolvedExpressionKey, null);  // image patched later
    await applyVisual(messageId, characterId, resolvedOutfitKey, resolvedExpressionKey, character);
}

// ─── Visual Commit ────────────────────────────────────────────────────────────

/**
 * Resolves the portrait image for the given outfit × expression combination,
 * writes the pointer to the chat message, and applies the portrait to the UI.
 * Generates a new image if the combination has not been rendered before.
 *
 * @param {number} messageId
 * @param {string} characterId
 * @param {string} outfitKey
 * @param {string} expressionKey   One of DEFAULT_EXPRESSION_LABELS (e.g. "joy").
 * @param {object} character       Full character record from the registry.
 */
async function applyVisual(messageId, characterId, outfitKey, expressionKey, character) {
    const filename = buildFilename(characterId, outfitKey, expressionKey);

    // Write pointer immediately so the chat record is consistent even before
    // the image is available.
    await lockedWritePointer(messageId, {
        characterId,
        outfit:     outfitKey,
        expression: expressionKey,
        image:      state.fileIndex.has(filename) ? filename : null,
    });

    if (state.fileIndex.has(filename)) {
        // Cache hit — instant display.
        updateActiveImage(filename);
        setPortrait(filename);
        return;
    }

    // Cache miss — generate in background, patch the pointer when done.
    const outfitDef = character.outfits[outfitKey];
    if (!outfitDef) return;

    // expressionKey IS the label (e.g. "joy") — used directly in the prompt.
    const capturedMsgId = messageId;
    generate(characterId, outfitKey, expressionKey, outfitDef.description, expressionKey, character.identityAnchor)
        .then(async newFile => {
            addToFileIndex(newFile);
            await lockedPatchPointerImage(capturedMsgId, newFile);
            updateActiveImage(newFile);
            updateChainEntry(characterId, outfitKey, expressionKey, newFile);
            setPortrait(newFile);
        })
        .catch(err => {
            error('Pipeline', 'Portrait generation failed:', err);
            if (window.toastr) window.toastr.error(`Generation failed: ${err.message}`, 'PersonaLyze');
        });
}
