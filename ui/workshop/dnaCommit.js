/**
 * @file data/default-user/extensions/personalyze/ui/workshop/dnaCommit.js
 * @stamp {"utc":"2026-04-17T17:10:00.000Z"}
 * @architectural-role UI Sub-module (Promotion & Generation)
 * @description
 * The final commitment gateway for the Studio dashboard. 
 * Handles 'Apply to Turn' and the promotion of ghost characters ('__new__') 
 * into permanent DNA entries.
 * 
 * Updated for Dynamic Variable Architecture:
 * 1. Removed compilePrompt usage; generate() now handles iterative prompt synthesis.
 * 
 * @api-declaration
 * bindCommitHandlers($overlay)
 * 
 * @contract
 *   assertions:
 *     purity: IO / Stateful UI
 *     state_ownership: [state.chatCharacters, state._workshopCharacterId]
 *     external_io: [dnaWriter.js, imageCache.js, state.js, callPopup, DOM]
 */

import { getContext } from '../../../../../extensions.js';
import { callPopup } from '../../../../../../script.js';
import {
    state, setWorkshopCharacter, updateActiveCharacter, updateActiveLayers,
    updateActiveImage, addToFileIndex, updateChainLayers, setActiveRoster,
    upsertChatEnsemble, removeFromFileIndex
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
import { generateEnsembleLabel, generateEnsembleKey } from '../../logic/parsers.js';
import { generate, deleteFiles } from '../../imageCache.js';
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

        // Bracket Guard: Check for LLM placeholders
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
            
            let targetId = slugify(labelInput);
            if (state.chatCharacters[targetId]) {
                targetId += '_' + Date.now();
            }

            const charData = state.chatCharacters['__new__'];
            charData.label = labelInput;

            await lockedWriteCharacterDef(lastAiIdx, targetId, charData.identity, charData.seed);
            await lockedWriteLabel(lastAiIdx, targetId, labelInput);
            
            const newRoster = [...new Set([...state.activeRoster, targetId])];
            await lockedWriteRoster(lastAiIdx, newRoster);
            setActiveRoster(newRoster);
            
            if (charData.slots && charData.slots.length !== BASE_SLOTS.length) {
                await lockedWriteSlots(lastAiIdx, targetId, charData.slots);
            }
            if (charData.aka && charData.aka.length > 0) {
                await lockedWriteAka(lastAiIdx, targetId, charData.aka);
            }
            if (charData.styleName) {
                await lockedWriteCharacterStyle(lastAiIdx, targetId, charData.styleName);
            }

            state.chatCharacters[targetId] = charData;
            delete state.chatCharacters['__new__'];
            
            state.characterChain[targetId] = { layers: structuredClone(layers), image: null };
            delete state.characterChain['__new__'];

            id = targetId;
            setWorkshopCharacter(id);
            
            document.dispatchEvent(new CustomEvent('plz:roster-changed'));
        }

        // ─── Phase 2: Visual State Commitment ───
        const char = state.chatCharacters[id];

        const ensembleLabel = generateEnsembleLabel(layers);
        const ensembleKey   = generateEnsembleKey(layers);
        upsertChatEnsemble(id, ensembleKey, ensembleLabel, layers);
        await lockedWriteEnsemble(lastAiIdx, id, ensembleKey, ensembleLabel, layers);

        updateActiveCharacter(id);
        updateActiveLayers(layers);
        updateChainLayers(id, layers, null);

        const recordId = await lockedWriteVisualState(lastAiIdx, id, layers, null);

        renderDNAView();
        renderStudioView();

        // ─── Phase 3: Background Generation ───
        const s = getSettings();

        try {
            const emotionSlug = slugify(layers.emotion);
            const file = await generate(
                id, 
                'manual', 
                emotionSlug, 
                layers, 
                layers.emotion, 
                layers.pose, 
                char.identity,
                char.seed
            );

            addToFileIndex(file);
            updateActiveImage(file);
            updateChainLayers(id, layers, file);
            await lockedPatchVisualStateImage(lastAiIdx, id, file, recordId);
            
            // Ephemeral Cleanup: delete previous active images for this character (regardless of tag/emotion)
            if (!s.keepCache) {
                const charPrefix = `plz_${id}_`;
                const staleFiles = Array.from(state.fileIndex).filter(f => 
                    f.startsWith(charPrefix) && f !== file
                );
                
                if (staleFiles.length > 0) {
                    await deleteFiles(staleFiles);
                    removeFromFileIndex(staleFiles);
                }
            }

        } catch (err) {
            error('Commit', 'Manual generation failed:', err);
            if (window.toastr) window.toastr.warning('Portrait generation failed, but visual state was saved.', 'PersonaLyze');
        }
    });
}