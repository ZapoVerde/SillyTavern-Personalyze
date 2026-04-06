/**
 * @file data/default-user/extensions/personalyze/logic/pipeline.js
 * @stamp {"utc":"2026-04-06T00:00:00.000Z"}
 * @architectural-role Orchestrator / Narrative Logic
 * @description
 * Implements the PersonaLyze "Falling Water" detection pipeline.
 * 
 * Updated to support the Dual-Engine (Pollinations/HF) architecture. 
 * Correctly passes provider flags from the Dressing Room to the Registry.
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
import { getCharacter, upsertOutfit } from '../registry.js';
import { buildHistoryText, buildDescriberContext, slugify } from '../utils/history.js';
import {
    detectSubjectMatch,
    detectSubjectFromList,
    detectChangeCheck,
    detectCombined,
    detectOutfitDescriber,
} from '../detector.js';
import { generate, buildFilenamePrefix, findCachedImage } from '../imageCache.js';
import { setPortrait } from '../portrait.js';
import { lockedWritePointer, lockedPatchPointerImage } from './pointerWriter.js';
import { openDressingRoom } from '../ui/dressingRoom.js';
import { startTurn } from '../utils/callLog.js';

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

    if (state.activeRoster.length === 0) return;

    startTurn('Pipeline');

    const history = buildHistoryText(context.chat, messageId, s.detectionHistory ?? 2);

    // ── Step 1: Subject Match ────────────────────────────────────────────────
    let characterId = null;

    if (state.activeCharacterId && state.activeRoster.includes(state.activeCharacterId)) {
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
    if (!characterId) {
        const allIds = state.activeRoster.filter(id => getCharacter(id));
        if (allIds.length === 0) return;

        const userName = context.name1 ?? 'User';
        characterId = await detectSubjectFromList(
            message.mes,
            allIds,
            userName,
            history,
            s.subjectListPrompt,
            s.classifierProfileId,
        );

        if (!characterId) return;
    }

    const character = getCharacter(characterId);
    if (!character) return;

    updateActiveCharacter(characterId);

    // ── Step 2.9: Change Check ───────────────────────────────────────────────
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
            if (chainEntry.image) setPortrait(chainEntry.image);
            return;
        }
    }

    // ── Step 3: Combined Classifier ──────────────────────────────────────────
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
            const charEditorOpen = document.getElementById('rm_ch_create_block')?.offsetParent !== null;
            if (charEditorOpen) return;

            const newKey  = slugify(described.label);
            const approved = await openDressingRoom({ 
                dimension: 'outfit', 
                ...described, 
                key: newKey, 
                characterId, 
                anchor: character.identityAnchor 
            });

            if (approved) {
                // Pass the provider flag (pollinations/huggingface) to the registry
                upsertOutfit(characterId, approved.key, approved.label, approved.description, approved.provider);
                finalOutfitKey = approved.key;
            }
        }
    }

    const resolvedOutfitKey     = finalOutfitKey  ?? chainEntry?.outfit     ?? null;
    const resolvedExpressionKey = expressionKey   ?? chainEntry?.expression ?? null;

    if (!resolvedOutfitKey || !resolvedExpressionKey) return;

    updateActivePointers(resolvedOutfitKey, resolvedExpressionKey);
    updateChainEntry(characterId, resolvedOutfitKey, resolvedExpressionKey, null);
    await applyVisual(messageId, characterId, resolvedOutfitKey, resolvedExpressionKey, character);
}

// ─── Visual Commit ────────────────────────────────────────────────────────────

/**
 * Resolves the portrait image for the given outfit × expression combination.
 */
async function applyVisual(messageId, characterId, outfitKey, expressionKey, character) {
    const prefix     = buildFilenamePrefix(characterId, outfitKey, expressionKey);
    const cachedFile = findCachedImage(prefix, state.fileIndex);

    await lockedWritePointer(messageId, {
        characterId,
        outfit:     outfitKey,
        expression: expressionKey,
        image:      cachedFile,
    });

    if (cachedFile) {
        updateActiveImage(cachedFile);
        setPortrait(cachedFile);
        return;
    }

    const outfitDef = character.outfits[outfitKey];
    if (!outfitDef) return;

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