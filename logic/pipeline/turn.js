/**
 * @file data/default-user/extensions/personalyze/logic/pipeline/turn.js
 * @stamp {"utc":"2026-04-12T13:10:00.000Z"}
 * @architectural-role Orchestrator (Turn Logic)
 * @description
 * Implements the standard 3-Phase Turn pipeline.
 * Handles the 3-state Phase 1 routing:
 * 1. None/Narrator (Abort)
 * 2. Known Subject (Proceed to change gate)
 * 3. Unknown Subject (Delegate to Archivist)
 *
 * Updated for Ensemble Autosave: Automatically generates and saves an ensemble
 * based on the extracted visual state.
 *
 * @api-declaration
 * runTurnPipeline(messageId) -> Promise<void>
 * processKnownSubject(messageId, characterId, text, history, s) -> Promise<void>
 *
 * @contract
 *   assertions:
 *     purity: Stateful Orchestrator
 *     state_ownership: [state (via setters)]
 *     external_io: [LLM, resolveAliasToId, archivist.js, dnaWriter.js, imageCache.js]
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
    upsertChatEnsemble
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
import { compilePrompt } from '../promptCompiler.js';
import { generate } from '../../imageCache.js';
import { setPortrait } from '../../portrait.js';
import { 
    lockedWriteVisualState, 
    lockedPatchVisualStateImage,
    lockedWriteEnsemble 
} from '../../io/dnaWriter.js';
import { isIgnored, isPending } from '../blacklist.js';
import { runArchivistPipeline } from './archivist.js';

/**
 * Standard turn-based processing for a single message.
 * @param {number} messageId
 */
export async function runTurnPipeline(messageId) {
    const context = getContext();
    const message = context.chat[messageId];
    const s = getSettings();

    // ─── Phase 1: Subject Detection (3-State Routing) ─────────────────────
    const history = buildHistoryText(context.chat, messageId, s.detectionHistory ?? 4);

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
        error('Turn', 'Phase 1 failed:', err.message);
        return;
    }

    // 1. State: None/Narrator
    if (!detectedString) {
        log('Turn', 'No specific subject detected. Skipping turn extraction.');
        return;
    }

    // 2. State: Known Subject (Canonical ID or AKA)
    const resolvedId = resolveAliasToId(detectedString);

    if (resolvedId) {
        await processKnownSubject(messageId, resolvedId, message.mes, history, s);
        return;
    }

    // 3. State: Unknown Subject
    log('Turn', `Unknown subject detected: "${detectedString}". Checking resolution guards...`);
    
    if (isIgnored(detectedString)) {
        log('Turn', `Subject "${detectedString}" is blacklisted for this scene.`);
        return;
    }

    if (isPending(detectedString)) {
        log('Turn', `Resolution modal for "${detectedString}" is already active.`);
        return;
    }

    // Delegate to the Archivist (Phase 1.5)
    await runArchivistPipeline(messageId, detectedString);
}

/**
 * Executes Phases 2 & 3 for a subject already present in the DNA/Roster.
 */
export async function processKnownSubject(messageId, characterId, text, history, s) {
    const character = state.chatCharacters[characterId];
    if (!character) return; // Safety

    updateActiveCharacter(characterId);

    // ─── Phase 2: Change Gate ───
    const chainEntry = getChainEntry(characterId);
    const currentLayers = chainEntry?.layers || state.activeLayers;

    const charName = character.label || characterId.replace(/_/g, ' ');

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
        error('Turn', 'Phase 2 failed:', err.message);
        return;
    }

    if (!hasChanged) {
        log('Turn', 'No visual change detected.');
        if (chainEntry?.image) setPortrait(chainEntry.image);
        return;
    }

    // ─── Phase 3: Extraction ───
    let rawUpdate;
    try {
        rawUpdate = await detectLayers(
            text,
            history,
            charName,
            character.identityAnchor,
            currentLayers,
            character.slots, // Flexible Wardrobe: pass character-specific category list
            s.smartProfileId
        );
    } catch (err) {
        error('Turn', 'Phase 3 failed:', err.message);
        return;
    }

    const nextLayers = mergeLayeredUpdate(currentLayers, parsePhase3(rawUpdate));

    // ─── Phase 3.5: Ensemble Autosave ───
    const ensembleLabel = generateEnsembleLabel(nextLayers);
    const ensembleKey   = generateEnsembleKey(nextLayers);
    
    // Burn the new combination into DNA as an ensemble and update memory.
    // If the clothes/mood match an existing key, the new pose/label will overwrite it.
    await lockedWriteEnsemble(messageId, characterId, ensembleKey, ensembleLabel, nextLayers);
    upsertChatEnsemble(characterId, ensembleKey, ensembleLabel, nextLayers);
    log('Turn', `Autosaved ensemble: ${ensembleLabel}`);

    // ─── Phase 4: Compile & Commit ───
    updateActiveLayers(nextLayers);
    updateChainLayers(characterId, nextLayers, null);

    const prompt = compilePrompt(character.identityAnchor, nextLayers);
    const recordId = await lockedWriteVisualState(messageId, characterId, nextLayers, null);

    const engine = character.engine || s.defaultEngine || 'pollinations';

    try {
        const file = await generate(
            characterId, 
            'layered', 
            slugify(nextLayers.emotion),
            prompt, 
            nextLayers.emotion, 
            nextLayers.pose,
            character.identityAnchor, 
            character.seed,
            engine
        );

        addToFileIndex(file);
        updateActiveImage(file);
        updateChainLayers(characterId, nextLayers, file);
        await lockedPatchVisualStateImage(messageId, characterId, file, recordId);
        setPortrait(file);
    } catch (err) {
        error('Turn', 'Generation failed:', err.message);
    }
}