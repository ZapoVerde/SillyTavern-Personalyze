/**
 * @file data/default-user/extensions/personalyze/ui/workshop/dnaListeners.js
 * @stamp {"utc":"2026-04-10T23:40:00.000Z"}
 * @architectural-role UI Controller (Workshop DNA)
 * @description
 * Manages event listeners and rendering for the DNA, Studio, and Add tabs.
 * Implements the logic for the Layered Grid, Ensemble management, and 
 * Targeted Manual Extraction (Force Scan).
 * 
 * @api-declaration
 * renderDNAView()
 * renderStudioView()
 * bindDNAHandlers()
 * 
 * @contract
 *   assertions:
 *     purity: IO / Stateful UI
 *     state_ownership: [state (mutates via setters)]
 *     external_io: [dnaWriter.js, promptCompiler.js, imageCache.js, llm/workshop.js, DOM]
 */

import { getContext } from '../../../../../extensions.js';
import { callPopup } from '../../../../../../script.js';
import { 
    state, setWorkshopCharacter, updateActiveCharacter, updateActiveLayers, 
    updateActiveImage, addToFileIndex, updateChainLayers, setActiveRoster,
    upsertChatCharacterDef, upsertChatEnsemble, upsertChatDefaultEnsemble, deleteChatEnsemble
} from '../../state.js';
import { getSettings } from '../../settings.js';
import { slugify, buildDescriberContext, buildHistoryText } from '../../utils/history.js';
import { 
    lockedWriteCharacterDef, lockedWriteEnsemble, lockedWriteVisualState,
    lockedPatchVisualStateImage, lockedWriteRoster, lockedWriteDefaultEnsemble, lockedDeleteEnsemble
} from '../../io/dnaWriter.js';
import { detectAnchorScan, detectForceCostume } from '../../io/llm/workshop.js';
import { compilePrompt as compile } from '../../logic/promptCompiler.js';
import { parsePhase3 } from '../../logic/parsers.js';
import { generate } from '../../imageCache.js';
import { setPortrait } from '../../portrait.js';
import { getDnaRosterHTML, getStudioHTML, getStudioEmptyHTML } from './dnaTemplates.js';
import { switchTab } from './core.js';
import { smartResize } from '../../utils/dom.js';

/** Renders the character roster list. */
export function renderDNAView() {
    const html = getDnaRosterHTML(state.chatCharacters, state.activeRoster, state.activeCharacterId);
    $('#plz-tab-dna').html(html);
}

/** Renders the active character's dashboard grid. */
export function renderStudioView() {
    const id = state._workshopCharacterId;
    const char = id ? state.chatCharacters[id] : null;
    const $panel = $('#plz-tab-studio');

    if (!id || !char) {
        $panel.html(getStudioEmptyHTML());
        return;
    }

    const layers = state.characterChain[id]?.layers || state.activeLayers;
    $panel.html(getStudioHTML(id, char, layers));

    $panel.find('.plz-auto-textarea').each(function() { smartResize(this); });
}

/** Collects values from the Layered Grid into a layers object. */
function getGridLayers() {
    const layers = { emotion: $('#plz-layer-emotion').val().trim() || 'neutral' };
    $('.plz-layer-item').each(function() {
        const slot = $(this).data('slot');
        const item = $(this).val().trim();
        const mod = $(`.plz-layer-mod[data-slot="${slot}"]`).val().trim();
        layers[slot] = item ? { item, modifier: mod || null } : null;
    });
    return layers;
}

/** Binds all Workshop interaction events. */
export function bindDNAHandlers() {
    const $overlay = $('#plz-workshop-overlay');

    // ─── DNA Tab: Roster Management ───
    $overlay.on('click', '.plz-dna-toggle', async function(e) {
        const id = $(this).closest('.plz-roster-item').data('id');
        const isEnabled = state.activeRoster.includes(id);
        const newRoster = isEnabled ? state.activeRoster.filter(x => x !== id) : [...state.activeRoster, id];
        
        setActiveRoster(newRoster);
        renderDNAView();
        
        const lastMsgId = Math.max(0, getContext().chat.length - 1);
        await lockedWriteRoster(lastMsgId, newRoster);
    });

    $overlay.on('click', '.plz-dna-edit', function() {
        const id = $(this).closest('.plz-roster-item').data('id');
        setWorkshopCharacter(id);
        switchTab('studio');
    });

    // ─── Studio Tab: Identity & Layers ───
    $overlay.on('click', '#plz-studio-anchor-save', async function() {
        const id = state._workshopCharacterId;
        const anchor = $('#plz-studio-anchor').val().trim();
        if (!id || !anchor) return;
        const lastMsgId = Math.max(0, getContext().chat.length - 1);
        await lockedWriteCharacterDef(lastMsgId, id, anchor, state.chatCharacters[id].seed);
        upsertChatCharacterDef(id, anchor, state.chatCharacters[id].seed);
        if (window.toastr) window.toastr.success('Anchor saved to DNA.');
    });

    $overlay.on('click', '#plz-studio-layers-save', async function() {
        const id = state._workshopCharacterId;
        if (!id) return;
        const layers = getGridLayers();
        const char = state.chatCharacters[id];
        const prompt = compile(char.identityAnchor, layers);
        
        const lastAiIdx = getContext().chat.findLastIndex(m => !m.is_user);
        if (lastAiIdx === -1) return;

        updateActiveCharacter(id);
        updateActiveLayers(layers);
        updateChainLayers(id, layers, null);

        await lockedWriteVisualState(lastAiIdx, id, layers, null);

        try {
            const file = await generate(id, 'manual', slugify(layers.emotion), prompt, layers.emotion, char.identityAnchor, char.seed);
            addToFileIndex(file);
            updateActiveImage(file);
            updateChainLayers(id, layers, file);
            await lockedPatchVisualStateImage(lastAiIdx, id, file);
            setPortrait(file);
        } catch (err) { console.error(err); }
    });

    // ─── Studio Tab: Force Scan (Costume) ───
    $overlay.on('click', '#plz-studio-force-costume', async function() {
        const id = state._workshopCharacterId;
        if (!id) return;
        const s = getSettings();
        const hint = $('#plz-studio-hint').val().trim();
        const lastIdx = Math.max(0, getContext().chat.length - 1);
        const chat = getContext().chat;
        const currentTurn = buildDescriberContext(chat, lastIdx, 0);
        const history = buildHistoryText(chat, lastIdx, s.detectionHistory ?? 4);

        const $btn = $(this);
        $btn.prop('disabled', true).text('Scanning...');

        try {
            const raw = await detectForceCostume(history, currentTurn, id.replace(/_/g, ' '), hint, s.forceCostumeHintTemplate, s.smartProfileId, s.forceCostumePrompt);
            const layers = parsePhase3(raw);
            
            // Populate the UI inputs
            $('#plz-layer-emotion').val(layers.emotion || 'neutral');
            Object.entries(layers).forEach(([slot, val]) => {
                if (slot === 'emotion') return;
                $(`.plz-layer-item[data-slot="${slot}"]`).val(val?.item || '');
                $(`.plz-layer-mod[data-slot="${slot}"]`).val(val?.modifier || '');
            });
        } catch (err) {
            if (window.toastr) window.toastr.error('Force scan failed.');
        } finally {
            $btn.prop('disabled', false).text('Scan Current Turn');
        }
    });

    // ─── Ensembles ───
    $overlay.on('click', '.plz-save-ensemble-btn', async function() {
        const id = state._workshopCharacterId;
        const name = await callPopup('Save current layers as Ensemble:', 'input', '');
        if (!name) return;
        const layers = getGridLayers();
        const key = slugify(name);
        const lastMsgId = Math.max(0, getContext().chat.length - 1);
        await lockedWriteEnsemble(lastMsgId, id, key, name, layers);
        upsertChatEnsemble(id, key, name, layers);
        renderStudioView();
    });

    $overlay.on('click', '.plz-ensemble-load', function() {
        const id = state._workshopCharacterId;
        const key = $(this).closest('.plz-ensemble-item').data('key');
        const layers = state.chatCharacters[id].ensembles[key].layers;
        
        $('#plz-layer-emotion').val(layers.emotion);
        Object.entries(layers).forEach(([slot, val]) => {
            if (slot === 'emotion') return;
            $(`.plz-layer-item[data-slot="${slot}"]`).val(val?.item || '');
            $(`.plz-layer-mod[data-slot="${slot}"]`).val(val?.modifier || '');
        });
    });

    // ─── Ensemble Delete ───
    $overlay.on('click', '.plz-ensemble-delete', async function() {
        const id = state._workshopCharacterId;
        const key = $(this).closest('.plz-ensemble-item').data('key');
        if (!id || !key) return;
        const lastMsgId = Math.max(0, getContext().chat.length - 1);
        await lockedDeleteEnsemble(lastMsgId, id, key);
        deleteChatEnsemble(id, key);
        renderStudioView();
    });

    // ─── Default (Everyday Wear) Star ───
    $overlay.on('click', '.plz-ensemble-star', async function() {
        const id = state._workshopCharacterId;
        const key = $(this).closest('.plz-ensemble-item').data('key');
        if (!id || !key) return;

        const lastMsgId = Math.max(0, getContext().chat.length - 1);
        await lockedWriteDefaultEnsemble(lastMsgId, id, key);
        upsertChatDefaultEnsemble(id, key);
        renderStudioView();
    });

    // ─── Identity Scanning ───
    $overlay.on('click', '.plz-anchor-scan', async function() {
        const mode = $(this).data('mode');
        const s = getSettings();
        const lastIdx = Math.max(0, getContext().chat.length - 1);
        const context = buildDescriberContext(getContext().chat, lastIdx, s.describerHistory);
        
        // Force focus if a name is present in the input
        const focus = mode === 'add' ? $('#plz-add-name').val().trim() : state._workshopCharacterId;
        
        const result = await detectAnchorScan(context, focus, s.smartProfileId);
        if (result) {
            if (mode === 'add') {
                $('#plz-add-name').val(result.name);
                $('#plz-add-anchor').val(result.anchor).trigger('input');
            } else {
                $('#plz-studio-anchor').val(result.anchor).trigger('input');
            }
        }
    });

    // ─── Add Tab ───
    $overlay.on('click', '#plz-add-submit', async function() {
        const name = $('#plz-add-name').val().trim();
        const anchor = $('#plz-add-anchor').val().trim();
        if (!name || !anchor) return;
        const id = slugify(name);
        const lastMsgId = Math.max(0, getContext().chat.length - 1);
        await lockedWriteCharacterDef(lastMsgId, id, anchor, 1);
        upsertChatCharacterDef(id, anchor, 1);
        setWorkshopCharacter(id);
        switchTab('studio');
    });
}