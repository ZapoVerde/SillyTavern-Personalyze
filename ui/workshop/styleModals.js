/**
 * @file data/default-user/extensions/personalyze/ui/workshop/styleModals.js
 * @stamp {"utc":"2026-04-18T10:40:00.000Z"}
 * @architectural-role UI Logic (Global Style Modals)
 * @description
 * Manages specialized popups for editing a Global Style's technical render pipeline
 * and LoRA configuration. 
 * 
 * Updated for Inline Manual Entry:
 * 1. Replaced multi-step popups with direct Label/AIR inputs inside the main modals.
 * 2. Manual models are added to settings and immediately auto-selected in the dropdown.
 * 3. Manual LoRAs are registered and automatically appended to the active stack.
 * 4. Maintained strict association between manual LoRAs and the active model AIR.
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
import { 
    fetchRunwareLoras, 
    getCachedRunwareModels, 
    saveManualModel, 
    saveManualLora 
} from '../panel/models.js';
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
            const list = getCachedRunwareModels();
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

        <div id="plz-pop-manual-model-container" class="${draft.engine === 'runware' ? '' : 'plz-hidden'}" 
             style="background:rgba(0,0,0,0.15); border-radius:6px; padding:10px; border:1px solid var(--SmartThemeBorderColor);">
            <div style="font-size:0.75em; opacity:0.6; margin-bottom:8px; font-weight:bold; text-transform:uppercase;">Manual Import</div>
            <div style="display:flex; flex-direction:column; gap:8px;">
                <input id="plz-pop-manual-model-label" type="text" class="text_pole" placeholder="Label (e.g. Fancy Pony)" style="width:100%; font-size:0.85em;" />
                <div style="display:flex; gap:6px;">
                    <input id="plz-pop-manual-model-air" type="text" class="text_pole" placeholder="AIR (e.g. xyz@123)" style="flex:1; font-size:0.85em;" />
                    <button id="plz-pop-manual-model-btn" class="menu_button" style="padding:0 12px; font-size:0.85em;">Register</button>
                </div>
            </div>
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
            $('#plz-pop-manual-model-container').toggleClass('plz-hidden', draft.engine !== 'runware');
        });

        $(document).on('click.plzPop', '#plz-pop-manual-model-btn', function() {
            const label = $('#plz-pop-manual-model-label').val().trim();
            const air = $('#plz-pop-manual-model-air').val().trim();
            if (!label || !air) return;

            saveManualModel(label, air);
            draft.model = air;
            $('#plz-pop-model').html(buildModelOptions(draft.engine)).val(air);
            $('#plz-pop-manual-model-label, #plz-pop-manual-model-air').val('');
            if (window.toastr) window.toastr.success(`Model registered: ${label}`);
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
 */
export async function openLoraModal(currentLoras, engine, selectedModelAir) {
    const loras = structuredClone(currentLoras || []);
    
    let targetArch = null;
    let searchKeyword = "flux";

    if (engine === 'runware') {
        const models = getCachedRunwareModels();
        const activeModel = models.find(m => (m.air || m.modelId) === selectedModelAir);
        const label = (activeModel?.label || "").toLowerCase();
        targetArch = (activeModel?.architecture || "").toLowerCase();
        
        if (label.includes('pony') || targetArch.includes('pony')) {
            searchKeyword = "pony";
            targetArch = "sdxl";
        } else if (label.includes('flux') || targetArch.includes('flux')) {
            searchKeyword = "flux";
        } else if (label.includes('sdxl') || targetArch.includes('sdxl')) {
            searchKeyword = "sdxl";
        } else if (label.includes('sd 1.5') || targetArch.includes('sd 1.5')) {
            searchKeyword = "sd 1.5";
        }
    }

    const renderList = () => {
        const s = getSettings();
        const combinedRegistry = [...RUNWARE_LORA_REGISTRY, ...(s.runwareLoras || [])];
        const seen = new Set();
        
        const registry = combinedRegistry.filter(l => {
            const air = l.air || l.modelId;
            if (!air || seen.has(air)) return false;
            
            if (l.modelAir === selectedModelAir) {
                seen.add(air);
                return true;
            }

            if (targetArch) {
                const loraArch = (l.architecture || '').toLowerCase();
                if (loraArch) {
                    const match = (targetArch === 'sdxl') 
                        ? (loraArch === 'sdxl' || loraArch.includes('pony')) 
                        : loraArch.includes(targetArch);
                    if (!match) return false;
                }
            }
            seen.add(air);
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
    <div id="plz-lora-modal" style="display:flex; flex-direction:column; gap:12px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
            <h3 style="margin:0;">Manage LoRAs${archLabel}</h3>
            <div style="display:flex; gap:5px;">
                <button id="plz-pop-lora-fetch" class="menu_button" style="font-size:0.75em;" title="Fetch discovered LoRAs"><i class="fa-solid fa-cloud-arrow-down"></i> Fetch ${searchKeyword.toUpperCase()}</button>
                <button id="plz-pop-lora-add" class="menu_button" style="font-size:0.75em;"><i class="fa-solid fa-plus"></i> Add Stack</button>
            </div>
        </div>

        <div id="plz-pop-manual-lora-container" style="background:rgba(0,0,0,0.15); border-radius:6px; padding:10px; border:1px solid var(--SmartThemeBorderColor);">
            <div style="font-size:0.72em; opacity:0.6; margin-bottom:8px; font-weight:bold; text-transform:uppercase;">Register New LoRA (Link to this Model)</div>
            <div style="display:flex; flex-direction:column; gap:8px;">
                <input id="plz-pop-manual-lora-label" type="text" class="text_pole" placeholder="LoRA Label" style="width:100%; font-size:0.85em;" />
                <div style="display:flex; gap:6px;">
                    <input id="plz-pop-manual-lora-air" type="text" class="text_pole" placeholder="AIR (e.g. civitai:123@456)" style="flex:1; font-size:0.85em;" />
                    <button id="plz-pop-manual-lora-btn" class="menu_button" style="padding:0 12px; font-size:0.85em;">Link</button>
                </div>
            </div>
        </div>

        <div id="plz-pop-lora-list" style="max-height:240px; overflow-y:auto; border:1px solid rgba(255,255,255,0.05); border-radius:6px; padding:5px;">
            ${renderList()}
        </div>
        ${engine !== 'runware' ? '<p style="font-size:0.8em; opacity:0.6; margin-top:0;">Note: LoRAs are only supported by Runware.</p>' : ''}
    </div>`;

    return new Promise((resolve) => {
        callPopup(html, 'confirm').then(ok => {
            $(document).off('.plzLora');
            resolve(ok ? loras.filter(l => l.air) : null);
        });

        $(document).on('click.plzLora', '#plz-pop-manual-lora-btn', function() {
            const label = $('#plz-pop-manual-lora-label').val().trim();
            const air = $('#plz-pop-manual-lora-air').val().trim();
            if (!label || !air) return;

            saveManualLora(label, air, selectedModelAir);
            loras.push({ air: air, weight: 0.8 });
            
            $('#plz-pop-lora-list').html(renderList());
            $('#plz-pop-manual-lora-label, #plz-pop-manual-lora-air').val('');
            if (window.toastr) window.toastr.success(`LoRA linked to model.`);
        });

        $(document).on('click.plzLora', '#plz-pop-lora-fetch', async function() {
            const $btn = $(this);
            const original = $btn.html();
            $btn.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin"></i> Fetching...');
            try {
                await fetchRunwareLoras(searchKeyword);
                $('#plz-pop-lora-list').html(renderList());
                if (window.toastr) window.toastr.success(`Registry updated.`);
            } catch (err) {
                if (window.toastr) window.toastr.error('Failed to fetch LoRAs.');
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