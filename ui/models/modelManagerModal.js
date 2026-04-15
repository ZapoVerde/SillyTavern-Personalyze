/**
 * @file data/default-user/extensions/personalyze/ui/models/modelManagerModal.js
 * @stamp {"utc":"2026-04-19T10:00:00.000Z"}
 * @architectural-role UI Executor (Technical Registry Manager)
 * @description
 * Manages the global list of registered models and their technical blueprints.
 * Provides a UI for adding new models via templates, deleting existing ones,
 * and navigating to the JSON Blueprint Editor.
 * 
 * @api-declaration
 * openModelManager() -> Promise<void>
 * 
 * @contract
 *   assertions:
 *     purity: IO Executor / Stateful UI
 *     state_ownership: []
 *     external_io: [callPopup, modelRegistry.js, blueprintEditor.js, jQuery]
 */

import { callPopup } from '../../../../../../script.js';
import { 
    getAllRegisteredModels, 
    deleteModelBlueprint, 
    saveModelBlueprint, 
    getBaseTemplates 
} from '../../modelRegistry.js';
import { openBlueprintEditor } from './blueprintEditor.js';
import { escapeHtml } from '../../utils/history.js';
import { saveManualModel } from '../panel/models.js';

/**
 * Renders the list of registered models into the modal container.
 */
function _renderModelRows() {
    const models = getAllRegisteredModels();
    if (models.length === 0) {
        return `<div style="text-align:center; opacity:0.5; padding:20px;">No models registered.</div>`;
    }

    return models.map(id => `
        <div class="plz-mgr-row" style="display:flex; justify-content:space-between; align-items:center; padding:10px; border-bottom:1px solid rgba(255,255,255,0.05);">
            <div style="display:flex; flex-direction:column; gap:2px; overflow:hidden; margin-right:10px;">
                <strong style="font-size:0.9em; white-space:nowrap; text-overflow:ellipsis; overflow:hidden;">${escapeHtml(id)}</strong>
            </div>
            <div style="display:flex; gap:6px;">
                <button class="menu_button plz-mgr-edit" data-id="${escapeHtml(id)}" title="Edit JSON Blueprint">
                    <i class="fa-solid fa-code"></i>
                </button>
                <button class="menu_button plz-mgr-delete" data-id="${escapeHtml(id)}" style="color:var(--SmartThemeErrorColor);" title="Delete Model">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </div>
        </div>
    `).join('');
}

/**
 * Opens the Global Model Manager modal.
 */
export async function openModelManager() {
    const baseTemplates = getBaseTemplates();
    const templateOptions = Object.keys(baseTemplates).map(t => 
        `<option value="${escapeHtml(t)}">${escapeHtml(t.toUpperCase())} Template</option>`
    ).join('');

    const html = `
    <div id="plz-model-manager-modal" style="display:flex; flex-direction:column; gap:15px; min-width:min(500px, 95vw);">
        <h3 style="margin:0;"><i class="fa-solid fa-microchip"></i> Model & Blueprint Manager</h3>
        
        <!-- Registration Section -->
        <div style="background:rgba(0,0,0,0.2); border-radius:8px; padding:12px; border:1px solid var(--SmartThemeBorderColor);">
            <div style="font-size:0.75em; opacity:0.6; margin-bottom:8px; font-weight:bold; text-transform:uppercase;">Register New Model</div>
            <div style="display:flex; flex-direction:column; gap:8px;">
                <input id="plz-mgr-new-label" type="text" class="text_pole" placeholder="Friendly Name (e.g. Pony Diffusion)" style="width:100%;" />
                <input id="plz-mgr-new-id" type="text" class="text_pole" placeholder="Model ID or AIR (e.g. runware:100@1)" style="width:100%; font-family:monospace;" />
                <div style="display:flex; gap:6px;">
                    <select id="plz-mgr-new-template" class="text_pole" style="flex:1;">
                        ${templateOptions}
                    </select>
                    <button id="plz-mgr-add-btn" class="menu_button">Add Model</button>
                </div>
            </div>
        </div>

        <!-- Registry List -->
        <div style="display:flex; flex-direction:column;">
            <div style="font-size:0.75em; opacity:0.6; margin-bottom:5px; font-weight:bold; text-transform:uppercase;">Registered Blueprints</div>
            <div id="plz-mgr-list" style="max-height:300px; overflow-y:auto; background:rgba(255,255,255,0.02); border-radius:6px; border:1px solid rgba(255,255,255,0.05);">
                ${_renderModelRows()}
            </div>
        </div>

        <p style="font-size:0.75em; opacity:0.5; margin:0; font-style:italic;">
            Blueprints define the sliders and toggles available for each model in Global Styles.
        </p>
    </div>`;

    return new Promise((resolve) => {
        callPopup(html, 'confirm').then(() => {
            $(document).off('.plzMgr');
            resolve();
        });

        const $list = $('#plz-mgr-list');

        // 1. Add Model Logic
        $(document).on('click.plzMgr', '#plz-mgr-add-btn', async function() {
            const label = $('#plz-mgr-new-label').val().trim();
            const id = $('#plz-mgr-new-id').val().trim();
            const templateKey = $('#plz-mgr-new-template').val();

            if (!id || !label) {
                if (window.toastr) window.toastr.warning('Please enter both a friendly Name and a technical Model ID.');
                return;
            }

            const blueprint = structuredClone(baseTemplates[templateKey]);
            saveModelBlueprint(id, blueprint);
            saveManualModel(label, id);

            $('#plz-mgr-new-label, #plz-mgr-new-id').val('');
            $list.html(_renderModelRows());

            if (window.toastr) window.toastr.success(`Model "${label}" registered.`);
        });

        // 2. Edit JSON Blueprint Logic
        $(document).on('click.plzMgr', '.plz-mgr-edit', async function() {
            const id = $(this).data('id');
            const saved = await openBlueprintEditor(id);
            if (saved) $list.html(_renderModelRows());
        });

        // 3. Delete Model Logic
        $(document).on('click.plzMgr', '.plz-mgr-delete', async function() {
            const id = $(this).data('id');
            const confirmed = await callPopup(`Delete technical blueprint for <b>${escapeHtml(id)}</b>?`, 'confirm');
            if (!confirmed) return;

            deleteModelBlueprint(id);
            $list.html(_renderModelRows());
        });
    });
}