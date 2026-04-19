/**
 * @file data/default-user/extensions/personalyze/ui/vn/templates.js
 * @stamp {"utc":"2026-04-19T00:00:00.000Z"}
 * @architectural-role Pure UI Template
 * @description
 * Generates the static HTML shell for the VN split-screen panel.
 * Includes the hamburger menu structure that replaces the original single (+) button.
 *
 * @api-declaration
 * getVnPanelShellHTML(panelId, cycleId) -> string
 *
 * @contract
 *   assertions:
 *     purity: Pure Function
 *     state_ownership: []
 *     external_io: []
 */

/**
 * Builds the outer HTML shell for the VN panel.
 * The hamburger menu wrapper replaces the original single "Add Character" button.
 *
 * @param {string} panelId  - The panel's root element ID.
 * @param {string} cycleId  - The size-cycle button's ID.
 * @returns {string}
 */
export function getVnPanelShellHTML(panelId, cycleId) {
    return `
        <div id="${panelId}" class="plz-roster-grid">
            <button id="plz-vn-toggle-btn" class="plz-vn-side-btn" title="Disable PersonaLyze" type="button">
                <i class="fa-solid fa-eye-slash"></i>
            </button>
            <div id="plz-vn-add-menu-wrapper" class="plz-vn-add-wrapper">
                <button id="plz-vn-add-btn" class="plz-vn-side-btn" title="Add Character to Scene" type="button">
                    <i class="fa-solid fa-bars"></i>
                </button>
                <div id="plz-vn-add-dropdown" class="plz-vn-dropdown">
                    <button id="plz-vn-menu-scan" class="plz-vn-dropdown-item" type="button">
                        <i class="fa-solid fa-magnifying-glass"></i> Scan Highlighted
                    </button>
                    <button id="plz-vn-menu-picker" class="plz-vn-dropdown-item" type="button">
                        <i class="fa-solid fa-plus"></i> Add Character
                    </button>
                </div>
            </div>
            <button id="${cycleId}" class="plz-vn-side-btn" title="Cycle portrait size" type="button">½</button>
        </div>
    `;
}
