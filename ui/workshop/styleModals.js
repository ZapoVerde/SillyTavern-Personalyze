/**
 * @file data/default-user/extensions/personalyze/ui/workshop/styleModals.js
 * @stamp {"utc":"2026-04-17T02:00:00.000Z"}
 * @architectural-role UI Logic (Global Style Modals)
 * @description
 * Manages specialized popups for editing a Global Style's technical render pipeline
 * and LoRA configuration. 
 * 
 * Updated:
 * 1. openPipelineModal now uses dynamic Runware checkpoints from session cache.
 * 2. openLoraModal now implements architecture-based filtering and a fetch button.
 * 3. Integrated Pony/SDXL architecture grouping for filtering logic.
 * 
 * @api-declaration
 * openPipelineModal(styleObj) -> Promise<Object>
 * openLoraModal(currentLoras, engine, selectedModelAir) -> Promise<Array>
 * 
 * @contract
 *   assertions:
 *     purity: IO / Stateful UI
 *     state_ownership: []
 *     external_io: [callPopup, jQuery, models.js, settings.js]
 */

import { callPopup } from '../../../../../../script.js';
import { getSettings } from '../../settings.js';
import { escapeHtml } from '../../utils/history.js';
import { fetchRunwareLoras, getCachedRunwareModels } from '../panel/models.js';
import { 
    POLLINATIONS_MODELS, 
    FAL_MODELS, 
    PIAPI_MODELS, 
    RUNWARE_MODELS, 
    RESOLUTION_OVERRIDES,
    RUNWARE_LORA_REGISTRY 
} from '../../defaults.js';

/**
 * Opens a modal to configure the technical render pipeline.
 * @param {Object} styleObj - The current style configuration.
 */
export async function openPipelineModal(styleObj) {
    const draft = {
        engine: styleObj.engine,
        model: styleObj.model,
        resolutionOverride: styleObj.resolutionOverride,
        useLayerDiffuse: !!styleObj.useLayerDiffuse
    };

    const buildModelOptions = (engine) => {
        if (engine === 'runware') {
            const dynamic = getCachedRunwareModels();
            const list = (dynamic && dynamic.length > 0) ? dynamic : RUNWARE_MODELS;
            return list.map(m => {
                const air = m.air || m.modelId;
                const label = m.label || m.name || air;
                return `<option value="${escapeHtml(air)}" ${draft.model === air ? 'selected' : ''}>${escapeHtml(label)}</option>`;
            }).join('');
        }
        const list = engine === 'fal' ? FAL_MODELS : engine === 'piapi' ? PIAPI_MODELS : POLLINATIONS_MODELS;
        return list.map(m => `<option value="${escapeHtml(m)}" ${draft.model === m ? 'selected' : ''}>${escapeHtml(m)}</option>`).join('');
    };

    const html = `
    <div id="plz-pipeline-modal" style="display:flex; flex-direction:column; gap:12px;">
        <h3 style="margin:0;">Render Pipeline Settings</h3>
        
        <div>
            <label style="display:block; font-size:0.8em; opacity:0.6; margin-bottom:4px;">Generation Engine</label>
            <select id="plz-pop-engine" class="text_pole" style="width:100%;">
                <option value="pollinations" ${draft.engine === 'pollinations' ? 'selected' : ''}>Pollinations</option>
                <option value="fal" ${draft.engine === 'fal' ? 'selected' : ''}>Fal AI</option>
                <option value="piapi" ${draft.engine === 'piapi' ? 'selected' : ''}>PiAPI</option>
                <option value="runware" ${draft.engine === 'runware' ? 'selected' : ''}>Runware</option>
            </select>
        </div>

        <div>
            <label style="display:block; font-size:0.8em; opacity:0.6; margin-bottom:4px;">Model Selection</label>
            <select id="plz-pop-model" class="text_pole" style="width:100%;">
                ${buildModelOptions(draft.engine)}
            </select>
        </div>

        <div>
            <label style="display:block; font-size:0.8em; opacity:0.6; margin-bottom:4px;">Resolution Override</label>
            <select id="plz-pop-res" class="text_pole" style="width:100%;">
                ${RESOLUTION_OVERRIDES.map(r => `<option value="${escapeHtml(r.value || '')}" ${draft.resolutionOverride === r.value ? 'selected' : ''}>${escapeHtml(r.label)}</option>`).join('')}
            </select>
        </div>

        <div id="plz-pop-transparency-container" class="${draft.engine === 'runware' ? '' : 'plz-hidden'}">
            <label class="checkbox_label" style="font-size:0.9em; cursor:pointer;">
                <input type="checkbox" id="plz-pop-layerdiffuse" ${draft.useLayerDiffuse ? 'checked' : ''} />
                <span>Use LayerDiffuse (Native Alpha)</span>
            </label>
        </div>
    </div>`;

    return new Promise((resolve) => {
        callPopup(html, 'confirm').then(ok => {
            $(document).off('.plzPop');
            resolve(ok ? draft : null);
        });

        $(document).on('change.plzPop', '#plz-pop-engine', function() {
            draft.engine = $(this).val();
            const defModel = (draft.engine === 'runware') ? RUNWARE_MODELS[0].air : 
                             (draft.engine === 'fal') ? FAL_MODELS[0] : 
                             (draft.engine === 'piapi') ? PIAPI_MODELS[0] : POLLINATIONS_MODELS[0];
            draft.model = defModel;
            $('#plz-pop-model').html(buildModelOptions(draft.engine));
            $('#plz-pop-transparency-container').toggleClass('plz-hidden', draft.engine !== 'runware');
        });

        $(document).on('change.plzPop', '#plz-pop-model', function() {
            draft.model = $(this).val();
        });

        $(document).on('change.plzPop', '#plz-pop-res', function() {
            draft.resolutionOverride = $(this).val() || null;
        });

        $(document).on('change.plzPop', '#plz-pop-layerdiffuse', function() {
            draft.useLayerDiffuse = $(this).prop('checked');
        });
    });
}

/**
 * Opens a modal to manage the LoRA stack.
 * Implements architecture-based filtering for Runware LoRAs.
 */
export async function openLoraModal(currentLoras, engine, selectedModelAir) {
    const loras = structuredClone(currentLoras || []);
    
    // Determine target architecture for filtering
    let targetArch = null;
    if (engine === 'runware') {
        const models = getCachedRunwareModels();
        const activeModel = models.find(m => (m.air || m.modelId) === selectedModelAir);
        targetArch = activeModel?.architecture?.toLowerCase() || '';
        
        // Pony grouping: Pony is technically SDXL
        if (targetArch.includes('pony')) targetArch = 'sdxl';
    }

    const renderList = () => {
        // Combined list: Hardcoded Fallbacks + Persistent Settings
        const s = getSettings();
        const combinedRegistry = [...RUNWARE_LORA_REGISTRY, ...(s.runwareLoras || [])];
        
        // Deduplicate by AIR
        const seen = new Set();
        const registry = combinedRegistry.filter(l => {
            if (!l.air || seen.has(l.air)) return false;
            seen.add(l.air);
            
            // Apply filtering logic if engine is Runware and architecture is known
            if (targetArch) {
                const loraArch = (l.architecture || '').toLowerCase();
                // Check for match, including pony/sdxl crossover
                if (targetArch === 'sdxl') {
                    return loraArch === 'sdxl' || loraArch.includes('pony');
                }
                return loraArch.includes(targetArch);
            }
            return true;
        });

        if (!loras.length) return `<div style="text-align:center; opacity:0.5; padding:10px;">No LoRAs added.</div>`;
        
        return loras.map((l, i) => `
            <div class="plz-pop-lora-row" style="display:flex; gap:8px; align-items:center; margin-bottom:8px;">
                <select class="plz-pop-lora-air text_pole" data-idx="${i}" style="flex:2;">
                    <option value="">— Select LoRA —</option>
                    ${registry.map(r => `<option value="${escapeHtml(r.air)}" ${l.air === r.air ? 'selected' : ''}>${escapeHtml(r.label || r.name)}</option>`).join('')}
                </select>
                <input type="number" class="plz-pop-lora-weight text_pole" data-idx="${i}" step="0.1" value="${l.weight ?? 0.8}" style="width:60px;" />
                <button class="plz-pop-lora-del menu_button" data-idx="${i}" style="color:var(--SmartThemeErrorColor);"><i class="fa-solid fa-trash"></i></button>
            </div>
        `).join('');
    };

    const archLabel = targetArch ? ` <small style="opacity:0.5;">(Filtered for ${targetArch.toUpperCase()})</small>` : '';
    const html = `
    <div id="plz-lora-modal">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <h3 style="margin:0;">Manage LoRAs${archLabel}</h3>
            <div style="display:flex; gap:5px;">
                <button id="plz-pop-lora-fetch" class="menu_button" title="Fetch Top 300 LoRAs (Requires VPN for Civitai)"><i class="fa-solid fa-cloud-arrow-down"></i> Fetch Top 300</button>
                <button id="plz-pop-lora-add" class="menu_button"><i class="fa-solid fa-plus"></i> Add</button>
            </div>
        </div>
        <div id="plz-pop-lora-list" style="max-height:300px; overflow-y:auto;">${renderList()}</div>
        ${engine !== 'runware' ? '<p style="font-size:0.8em; opacity:0.6; margin-top:10px;">Note: LoRAs are currently only supported by the Runware engine.</p>' : ''}
    </div>`;

    return new Promise((resolve) => {
        callPopup(html, 'confirm').then(ok => {
            $(document).off('.plzLora');
            resolve(ok ? loras.filter(l => l.air) : null);
        });

        $(document).on('click.plzLora', '#plz-pop-lora-fetch', async function() {
            const $btn = $(this);
            const original = $btn.html();
            $btn.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin"></i> Fetching...');
            try {
                await fetchRunwareLoras();
                $('#plz-pop-lora-list').html(renderList());
                if (window.toastr) window.toastr.success('LoRA registry updated.');
            } catch (err) {
                if (window.toastr) window.toastr.error('Failed to fetch LoRAs. Ensure VPN is active.');
            } finally {
                $btn.prop('disabled', false).html(original);
            }
        });

        $(document).on('click.plzLora', '#plz-pop-lora-add', () => {
            loras.push({ air: '', weight: 0.8 });
            $('#plz-pop-lora-list').html(renderList());
        });

        $(document).on('click.plzLora', '.plz-pop-lora-del', function() {
            loras.splice($(this).data('idx'), 1);
            $('#plz-pop-lora-list').html(renderList());
        });

        $(document).on('change.plzLora', '.plz-pop-lora-air', function() {
            loras[$(this).data('idx')].air = $(this).val();
        });

        $(document).on('input.plzLora', '.plz-pop-lora-weight', function() {
            loras[$(this).data('idx')].weight = parseFloat($(this).val()) || 0.0;
        });
    });
}