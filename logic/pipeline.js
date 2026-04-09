/**
 * @file data/default-user/extensions/personalyze/logic/pipeline.js
 * @stamp {"utc":"2026-04-10T12:40:00.000Z"}
 * @architectural-role Orchestrator / Narrative Logic
 * @description
 * Orchestrates the 4-Phase Layered State Pipeline:
 * 1. Subject Detection & Roster Interrupt.
 * 2. Change Check Gate.
 * 3. State Update Extraction.
 * 4. Parsing, Prompt Construction, and DNA Commit.
 * 
 * Adheres to the Two-Write Pattern:
 * - Write 1: Narrative Intent (Layers updated, image is null).
 * - Write 2: Asset Completion (Image generated and patched).
 *
 * @api-declaration
 * runPipeline(messageId) → Promise<void>
 *
 * @contract
 *   assertions:
 *     purity: Stateful IO
 *     state_ownership: [state (via setters)]
 *     external_io: [LLM, dnaWriter, image generation, toastr/popups]
 */

import { getContext } from '../../../../extensions.js';
import { callPopup } from '../../../../../../script.js';
import { log, warn, error } from '../utils/logger.js';
import { 
    state, 
    updateActiveCharacter, 
    updateActiveLayers, 
    updateActiveImage, 
    addToFileIndex, 
    getChainEntry, 
    updateChainLayers
} from '../state.js';
import { getSettings } from '../settings.js';
import { slugify } from '../utils/history.js';
import { detectSubject, detectChange, detectLayers } from '../detector.js';
import { parsePhase3, mergeLayeredUpdate } from './parsers.js';
import { compilePrompt } from './promptCompiler.js';
import { generate } from '../imageCache.js';
import { setPortrait } from '../portrait.js';
import { lockedWriteVisualState, lockedPatchVisualStateImage } from '../io/dnaWriter.js';
import { startTurn } from '../utils/callLog.js';

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

    startTurn('Pipeline');

    // ── Phase 1: Subject Detection ──
    let detectedName;
    try {
        detectedName = await detectSubject(message.mes, state.activeRoster, s.booleanProfileId || s.fastProfileId);
    } catch (err) {
        const reason = err.cause?.message || err.message;
        if (window.toastr) window.toastr.error(`Subject Detection failed — ${reason}`, 'PersonaLyze');
        error('Pipeline', 'Phase 1 failed:', err);
        return;
    }
    if (!detectedName) return;

    const characterId = slugify(detectedName);

    // Roster Interrupt: If character is detected but not active in this chat.
    if (!state.activeRoster.includes(characterId)) {
        log('Pipeline', `New character detected: ${detectedName}. Halting for interrupt.`);
        const confirmed = await callPopup(
            `<h3>New Character Detected</h3>
             <p>Personalyze detected <b>${detectedName}</b> as the subject. Add them to the visual roster for this chat?</p>`,
            'confirm'
        );
        if (confirmed) {
            const { handleSyncRoster } = await import('./importExport.js');
            await handleSyncRoster(characterId, true);
            // Resume pipeline after roster update
            return runPipeline(messageId);
        }
        return;
    }

    const character = state.chatCharacters[characterId];
    if (!character) {
        warn('Pipeline', `Character ${characterId} in roster but no DNA found.`);
        return;
    }

    updateActiveCharacter(characterId);

    // ── Phase 2: Change Gate ──
    const chainEntry = getChainEntry(characterId);
    const currentLayers = chainEntry?.layers || state.activeLayers;

    let hasChanged;
    try {
        hasChanged = await detectChange(
            message.mes,
            detectedName,
            currentLayers,
            s.booleanProfileId || s.fastProfileId
        );
    } catch (err) {
        const reason = err.cause?.message || err.message;
        if (window.toastr) window.toastr.error(`Change Gate failed — ${reason}`, 'PersonaLyze');
        error('Pipeline', 'Phase 2 failed:', err);
        return;
    }

    if (!hasChanged) {
        log('Pipeline', 'No visual change detected. Persisting current state.');
        if (chainEntry?.image) setPortrait(chainEntry.image);
        return;
    }

    // ── Phase 3: Extraction (Smart Model) ──
    let rawUpdate;
    try {
        rawUpdate = await detectLayers(
            message.mes,
            detectedName,
            character.identityAnchor,
            s.describerProfileId || s.smartProfileId
        );
    } catch (err) {
        const reason = err.cause?.message || err.message;
        if (window.toastr) window.toastr.error(`State Extraction failed — ${reason}`, 'PersonaLyze');
        error('Pipeline', 'Phase 3 failed:', err);
        return;
    }

    const parsedUpdate = parsePhase3(rawUpdate);
    const nextLayers   = mergeLayeredUpdate(currentLayers, parsedUpdate);

    // ── Phase 4: Compile & Commit ──
    updateActiveLayers(nextLayers);
    updateChainLayers(characterId, nextLayers, null);

    const imagePrompt = compilePrompt(character.identityAnchor, nextLayers);
    
    // Write 1: Narrative Intent (DNA)
    await lockedWriteVisualState(messageId, characterId, nextLayers, null);

    // Trigger Generation
    try {
        const filename = await generate(
            characterId,
            'layered', // No longer using outfit keys for naming
            slugify(nextLayers.emotion),
            imagePrompt,
            nextLayers.emotion,
            character.identityAnchor,
            character.seed,
            s.defaultEngine || 'pollinations'
        );

        addToFileIndex(filename);
        updateActiveImage(filename);
        updateChainLayers(characterId, nextLayers, filename);
        
        // Write 2: Asset Completion (DNA Patch)
        await lockedPatchVisualStateImage(messageId, characterId, filename);
        
        setPortrait(filename);
    } catch (err) {
        const reason = err.cause?.message || err.message;
        if (window.toastr) window.toastr.warning(`Image generation failed — ${reason}`, 'PersonaLyze');
        error('Pipeline', 'Image generation failed:', err);
    }
}