/**
 * @file data/default-user/extensions/personalyze/logic/pipeline.js
 * @stamp {"utc":"2026-04-07T12:30:00.000Z"}
 * @architectural-role Orchestrator / Narrative Logic
 * @description
 * Implements the PersonaLyze "Falling Water" detection pipeline.
 * 
 * Updated to use the DNA Chain architecture:
 * - Reads definitions from state.chatCharacters (Local DNA).
 * - Persists discoveries to the chat log via dnaWriter.js.
 * - Follows the Two-Write Pattern for all visual transitions.
 * - Adheres to the new imageCache.generate contract (seed and provider required).
 *
 * @api-declaration
 * runPipeline(messageId) → Promise<void>
 *
 * @contract
 *   assertions:
 *     purity: Stateful IO
 *     state_ownership: [state (mutates via setters)]
 *     external_io: [LLM calls, dnaWriter, image generation, portrait UI]
 */

import { getContext } from '../../../../extensions.js';
import { error } from '../utils/logger.js';
import { 
    state, 
    updateActiveCharacter, 
    updateActivePointers, 
    updateActiveImage, 
    addToFileIndex, 
    getChainEntry, 
    updateChainEntry,
    upsertChatOutfitDef
} from '../state.js';
import { getSettings } from '../settings.js';
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
import { 
    lockedWriteVisualState, 
    lockedPatchVisualStateImage, 
    lockedWriteOutfitDef 
} from '../io/dnaWriter.js';
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

    const s = getSettings();
    if (!s.enabled) return;

    if (state.activeRoster.length === 0) return;

    startTurn('Pipeline');

    const history = buildHistoryText(context.chat, messageId, s.detectionHistory ?? 2);

    // ── Step 1: Subject Match ────────────────────────────────────────────────
    let characterId = null;

    if (state.activeCharacterId && state.activeRoster.includes(state.activeCharacterId)) {
        const localChar = state.chatCharacters[state.activeCharacterId];
        // Only run subject match if we actually have this character defined in DNA
        if (localChar) {
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
        // Filter roster to characters that actually have definitions in the chat DNA
        const definedIds = state.activeRoster.filter(id => state.chatCharacters[id]);
        if (definedIds.length === 0) return;

        const userName = context.name1 ?? 'User';
        characterId = await detectSubjectFromList(
            message.mes,
            definedIds,
            userName,
            history,
            s.subjectListPrompt,
            s.classifierProfileId,
        );

        if (!characterId) return;
    }

    const character = state.chatCharacters[characterId];
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
                // Write 1: Persistence to DNA
                // We write the definition to the turn before the transition happens (or current turn if turn 0)
                const defMsgId = messageId > 0 ? messageId - 1 : messageId;
                await lockedWriteOutfitDef(defMsgId, characterId, approved.key, approved.label, approved.description, approved.provider);
                
                // Update local state so Step 3b can resolve the ID
                upsertChatOutfitDef(characterId, approved.key, approved.label, approved.description, approved.provider);
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

    // Write 1: Narrative Intent
    await lockedWriteVisualState(messageId, characterId, outfitKey, expressionKey, cachedFile);

    if (cachedFile) {
        updateActiveImage(cachedFile);
        setPortrait(cachedFile);
        return;
    }

    const outfitDef = character.outfits[outfitKey];
    if (!outfitDef) return;

    const capturedMsgId = messageId;
    generate(
        characterId, 
        outfitKey, 
        expressionKey, 
        outfitDef.description, 
        expressionKey, 
        character.identityAnchor, 
        character.seed, 
        outfitDef.provider
    )
        .then(async newFile => {
            addToFileIndex(newFile);
            
            // Write 2: Asset Completion
            await lockedPatchVisualStateImage(capturedMsgId, characterId, newFile);
            
            updateActiveImage(newFile);
            updateChainEntry(characterId, outfitKey, expressionKey, newFile);
            setPortrait(newFile);
        })
        .catch(err => {
            error('Pipeline', 'Portrait generation failed:', err);
            if (window.toastr) window.toastr.error(`Generation failed: ${err.message}`, 'PersonaLyze');
        });
}