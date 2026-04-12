/**
 * @file data/default-user/extensions/personalyze/ui/workshop/dnaCommit.js
 * @stamp {"utc":"2026-04-14T21:10:00.000Z"}
 * @architectural-role UI Sub-module (Promotion & Generation)
 * @description
 * The final commitment gateway for the Studio dashboard. 
 * Handles 'Apply to Turn' and the promotion of ghost characters ('__new__') 
 * into permanent DNA entries.
 * 
 * Fixes:
 * 1. Removed dead setPortrait import.
 * 2. Refined lastMsgId logic to use verified indices.
 * 3. Added concurrency clarification for the write lock.
 * 
 * @api-declaration
 * bindCommitHandlers($overlay)
 * 
 * @contract
 *   assertions:
 *     purity: IO / Stateful UI
 *     state_ownership: [state.chatCharacters, state._workshopCharacterId]
 *     external_io: [dnaWriter.js, imageCache.js, promptCompiler.js, state.js, callPopup, DOM]
 */

import { getContext } from '../../../../../extensions.js';
import { callPopup } from '../../../../../../script.js';
import {
    state, setWorkshopCharacter, updateActiveCharacter, updateActiveLayers,
    updateActiveImage, addToFileIndex, updateChainLayers, setActiveRoster,
    upsertChatEnsemble
} from '../../state.js';
import { getSettings } from '../../settings.js';
import { BASE_SLOTS } from '../../defaults.js';
import { slugify } from '../../utils/history.js';
import { error } from '../../utils/logger.js';
import {
    lockedWriteCharacterDef, lockedWriteLabel, lockedWriteAka,
    lockedWriteVisualState, lockedPatchVisualStateImage, 
    lockedWriteRoster, lockedWriteCharacterStyle, lockedWriteSlots,
    lockedWriteEnsemble
} from '../../io/dnaWriter.js';
import { compilePrompt as compile } from '../../logic/promptCompiler.js';
import { generateEnsembleLabel, generateEnsembleKey } from '../../logic/parsers.js';
import { generate } from '../../imageCache.js';
import { getGridLayers, renderStudioView, renderDNAView } from './dnaListeners.js';

let layerSaveTimeout = null;

/**
 * Binds event listeners for character promotion and turn commitment.
 * @param {jQuery} $overlay - The workshop modal overlay.
 */
export function bindCommitHandlers($overlay) {

    // ─── Layer Auto-Save (Existing Characters Only) ───
    $overlay.on('input', '.plz-layer-item, .plz-layer-mod, #plz-layer-emotion, #plz-layer-pose', function() {
        clearTimeout(layerSaveTimeout);
        layerSaveTimeout = setTimeout(async () => {
            const id = state._workshopCharacterId;
            if (!id || id === '__new__') return; // Ghost Guard

            const layers = getGridLayers();
            const lastAiIdx = getContext().chat.findLastIndex(m => !m.is_user);
            if (lastAiIdx === -1) return;

            updateActiveLayers(layers);
            updateChainLayers(id, layers, state.characterChain[id]?.image ?? null);
            
            // NOTE: No explicit lock needed here as lockedWriteVisualState 
            // inside dnaWriter.js internally acquires the singleton writeLock.
            await lockedWriteVisualState(lastAiIdx, id, layers, state.characterChain[id]?.image ?? null);
        }, 600);
    });

    $overlay.on('click', '#plz-studio-layers-save', async function() {
        let id = state._workshopCharacterId;
        if (!id) return;
        
        const lastAiIdx = getContext().chat.findLastIndex(m => !m.is_user);
        if (lastAiIdx === -1) {
            if (window.toastr) window.toastr.warning('No AI message available to attach state to.', 'PersonaLyze');
            return;
        }

        // ─── Phase 0: Buffer & Guard ───
        const layers = getGridLayers();
        const labelInput = $('#plz-studio-label').val().trim();
        const anchorInput = $('#plz-studio-anchor').val().trim();

        // Bracket Guard: Check for LLM placeholders like [Leather] or [Adjective]
        const fullSerializedState = JSON.stringify(layers) + labelInput + anchorInput;
        if (fullSerializedState.includes('[') || fullSerializedState.includes(']')) {
            const confirmed = await callPopup(
                '<h3>Potential Placeholder Detected</h3>' +
                'Brackets <b style="color:var(--SmartThemeErrorColor);">[ ]</b> were found in your character details. ' +
                'Are you sure you want to save this state?',
                'confirm'
            );
            if (!confirmed) return;
        }

        // ─── Phase 1: Ghost Promotion ───
        if (id === '__new__') {
            if (!labelInput) {
                if (window.toastr) window.toastr.warning('Enter a character name first.', 'PersonaLyze');
                return;
            }
            
            // Derive unique ID
            let targetId = slugify(labelInput);
            if (state.chatCharacters[targetId]) {
                targetId += '_' + Date.now();
            }

            const charData = state.chatCharacters['__new__'];
            charData.label = labelInput;

            // Step 1: Promote via DNA Bulk Write (using verified lastAiIdx)
            
            // Definition & Label
            await lockedWriteCharacterDef(lastAiIdx, targetId, charData.identityAnchor, charData.seed, charData.engine);
            await lockedWriteLabel(lastAiIdx, targetId, labelInput);
            
            // Roster Membership
            const newRoster = [...new Set([...state.activeRoster, targetId])];
            await lockedWriteRoster(lastAiIdx, newRoster);
            setActiveRoster(newRoster);
            
            // Schema & Metadata
            if (charData.slots && charData.slots.length !== BASE_SLOTS.length) {
                await lockedWriteSlots(lastAiIdx, targetId, charData.slots);
            }
            if (charData.aka && charData.aka.length > 0) {
                await lockedWriteAka(lastAiIdx, targetId, charData.aka);
            }
            if (charData.styleName) {
                await lockedWriteCharacterStyle(lastAiIdx, targetId, charData.styleName);
            }

            // Step 2: Migrate In-Memory Registry
            state.chatCharacters[targetId] = charData;
            delete state.chatCharacters['__new__'];
            
            // Inject buffered layers
            state.characterChain[targetId] = { layers: structuredClone(layers), image: null };
            delete state.characterChain['__new__'];

            // Step 3: Switch context
            id = targetId;
            setWorkshopCharacter(id);
            
            document.dispatchEvent(new CustomEvent('plz:roster-changed'));
        }

        // ─── Phase 2: Visual State Commitment ───
        const char = state.chatCharacters[id];
        const prompt = compile(char.identityAnchor, layers);

        // Auto-Create Ensemble for the applied outfit
        const ensembleLabel = generateEnsembleLabel(layers);
        const ensembleKey   = generateEnsembleKey(layers);
        upsertChatEnsemble(id, ensembleKey, ensembleLabel, layers);
        await lockedWriteEnsemble(lastAiIdx, id, ensembleKey, ensembleLabel, layers);

        updateActiveCharacter(id);
        updateActiveLayers(layers);
        updateChainLayers(id, layers, null);

        // Record the narrative intent in DNA
        const recordId = await lockedWriteVisualState(lastAiIdx, id, layers, null);

        // Render UI
        renderDNAView();
        renderStudioView();

        // ─── Phase 3: Background Generation ───
        const s = getSettings();
        const engine = char.engine || s.defaultEngine || 'pollinations';

        try {
            const file = await generate(
                id, 
                'manual', 
                slugify(layers.emotion), 
                prompt, 
                layers.emotion, 
                layers.pose, 
                char.identityAnchor, 
                char.seed, 
                engine
            );

            // Asset Completion
            addToFileIndex(file);
            updateActiveImage(file);
            updateChainLayers(id, layers, file);
            await lockedPatchVisualStateImage(lastAiIdx, id, file, recordId);
            
        } catch (err) {
            error('Commit', 'Manual generation failed:', err);
            if (window.toastr) window.toastr.warning('Portrait generation failed, but visual state was saved.', 'PersonaLyze');
        }
    });
}