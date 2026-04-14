/**
 * @file data/default-user/extensions/personalyze/ui/workshop/core.js
 * @stamp {"utc":"2026-04-16T23:55:00.000Z"}
 * @architectural-role UI Orchestrator (Workshop)
 * @description
 * High-level coordinator for the Personalyze Character Workshop modal.
 *
 * Updated for Style-Specific Render Pipeline:
 * 1. Integrated 'styles' tab into the switchTab routing.
 * 2. Added binding for Style-level handlers in injectWorkshop.
 *
 * @api-declaration
 * openWorkshop(tab)  — primary entry point; injects modal if needed, then shows it.
 * switchTab(name)    — toggles visibility and delegates to the correct sub-renderer.
 * injectWorkshop()   — idempotent: injects the modal shell and wires all listeners once.
 *
 * @contract
 *   assertions:
 *     purity: UI Shell / Orchestrator
 *     state_ownership: [state._workshopCharacterId]
 *     external_io: [jQuery DOM, dnaListeners, libraryListeners, styleListeners, dnaTemplates]
 */

import { getBaseWorkshopHTML } from './dnaTemplates.js';
import { renderDNAView, renderStudioView, bindDNAHandlers } from './dnaListeners.js';
import { renderLibraryView, bindLibraryHandlers } from './libraryListeners.js';
import { renderStylesView, bindStyleHandlers } from './styleListeners.js';

/**
 * Switches the active tab and triggers the appropriate sub-renderer.
 * @param {'dna'|'studio'|'library'|'styles'} tabName
 */
export function switchTab(tabName) {
    // 1. Update Tab Button UI
    $('.plz-tab-btn').removeClass('plz-active');
    $(`.plz-tab-btn[data-tab="${tabName}"]`).addClass('plz-active');

    // 2. Toggle Panel Visibility
    $('.plz-tab-panel').addClass('plz-hidden');
    $(`#plz-tab-${tabName}`).removeClass('plz-hidden');

    // 3. Delegate Rendering based on active tab
    switch (tabName) {
        case 'dna':
            renderDNAView();
            break;
        case 'studio':
            renderStudioView();
            break;
        case 'library':
            renderLibraryView();
            break;
        case 'styles':
            renderStylesView();
            break;
    }
}

/**
 * Injects the workshop modal shell and wires all event listeners.
 * Idempotent check prevents duplicate overlays and listener double-binding.
 */
export function injectWorkshop() {
    if ($('#plz-workshop-overlay').length) return;

    // 1. Structural Injection
    $('body').append(getBaseWorkshopHTML());

    const $overlay = $('#plz-workshop-overlay');

    // 2. Global Structural Listeners (Tab Switching & Closing)
    $overlay.on('click', '.plz-tab-btn', function(e) {
        e.stopPropagation();
        switchTab($(this).data('tab'));
    });

    $overlay.on('click', '#plz-workshop-close', (e) => {
        e.stopPropagation();
        $overlay.addClass('plz-hidden');
    });

    $overlay.on('click', function(e) {
        if (e.target === this) {
            e.stopPropagation();
            $(this).addClass('plz-hidden');
        }
    });

    // 3. Sub-Module Handler Binding
    bindDNAHandlers();
    bindLibraryHandlers();
    bindStyleHandlers();
}

/**
 * Primary entry point to display the Character Workshop.
 * Ensures the shell is injected before attempting navigation.
 * 
 * @param {'dna'|'studio'|'library'|'styles'} tab  Initial tab to display.
 */
export function openWorkshop(tab = 'dna') {
    injectWorkshop();
    $('#plz-workshop-overlay').removeClass('plz-hidden');
    switchTab(tab);
}