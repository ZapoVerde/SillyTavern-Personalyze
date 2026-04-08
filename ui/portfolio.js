/**
 * @file data/default-user/extensions/personalyze/ui/portfolio.js
 * @stamp {"utc":"2026-04-06T00:00:00.000Z"}
 * @architectural-role UI (Portfolio Manager)
 * @description
 * The Global Character Wardrobe manager. A full-panel UI where the user can
 * inspect, edit, and manually override any character's registered outfits and
 * expressions.
 * 
 * Updated to display the Dual-Engine (Pollinations/HF) indicator.
 *
 * @api-declaration
 * openPortfolio()  — Opens the Portfolio Manager panel.
 * closePortfolio() — Closes and removes the panel.
 *
 * @contract
 *   assertions:
 *     purity: IO
 *     state_ownership: []
 *     external_io: [DOM, registry.js, pointerWriter.js, portrait.js, imageCache.js, smartResize]
 */

import { callPopup } from '../../../../../script.js';
import { getContext } from '../../../../extensions.js';
import {
    getAllCharacterIds,
    getCharacter,
    upsertCharacter,
    upsertOutfit,
    upsertExpression,
} from '../registry.js';
import { state, updateActivePointers, updateActiveImage, addToFileIndex } from '../state.js';
import { buildFilenamePrefix, generate, PLZ_IMAGE_FOLDER } from '../imageCache.js';
import { setPortrait } from '../portrait.js';
import { lockedWritePointer } from '../logic/pointerWriter.js';
import { escapeHtml } from '../utils/history.js';
import { error } from '../utils/logger.js';
import { smartResize } from '../utils/dom.js';

const PANEL_ID = 'plz-portfolio-panel';

// Helper for finding exact filename match by prefix since we append timestamps
function buildFilename(characterId, outfitKey, expressionKey) {
    const prefix = buildFilenamePrefix(characterId, outfitKey, expressionKey);
    let best = null;
    for (const f of state.fileIndex) {
        if (f.startsWith(prefix) && (!best || f > best)) best = f;
    }
    return best || `${prefix}MISSING.png`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Opens (or re-renders) the Portfolio Manager panel.
 */
export function openPortfolio() {
    closePortfolio();

    const characterIds = getAllCharacterIds();
    if (characterIds.length === 0) {
        if (window.toastr) window.toastr.info('No characters registered yet. PLZ will register them automatically during chats.', 'PersonaLyze');
        return;
    }

    const firstId = state.activeCharacterId ?? characterIds[0];
    const $panel  = buildPanel(characterIds, firstId);
    $('body').append($panel);

    bindPanelHandlers($panel);
    renderWardrobe($panel, firstId);
}

/**
 * Closes and removes the Portfolio Manager panel.
 */
export function closePortfolio() {
    $(`#${PANEL_ID}`).remove();
}

// ─── Panel Builder ────────────────────────────────────────────────────────────

function buildPanel(characterIds, activeId) {
    const options = characterIds
        .map(id => `<option value="${escapeHtml(id)}" ${id === activeId ? 'selected' : ''}>${escapeHtml(id.replace(/_/g, ' '))}</option>`)
        .join('');

    return $(`
        <div id="${PANEL_ID}" style="
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.75);
            z-index: 9999;
            display: flex;
            align-items: center;
            justify-content: center;
        ">
            <div style="
                background: var(--SmartThemeBlurTintColor, #1a1a2e);
                border: 1px solid var(--SmartThemeBorderColor, #555);
                border-radius: 10px;
                width: min(900px, 95vw);
                max-height: 90vh;
                display: flex;
                flex-direction: column;
                overflow: hidden;
            ">
                <!-- Header -->
                <div style="
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 14px 18px;
                    border-bottom: 1px solid var(--SmartThemeBorderColor, #555);
                    flex-shrink: 0;
                ">
                    <strong><i class="fa-solid fa-shirt"></i> Portfolio Manager</strong>
                    <div style="display:flex;align-items:center;gap:10px;">
                        <select id="plz-portfolio-char-select" class="text_pole" style="min-width:160px;">
                            ${options}
                        </select>
                        <button id="plz-portfolio-close" class="menu_button" style="padding:2px 10px;">✕</button>
                    </div>
                </div>

                <!-- Anchor Editor -->
                <div id="plz-portfolio-anchor-section" style="
                    padding: 10px 18px;
                    border-bottom: 1px solid var(--SmartThemeBorderColor, #555);
                    display: flex;
                    align-items: flex-start;
                    gap: 8px;
                    flex-shrink: 0;
                ">
                    <label style="font-size:0.82em;opacity:0.7;white-space:nowrap;padding-top:6px;min-width:110px;">Identity Anchor</label>
                    <textarea id="plz-portfolio-anchor" class="text_pole plz-auto-textarea" rows="2"
                              style="flex:1;font-size:0.85em;overflow:hidden;resize:none;"></textarea>
                    <button id="plz-portfolio-anchor-save" class="menu_button" style="white-space:nowrap;padding:4px 10px;">Save</button>
                </div>

                <!-- Wardrobe Grid -->
                <div id="plz-portfolio-wardrobe" style="
                    flex: 1;
                    overflow-y: auto;
                    padding: 16px 18px;
                ">
                    <!-- Populated by renderWardrobe() -->
                </div>
            </div>
        </div>
    `);
}

// ─── Wardrobe Renderer ────────────────────────────────────────────────────────

/**
 * Builds and injects the outfit × expression grid for a character.
 */
function renderWardrobe($panel, characterId) {
    const character = getCharacter(characterId);
    if (!character) return;

    const $anchor = $panel.find('#plz-portfolio-anchor');
    $anchor.val(character.identityAnchor ?? '');
    requestAnimationFrame(() => {
        if ($anchor.length) smartResize($anchor[0]);
    });

    const outfitKeys     = Object.keys(character.outfits);
    const expressionKeys = Object.keys(character.expressions);
    const $grid          = $panel.find('#plz-portfolio-wardrobe');
    $grid.empty();

    if (outfitKeys.length === 0 && expressionKeys.length === 0) {
        $grid.html('<p style="opacity:0.5;font-size:0.9em;">No outfits or expressions registered for this character yet.</p>');
        return;
    }

    // ── Expression label row ──────────────────────────────────────────────────
    if (expressionKeys.length > 0) {
        $grid.append('<p style="font-size:0.8em;opacity:0.6;margin:0 0 8px;">Expressions</p>');
        const $exprRow = $('<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px;"></div>');

        for (const exprKey of expressionKeys) {
            const expr  = character.expressions[exprKey];
            const $cell = buildExpressionCell(characterId, exprKey, expr);
            $exprRow.append($cell);
        }
        $grid.append($exprRow);
    }

    // ── Outfit × Expression grid ──────────────────────────────────────────────
    if (outfitKeys.length > 0) {
        $grid.append('<p style="font-size:0.8em;opacity:0.6;margin:0 0 8px;">Wardrobe</p>');

        for (const outfitKey of outfitKeys) {
            const outfit       = character.outfits[outfitKey];
            const providerIcon = outfit.provider === 'huggingface' 
                ? '<i class="fa-solid fa-cloud" title="Using Hugging Face" style="font-size:0.8em; color:var(--SmartThemeQuoteColor);"></i>'
                : '';

            const $section  = $(`
                <div style="margin-bottom:18px;">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                        <span style="font-size:0.88em;font-weight:600;">${escapeHtml(outfit.label)}</span>
                        <span style="font-size:0.75em;opacity:0.5;">[${escapeHtml(outfitKey)}]</span>
                        ${providerIcon}
                    </div>
                    <div class="plz-outfit-row" data-outfit="${escapeHtml(outfitKey)}"
                         style="display:flex;flex-wrap:wrap;gap:8px;"></div>
                </div>
            `);

            const $row = $section.find('.plz-outfit-row');

            for (const exprKey of expressionKeys) {
                const filename = buildFilename(characterId, outfitKey, exprKey);
                const hasImage = state.fileIndex.has(filename);
                const $cell    = buildPortraitCell(characterId, outfitKey, exprKey, filename, hasImage);
                $row.append($cell);
            }

            if (expressionKeys.length === 0) {
                $row.append('<span style="font-size:0.8em;opacity:0.5;">No expressions registered.</span>');
            }

            $grid.append($section);
        }
    }
}

/**
 * Builds a portrait thumbnail cell for an outfit × expression combination.
 */
function buildPortraitCell(characterId, outfitKey, exprKey, filename, hasImage) {
    const character  = getCharacter(characterId);
    const exprLabel  = character?.expressions[exprKey]?.label ?? exprKey;
    const isActive   =
        state.activeCharacterId   === characterId &&
        state.activeOutfitKey     === outfitKey   &&
        state.activeExpressionKey === exprKey;

    const activeBorder = isActive ? 'border-color: var(--SmartThemeQuoteColor, #28a745);' : '';

    const $cell = $(`
        <div class="plz-wardrobe-cell"
             data-outfit="${escapeHtml(outfitKey)}"
             data-expression="${escapeHtml(exprKey)}"
             title="${escapeHtml(exprLabel)}"
             style="
                 width: 90px;
                 border: 2px solid var(--SmartThemeBorderColor, #555);
                 border-radius: 6px;
                 overflow: hidden;
                 cursor: ${hasImage ? 'pointer' : 'default'};
                 position: relative;
                 ${activeBorder}
             ">
            ${hasImage
                ? `<img src="user/images/${PLZ_IMAGE_FOLDER}/${encodeURIComponent(filename)}?v=${Date.now()}"
                        alt="${escapeHtml(exprLabel)}"
                        style="width:100%;display:block;aspect-ratio:2/3;object-fit:cover;" />`
                : `<div style="
                       width:100%;
                       aspect-ratio:2/3;
                       display:flex;
                       align-items:center;
                       justify-content:center;
                       background:rgba(255,255,255,0.04);
                   ">
                       <i class="fa-solid fa-image" style="opacity:0.3;font-size:1.4em;"></i>
                   </div>`
            }
            <div style="
                padding: 3px 4px;
                font-size: 0.68em;
                opacity: 0.7;
                text-align: center;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            ">${escapeHtml(exprLabel)}</div>
        </div>
    `);

    return $cell;
}

/**
 * Builds a compact expression reference chip.
 */
function buildExpressionCell(characterId, exprKey, expr) {
    return $(`
        <div style="
            padding: 4px 10px;
            border: 1px solid var(--SmartThemeBorderColor, #555);
            border-radius: 12px;
            font-size: 0.8em;
            opacity: 0.8;
        " title="${escapeHtml(expr.description ?? '')}">
            ${escapeHtml(expr.label)}
        </div>
    `);
}

// ─── Event Bindings ───────────────────────────────────────────────────────────

function bindPanelHandlers($panel) {
    // Close
    $panel.on('click', '#plz-portfolio-close', () => closePortfolio());

    // Close on backdrop click
    $panel.on('click', function (e) {
        if (e.target === this) closePortfolio();
    });

    // Character selector
    $panel.on('change', '#plz-portfolio-char-select', function () {
        renderWardrobe($panel, $(this).val());
    });
    
    // Auto-grow anchor textarea
    $panel.on('input', '#plz-portfolio-anchor', function () {
        smartResize(this);
    });

    // Save identity anchor
    $panel.on('click', '#plz-portfolio-anchor-save', function () {
        const characterId = $panel.find('#plz-portfolio-char-select').val();
        const anchor      = $panel.find('#plz-portfolio-anchor').val().trim();
        if (!anchor) return;
        upsertCharacter(characterId, anchor);
        if (window.toastr) window.toastr.success('Identity Anchor saved.', 'PersonaLyze');
    });

    // Portrait cell click → manual override
    $panel.on('click', '.plz-wardrobe-cell', async function () {
        const characterId  = $panel.find('#plz-portfolio-char-select').val();
        const outfitKey    = $(this).data('outfit');
        const expressionKey = $(this).data('expression');
        const filename     = buildFilename(characterId, outfitKey, expressionKey);
        const hasImage     = state.fileIndex.has(filename);

        if (!hasImage) {
            const confirmed = await callPopup(
                `<p>This combination hasn't been generated yet.</p>
                 <p style="opacity:0.7;font-size:0.9em;">Generate it now?</p>`,
                'confirm'
            );
            if (!confirmed) return;
            await triggerGeneration($panel, characterId, outfitKey, expressionKey);
            return;
        }

        await applyManualOverride(characterId, outfitKey, expressionKey, filename);
        renderWardrobe($panel, characterId);
    });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Writes the pointer to the last AI message and applies the portrait.
 */
async function applyManualOverride(characterId, outfitKey, expressionKey, filename) {
    const context   = getContext();
    const lastAiIdx = findLastAiMessageIndex(context.chat);
    if (lastAiIdx === -1) return;

    await lockedWritePointer(lastAiIdx, {
        characterId,
        outfit:     outfitKey,
        expression: expressionKey,
        image:      filename,
    });

    updateActivePointers(outfitKey, expressionKey);
    updateActiveImage(filename);
    setPortrait(filename);

    if (window.toastr) window.toastr.success('Portrait applied.', 'PersonaLyze');
}

/**
 * Triggers on-demand generation for an unrendered combination and applies it.
 */
async function triggerGeneration($panel, characterId, outfitKey, expressionKey) {
    const character = getCharacter(characterId);
    const outfitDef = character?.outfits[outfitKey];
    const exprDef   = character?.expressions[expressionKey];
    if (!outfitDef || !exprDef) return;

    if (window.toastr) window.toastr.info('Generating portrait…', 'PersonaLyze');

    try {
        const filename = await generate(
            characterId, outfitKey, expressionKey,
            outfitDef.description, exprDef.description, character.identityAnchor
        );
        addToFileIndex(filename);
        await applyManualOverride(characterId, outfitKey, expressionKey, filename);
        renderWardrobe($panel, characterId);
    } catch (err) {
        error('Portfolio', 'Generation failed:', err);
        if (window.toastr) window.toastr.error(`Generation failed: ${err.message}`, 'PersonaLyze');
    }
}

/**
 * Returns the index of the last AI message in the chat, or -1.
 */
function findLastAiMessageIndex(chat) {
    for (let i = chat.length - 1; i >= 0; i--) {
        if (!chat[i].is_user) return i;
    }
    return -1;
}