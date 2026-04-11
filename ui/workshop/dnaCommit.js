/**
 * @file data/default-user/extensions/personalyze/ui/workshop/dnaCommit.js
 * @stamp {"utc":"2026-04-12T12:00:00.000Z"}
 * @architectural-role UI Sub-module (Promotion & Generation)
 * @description
 * The final commitment gateway for the Studio dashboard. 
 * Handles 'Apply to Turn' and the promotion of ghost characters ('__new__') 
 * into permanent DNA entries.
 * 
 * Orchestrates:
 * 1. Ghost-to-Permanent promotion (Slugification & Bulk Writing).
 * 2. Visual State intent writing.
 * 3. Portrait generation and asset patching.
 * 
 * @api-declaration
 * bindCommitHandlers($overlay)
 * 
 * @contract
 *   assertions:
 *     purity: IO / Stateful UI
 *     state_ownership: [state.chatCharacters, state._workshopCharacterId]
 *     external_io: [dnaWriter.js, imageCache.js, promptCompiler.js, state.js, DOM]
 */

import { getContext } from '../../../../../extensions.js';
import {
    state, setWorkshopCharacter, updateActiveCharacter, updateActiveLayers,
    updateActiveImage, addToFileIndex, updateChainLayers, setActiveRoster
} from '../../state.js';
import { getSettings } from '../../settings.js';
import { BASE_SLOTS } from '../../defaults.js';
import { slugify } from '../../utils/history.js';
import { error } from '../../utils/logger.js';
import {
    lockedWriteCharacterDef, lockedWriteLabel, lockedWriteAka,
    lockedWriteVisualState, lockedPatchVisualStateImage, 
    lockedWriteRoster, lockedWriteCharacterStyle, lockedWriteSlots
} from '../../io/dnaWriter.js';
import { compilePrompt as compile } from '../../logic/promptCompiler.js';
import { generate } from '../../imageCache.js';
import { setPortrait } from '../../portrait.js';
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

        const labelInput = $('#plz-studio-label').val().trim();

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

            // Step 1: Promote via DNA Bulk Write
            const lastMsgId = Math.max(0, getContext().chat.length - 1);
            
            // Definition & Label
            await lockedWriteCharacterDef(lastMsgId, targetId, charData.identityAnchor, charData.seed, charData.engine);
            await lockedWriteLabel(lastMsgId, targetId, labelInput);
            
            // Roster Membership
            const newRoster = [...new Set([...state.activeRoster, targetId])];
            await lockedWriteRoster(lastMsgId, newRoster);
            setActiveRoster(newRoster);
            
            // Schema & Metadata
            if (charData.slots && charData.slots.length !== BASE_SLOTS.length) {
                await lockedWriteSlots(lastMsgId, targetId, charData.slots);
            }
            if (charData.aka && charData.aka.length > 0) {
                await lockedWriteAka(lastMsgId, targetId, charData.aka);
            }
            if (charData.styleName) {
                await lockedWriteCharacterStyle(lastMsgId, targetId, charData.styleName);
            }

            // Step 2: Migrate In-Memory Registry
            state.chatCharacters[targetId] = charData;
            delete state.chatCharacters['__new__'];
            
            state.characterChain[targetId] = state.characterChain['__new__'];
            delete state.characterChain['__new__'];

            // Step 3: Switch context to new permanent ID
            id = targetId;
            setWorkshopCharacter(id);
            
            // Notify UI
            document.dispatchEvent(new CustomEvent('plz:roster-changed'));
            renderDNAView();
            renderStudioView();
        }

        // ─── Phase 2: Visual State Commitment ───
        const layers = getGridLayers();
        const char = state.chatCharacters[id];
        const prompt = compile(char.identityAnchor, layers);

        updateActiveCharacter(id);
        updateActiveLayers(layers);
        updateChainLayers(id, layers, null);

        // Record the narrative intent in DNA
        const recordId = await lockedWriteVisualState(lastAiIdx, id, layers, null);

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
            setPortrait(file);
            
        } catch (err) {
            error('Commit', 'Manual generation failed:', err);
            if (window.toastr) window.toastr.warning('Portrait generation failed, but visual state was saved.', 'PersonaLyze');
        }
    });
}