/**
 * @file data/default-user/extensions/personalyze/ui/workshop/styleLogicListeners.js
 * @stamp {"utc":"2026-05-01T20:10:00.000Z"}
 * @architectural-role UI Orchestrator (Global Style Logic)
 * @description
 * Thin orchestrator for the Reactive Logic Engine configuration drawer.
 * Delegates actual implementation to specialized sub-modules in ui/workshop/logic/.
 * 
 * @api-declaration
 * bindStyleLogicHandlers($overlay) -> void
 * renderLogicDrawer() -> void
 * 
 * @contract
 *   assertions:
 *     purity: UI Orchestration
 *     state_ownership: []
 *     external_io: [logic/renderer.js, logic/handlers.js]
 */

import { renderLogicDrawer as delegateRender } from './logic/renderer.js';
import { bindStyleLogicHandlers as delegateHandlers } from './logic/handlers.js';

/**
 * Renders or refreshes the Logic drawer content.
 * Delegates to the Logic Renderer module.
 */
export function renderLogicDrawer() {
    delegateRender();
}

/**
 * Binds all Logic Probe CRUD and Editor events.
 * Delegates to the Logic Handlers module.
 * 
 * @param {jQuery} $overlay - The workshop modal overlay.
 */
export function bindStyleLogicHandlers($overlay) {
    delegateHandlers($overlay);
}