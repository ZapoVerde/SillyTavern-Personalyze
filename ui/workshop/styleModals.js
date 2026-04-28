/**
 * @file data/default-user/extensions/personalyze/ui/workshop/styleModals.js
 * @stamp {"utc":"2026-04-28T00:00:00.000Z"}
 * @architectural-role UI Logic (Global Style Modals)
 * @description
 * Manages specialized popups for editing a Global Style's technical render pipeline.
 * Implements the Dynamic Blueprint UI: Parameters are fetched per-model from the
 * Model Registry and generated using the styleParamGenerator.
 *
 * Migrated from callPopup to self-owned openModal overlay.
 *
 * @api-declaration
 * openPipelineModal(styleObj) -> Promise<Object>
 * openLoraModal(currentLoras, engine, selectedModelAir) -> Promise<Array>
 *
 * @contract
 *   assertions:
 *     purity: IO / Stateful UI
 *     state_ownership: []
 *     external_io: [openModal, jQuery, models.js, modelRegistry.js, blueprintEditor.js]
 */

import { openModal } from '../../utils/modal.js';
import { getSettings } from '../../settings.js';
import { escapeHtml } from '../../utils/history.js';
import { getModelBlueprint, getAllRegisteredModels } from '../../modelRegistry.js';
import { openBlueprintEditor } from '../models/blueprintEditor.js';
import { openModelManager } from '../models/modelManagerModal.js';
import {
    buildParamsHTML,
    scrapeParamValues
} from './styleParamGenerator.js';
import {
    fetchRunwareLoras,
    getCachedRunwareModels,
    saveManualLora
} from '../panel/models.js';
import {
    POLLINATIONS_MODELS,
    FAL_MODELS,
    PIAPI_MODELS,
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
        useLayerDiffuse: !!styleObj.useLayerDiffuse,
        engineParams: structuredClone(styleObj.engineParams || {})
    };

    const buildModelOptions = (engine) => {
        let options = '';
        const registered = getAllRegisteredModels();

        if (engine === 'runware') {
            const list = getCachedRunwareModels();
            const seen = new Set();
            options = list.map(m => {
                const air = m.air || m.modelId;
                seen.add(air);
                return `<option value="${escapeHtml(air)}" ${draft.model === air ? 'selected' : ''}>${escapeHtml(m.label || air)}</option>`;
            }).join('');
            const extras = registered.filter(id => !seen.has(id) && (String(id).includes('runware') || String(id).includes(':')));
            if (extras.length > 0) {
                options += `<optgroup label="Custom Registered">${extras.map(id => `<option value="${escapeHtml(id)}" ${draft.model === id ? 'selected' : ''}>${escapeHtml(id)}</option>`).join('')}</optgroup>`;
            }
        } else {
            const list = engine === 'fal' ? FAL_MODELS : engine === 'piapi' ? PIAPI_MODELS : POLLINATIONS_MODELS;
            options = list.map(m => `<option value="${escapeHtml(m)}" ${draft.model === m ? 'selected' : ''}>${escapeHtml(m)}</option>`).join('');
            const extras = registered.filter(id => !list.includes(id) && !id.includes(':'));
            if (extras.length > 0) {
                options += `<optgroup label="Custom Registered">${extras.map(id => `<option value="${escapeHtml(id)}" ${draft.model === id ? 'selected' : ''}>${escapeHtml(id)}</option>`).join('')}</optgroup>`;
            }
        }
        return options;
    };

    const content = `
    <div id="plz-pipeline-modal" style="display:flex; flex-direction:column; gap:12px;">
        <h3 style="margin:0;">Render Pipeline Settings</h3>

        <div class="plz-pop-section">
            <label class="plz-studio-label">Generation Engine</label>
            <select id="plz-pop-engine" class="text_pole" style="width:100%;">
                <option value="pollinations" ${draft.engine === 'pollinations' ? 'selected' : ''}>Pollinations</option>
                <option value="fal" ${draft.engine === 'fal' ? 'selected' : ''}>Fal AI</option>
                <option value="piapi" ${draft.engine === 'piapi' ? 'selected' : ''}>PiAPI</option>
                <option value="runware" ${draft.engine === 'runware' ? 'selected' : ''}>Runware</option>
            </select>
        </div>

        <div class="plz-pop-section">
            <label class="plz-studio-label">Model Selection</label>
            <div style="display:flex; gap:6px;">
                <select id="plz-pop-model" class="text_pole" style="flex:1;">
                    ${buildModelOptions(draft.engine)}
                </select>
                <button id="plz-pop-register-model" class="menu_button" title="Register New Model/AIR ID">
                    <i class="fa-solid fa-plus"></i>
                </button>
                <button id="plz-pop-edit-blueprint" class="menu_button" title="Edit Model API Blueprint">
                    <i class="fa-solid fa-code"></i>
                </button>
            </div>
        </div>

        <div id="plz-pop-params-container" style="background:rgba(255,255,255,0.03); border-radius:6px; padding:8px; border:1px solid rgba(255,255,255,0.05);">
        </div>

        <div>
            <label class="plz-studio-label">Resolution Override</label>
            <select id="plz-pop-res" class="text_pole" style="width:100%;">
                ${RESOLUTION_OVERRIDES.map(r => `<option value="${escapeHtml(r.value || '')}" ${draft.resolutionOverride === r.value ? 'selected' : ''}>${escapeHtml(r.label)}</option>`).join('')}
            </select>
        </div>

        <div id="plz-pop-transparency-container" class="${draft.engine === 'runware' ? '' : 'plz-hidden'}">
            <label class="checkbox_label" style="cursor:pointer;"><input type="checkbox" id="plz-pop-layerdiffuse" ${draft.useLayerDiffuse ? 'checked' : ''} /><span>Use LayerDiffuse (Native Alpha)</span></label>
        </div>
    </div>`;

    const result = await openModal({
        content,
        width: 'min(480px, 92vw)',
        buttons: [
            {
                label: 'OK',
                onClick: ($m, resolve) => {
                    draft.engineParams = scrapeParamValues($m.find('#plz-pop-params-container'));
                    resolve(draft);
                },
            },
            { label: 'Cancel', value: null, style: 'muted' },
        ],
        onReady: ($m) => {
            // Initial params render
            $m.find('#plz-pop-params-container').html(buildParamsHTML(getModelBlueprint(draft.model), draft.engineParams));

            $m.on('change', '#plz-pop-engine', function() {
                draft.engine = $(this).val();
                draft.model = (draft.engine === 'runware') ? 'runware:100@1'
                            : (draft.engine === 'fal') ? FAL_MODELS[0]
                            : POLLINATIONS_MODELS[0];
                $m.find('#plz-pop-model').html(buildModelOptions(draft.engine));
                $m.find('#plz-pop-transparency-container').toggleClass('plz-hidden', draft.engine !== 'runware');
                $m.find('#plz-pop-params-container').html(buildParamsHTML(getModelBlueprint(draft.model), draft.engineParams));
            });

            $m.on('change', '#plz-pop-model', function() {
                draft.model = $(this).val();
                $m.find('#plz-pop-params-container').html(buildParamsHTML(getModelBlueprint(draft.model), draft.engineParams));
            });

            $m.on('click', '#plz-pop-register-model', async function() {
                await openModelManager();
                $m.find('#plz-pop-model').html(buildModelOptions(draft.engine));
            });

            $m.on('click', '#plz-pop-edit-blueprint', async function() {
                const saved = await openBlueprintEditor(draft.model);
                if (saved) $m.find('#plz-pop-params-container').html(buildParamsHTML(getModelBlueprint(draft.model), draft.engineParams));
            });

            $m.on('input', '.plz-style-param[type="range"]', function() {
                $(this).closest('.plz-style-param-row').find('.plz-param-value').text($(this).val());
            });

            $m.on('change', '#plz-pop-res', function() { draft.resolutionOverride = $(this).val() || null; });
            $m.on('change', '#plz-pop-layerdiffuse', function() { draft.useLayerDiffuse = $(this).prop('checked'); });
        },
    });

    return result;
}

/**
 * Opens a modal to manage the LoRA stack.
 */
export async function openLoraModal(currentLoras, engine, selectedModelAir) {
    const loras = structuredClone(currentLoras || []);
    const arch = String(selectedModelAir).toLowerCase();
    const searchKeyword = (arch.includes('pony') || arch.includes('sdxl')) ? 'sdxl'
                        : (arch.includes('flux')) ? 'flux'
                        : (arch.includes('sd 1.5') || arch.includes('v1-5')) ? 'sd 1.5'
                        : 'flux';

    const renderList = () => {
        const s = getSettings();
        const combinedRegistry = [...RUNWARE_LORA_REGISTRY, ...(s.runwareLoras || [])];
        const seen = new Set();
        const registry = combinedRegistry.filter(l => {
            const air = l.air || l.modelId;
            if (!air || seen.has(air)) return false;
            seen.add(air);
            return true;
        });

        if (!loras.length) return `<div style="text-align:center; opacity:0.5; padding:10px;">No LoRAs added.</div>`;

        return loras.map((l, i) => `
            <div class="plz-pop-lora-row" style="display:flex; gap:8px; align-items:center; margin-bottom:8px;">
                <select class="plz-pop-lora-air text_pole" data-idx="${i}" style="flex:1;">
                    <option value="">— Select LoRA —</option>
                    ${registry.map(r => `<option value="${escapeHtml(r.air)}" ${l.air === r.air ? 'selected' : ''}>${escapeHtml(r.label || r.name)}</option>`).join('')}
                </select>
                <input type="number" class="plz-pop-lora-weight text_pole" data-idx="${i}" step="0.1" value="${l.weight ?? 0.8}" style="width:60px;" />
                <button class="plz-pop-lora-del menu_button" data-idx="${i}" style="color:var(--SmartThemeErrorColor);"><i class="fa-solid fa-trash"></i></button>
            </div>`).join('');
    };

    const content = `
    <div id="plz-lora-modal" style="display:flex; flex-direction:column; gap:12px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
            <h3 style="margin:0;">Manage LoRAs</h3>
            <div style="display:flex; gap:5px;">
                <button id="plz-pop-lora-fetch" class="menu_button" style="font-size:0.75em;" title="Fetch discovered LoRAs"><i class="fa-solid fa-cloud-arrow-down"></i> Fetch ${searchKeyword.toUpperCase()}</button>
                <button id="plz-pop-lora-add" class="menu_button" style="font-size:0.75em;"><i class="fa-solid fa-plus"></i> Add Stack</button>
            </div>
        </div>
        <div id="plz-pop-manual-lora-container" style="background:rgba(0,0,0,0.15); border-radius:6px; padding:10px; border:1px solid var(--SmartThemeBorderColor);">
            <div style="font-size:0.72em; opacity:0.6; margin-bottom:8px; font-weight:bold; text-transform:uppercase;">Register New LoRA</div>
            <input id="plz-pop-manual-lora-label" type="text" class="text_pole" placeholder="LoRA Label" style="width:100%; margin-bottom:8px;" />
            <div style="display:flex; gap:6px;">
                <input id="plz-pop-manual-lora-air" type="text" class="text_pole" placeholder="AIR" style="flex:1;" />
                <button id="plz-pop-manual-lora-btn" class="menu_button">Link</button>
            </div>
        </div>
        <div id="plz-pop-lora-list" style="max-height:240px; overflow-y:auto; border:1px solid rgba(255,255,255,0.05); border-radius:6px; padding:5px;">${renderList()}</div>
    </div>`;

    const result = await openModal({
        content,
        width: 'min(480px, 92vw)',
        buttons: [
            {
                label: 'OK',
                onClick: ($m, resolve) => resolve(loras.filter(l => l.air)),
            },
            { label: 'Cancel', value: null, style: 'muted' },
        ],
        onReady: ($m) => {
            $m.on('click', '#plz-pop-manual-lora-btn', function() {
                const label = $m.find('#plz-pop-manual-lora-label').val().trim();
                const air = $m.find('#plz-pop-manual-lora-air').val().trim();
                if (!label || !air) return;
                saveManualLora(label, air, selectedModelAir);
                loras.push({ air, weight: 0.8 });
                $m.find('#plz-pop-lora-list').html(renderList());
                $m.find('#plz-pop-manual-lora-label, #plz-pop-manual-lora-air').val('');
            });

            $m.on('click', '#plz-pop-lora-fetch', async function() {
                const $btn = $(this);
                const original = $btn.html();
                $btn.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin"></i> Fetching...');
                try {
                    await fetchRunwareLoras(searchKeyword);
                    $m.find('#plz-pop-lora-list').html(renderList());
                } catch (err) {
                    if (window.toastr) window.toastr.error('Failed to fetch LoRAs.');
                } finally {
                    $btn.prop('disabled', false).html(original);
                }
            });

            $m.on('click', '#plz-pop-lora-add', () => {
                loras.push({ air: '', weight: 0.8 });
                $m.find('#plz-pop-lora-list').html(renderList());
            });

            $m.on('click', '.plz-pop-lora-del', function() {
                loras.splice($(this).data('idx'), 1);
                $m.find('#plz-pop-lora-list').html(renderList());
            });

            $m.on('change', '.plz-pop-lora-air', function() {
                loras[$(this).data('idx')].air = $(this).val();
            });

            $m.on('input', '.plz-pop-lora-weight', function() {
                loras[$(this).data('idx')].weight = parseFloat($(this).val()) || 0.0;
            });
        },
    });

    return result;
}
