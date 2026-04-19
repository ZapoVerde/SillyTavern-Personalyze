/**
 * @file data/default-user/extensions/personalyze/ui/vn/index.js
 * @stamp {"utc":"2026-04-19T00:00:00.000Z"}
 * @architectural-role Public Facade
 * @description
 * Re-exports the three public API functions of the VN panel subsystem.
 * External consumers (index.js, ui/settings/panel.js) import from here
 * rather than from individual sub-modules so the decomposition is transparent.
 *
 * @api-declaration
 * injectVnPanel()         — re-exported from panel.js
 * syncVnState()           — re-exported from panel.js
 * setVnPanelEnabled(bool) — re-exported from panel.js
 */

export { injectVnPanel, syncVnState, setVnPanelEnabled } from './panel.js';
