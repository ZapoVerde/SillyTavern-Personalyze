/**
 * @file data/default-user/extensions/personalyze/ui/workshop/styleModals.js
 * @stamp {"utc":"2026-04-16T23:59:00.000Z"}
 * @architectural-role UI Logic (Global Style Modals)
 * @description
 * Manages specialized popups for editing a Global Style's technical render pipeline
 * and LoRA configuration. Decouples complex modal logic from the main Styles tab.
 * 
 * @api-declaration
 * openPipelineModal(styleObj) -> Promise<Object>
 * openLoraModal(loras) -> Promise<Array>
 * 
 * @contract
 *   assertions:
 *     purity: IO / Stateful UI
 *     state_ownership: []
 *     external_io: [callPopup, jQuery]
 */

import { callPopup } from '../../../../../../script.js';
import { escapeHtml } from '../../utils/history.js';
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
    const buildModelOptions = (engine) => {
        if (engine === 'runware') return RUNWARE_MODELS.map(m => `<option value="${escapeHtml(m.air)}" ${styleObj.model === m.air ? 'selected' : ''}>${escapeHtml(m.label)}</option>`).join('');
        const list = engine === 'fal' ? FAL_MODELS : engine === 'piapi' ? PIAPI_MODELS : POLLINATIONS_MODELS;
        return list.map(m => `<option value="${escapeHtml(m)}" ${styleObj.model === m ? 'selected' : ''}>${escapeHtml(m)}</option>`).join('');
    };

    const html = `
    <div id="plz-pipeline-modal" style="display:flex; flex-direction:column; gap:12px;">
        <h3 style="margin:0;">Render Pipeline Settings</h3>
        
        <div>
            <label style="display:block; font-size:0.8em; opacity:0.6; margin-bottom:4px;">Generation Engine</label>
            <select id="plz-pop-engine" class="text_pole" style="width:100%;">
                <option value="pollinations" ${styleObj.engine === 'pollinations' ? 'selected' : ''}>Pollinations</option>
                <option value="fal" ${styleObj.engine === 'fal' ? 'selected' : ''}>Fal AI</option>
                <option value="piapi" ${styleObj.engine === 'piapi' ? 'selected' : ''}>PiAPI</option>
                <option value="runware" ${styleObj.engine === 'runware' ? 'selected' : ''}>Runware</option>
            </select>
        </div>

        <div>
            <label style="display:block; font-size:0.8em; opacity:0.6; margin-bottom:4px;">Model Selection</label>
            <select id="plz-pop-model" class="text_pole" style="width:100%;">
                ${buildModelOptions(styleObj.engine)}
            </select>
        </div>

        <div>
            <label style="display:block; font-size:0.8em; opacity:0.6; margin-bottom:4px;">Resolution Override</label>
            <select id="plz-pop-res" class="text_pole" style="width:100%;">
                ${RESOLUTION_OVERRIDES.map(r => `<option value="${escapeHtml(r.value || '')}" ${styleObj.resolutionOverride === r.value ? 'selected' : ''}>${escapeHtml(r.label)}</option>`).join('')}
            </select>
        </div>

        <div id="plz-pop-transparency-container" class="${styleObj.engine === 'runware' ? '' : 'plz-hidden'}">
            <label class="checkbox_label" style="font-size:0.9em; cursor:pointer;">
                <input type="checkbox" id="plz-pop-layerdiffuse" ${styleObj.useLayerDiffuse ? 'checked' : ''} />
                <span>Use LayerDiffuse (Native Alpha)</span>
            </label>
        </div>
    </div>`;

    return new Promise((resolve) => {
        callPopup(html, 'confirm').then(ok => {
            $(document).off('.plzPop');
            if (!ok) return resolve(null);
            resolve({
                engine: $('#plz-pop-engine').val(),
                model: $('#plz-pop-model').val(),
                resolutionOverride: $('#plz-pop-res').val() || null,
                useLayerDiffuse: $('#plz-pop-layerdiffuse').prop('checked')
            });
        });

        // Cascading Logic
        $(document).on('change.plzPop', '#plz-pop-engine', function() {
            const engine = $(this).val();
            $('#plz-pop-model').html(buildModelOptions(engine));
            $('#plz-pop-transparency-container').toggleClass('plz-hidden', engine !== 'runware');
        });
    });
}

/**
 * Opens a modal to manage the LoRA stack.
 */
export async function openLoraModal(currentLoras) {
    const loras = structuredClone(currentLoras || []);
    
    const renderList = () => {
        if (!loras.length) return `<div style="text-align:center; opacity:0.5; padding:10px;">No LoRAs added.</div>`;
        return loras.map((l, i) => `
            <div class="plz-pop-lora-row" style="display:flex; gap:8px; align-items:center; margin-bottom:8px;">
                <select class="plz-pop-lora-air text_pole" data-idx="${i}" style="flex:2;">
                    <option value="">— Select LoRA —</option>
                    ${RUNWARE_LORA_REGISTRY.map(r => `<option value="${escapeHtml(r.air)}" ${l.air === r.air ? 'selected' : ''}>${escapeHtml(r.label)}</option>`).join('')}
                </select>
                <input type="number" class="plz-pop-lora-weight text_pole" data-idx="${i}" step="0.1" value="${l.weight ?? 0.8}" style="width:60px;" />
                <button class="plz-pop-lora-del menu_button" data-idx="${i}" style="color:var(--SmartThemeErrorColor);"><i class="fa-solid fa-trash"></i></button>
            </div>
        `).join('');
    };

    const html = `
    <div id="plz-lora-modal">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <h3 style="margin:0;">Manage LoRAs</h3>
            <button id="plz-pop-lora-add" class="menu_button"><i class="fa-solid fa-plus"></i> Add</button>
        </div>
        <div id="plz-pop-lora-list" style="max-height:300px; overflow-y:auto;">${renderList()}</div>
    </div>`;

    return new Promise((resolve) => {
        callPopup(html, 'confirm').then(ok => {
            $(document).off('.plzLora');
            if (!ok) return resolve(null);
            resolve(loras.filter(l => l.air));
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