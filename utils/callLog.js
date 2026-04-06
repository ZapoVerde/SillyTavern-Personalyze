/**
 * @file data/default-user/extensions/personalyze/utils/callLog.js
 * @stamp {"utc":"2026-04-06T00:00:00.000Z"}
 * @architectural-role Utility (In-Memory Log)
 * @description
 * Rolling in-memory logs for the two sources of LLM calls in PersonaLyze.
 *
 * PIPELINE store — last 4 pipeline runs (= 2 full user↔AI turn pairs).
 *   Opened by startTurn().  Filled by every dispatch() call that fires
 *   during a pipeline execution.
 *
 * WORKSHOP store — last 3 workshop queries (Anchor Scan, etc.).
 *   Opened by startWorkshopTurn().  Filled by every dispatch() call that
 *   fires during a user-initiated workshop action.
 *
 * logCall() routes to whichever store was most recently opened.  A 10-second
 * stale-fallback auto-creates a new Standalone entry in the active store when
 * a call arrives long after the last startTurn/startWorkshopTurn, preventing
 * workshop calls from silently appending to an old pipeline turn.
 *
 * @api-declaration
 * startTurn(label)                            → void   (pipeline)
 * startWorkshopTurn(label)                    → void   (workshop)
 * logCall(label, prompt, response, errorMsg)  → void   (routes to active store)
 * getLogs()                                   → TurnRecord[]   (pipeline, oldest-first)
 * getWorkshopLogs()                           → TurnRecord[]   (workshop, oldest-first)
 *
 * @contract
 *   assertions:
 *     purity: Stateful (session-scoped, in-memory only)
 *     state_ownership: [_pipelineTurns, _workshopTurns, _target, _turnCounter]
 *     external_io: []
 */

// Each pipeline run = one AI response = one half of a user↔AI pair.
// Keeping 4 runs covers the last 2 full turn pairs.
const MAX_PIPELINE_TURNS = 4;
const MAX_WORKSHOP_TURNS = 3;

let _turnCounter = 0;

/** Which store logCall() currently routes to: 'pipeline' | 'workshop'. */
let _target = 'pipeline';

/** ID of the turn that is currently receiving logCall() entries. */
let _currentTurnId = 0;

/** @type {{ id: number, label: string, timestamp: number, calls: object[] }[]} */
let _pipelineTurns = [];

/** @type {{ id: number, label: string, timestamp: number, calls: object[] }[]} */
let _workshopTurns = [];

// ─── Internal ─────────────────────────────────────────────────────────────────

function _openTurn(label, store, maxTurns) {
    _turnCounter++;
    _currentTurnId = _turnCounter;
    store.push({ id: _currentTurnId, label, timestamp: Date.now(), calls: [] });
    if (store.length > maxTurns) store.shift();
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Opens a new pipeline log group.  Routes subsequent logCall() entries to the
 * pipeline store until another start* call is made.
 * Evicts the oldest entry once the buffer exceeds MAX_PIPELINE_TURNS (4).
 * @param {string} label  e.g. "Pipeline"
 */
export function startTurn(label) {
    _target = 'pipeline';
    _openTurn(label, _pipelineTurns, MAX_PIPELINE_TURNS);
}

/**
 * Opens a new workshop log group.  Routes subsequent logCall() entries to the
 * workshop store until another start* call is made.
 * Evicts the oldest entry once the buffer exceeds MAX_WORKSHOP_TURNS (3).
 * @param {string} label  e.g. "Anchor Scan"
 */
export function startWorkshopTurn(label) {
    _target = 'workshop';
    _openTurn(label, _workshopTurns, MAX_WORKSHOP_TURNS);
}

/**
 * Records one LLM call under the current turn in the active store.
 * If no matching turn exists, or the last call in the current turn is more
 * than 10 seconds old (stale-fallback), a new Standalone entry is auto-created
 * in the active store.
 *
 * @param {string}      label     e.g. 'SubjectMatch', 'Combined', 'AnchorScan'
 * @param {string}      prompt    The full prompt string that was sent.
 * @param {string|null} response  Raw LLM response text, or null on failure.
 * @param {string|null} errorMsg  Error message string, or null on success.
 */
export function logCall(label, prompt, response, errorMsg) {
    const store    = _target === 'workshop' ? _workshopTurns : _pipelineTurns;
    const maxTurns = _target === 'workshop' ? MAX_WORKSHOP_TURNS : MAX_PIPELINE_TURNS;

    let turn = store.find(t => t.id === _currentTurnId);

    // Stale-fallback: auto-open a Standalone turn if the active one is absent
    // or its last call is more than 10 s old.
    const lastCallTs = turn?.calls.at(-1)?.timestamp ?? 0;
    if (!turn || (turn.calls.length > 0 && Date.now() - lastCallTs > 10_000)) {
        _turnCounter++;
        _currentTurnId = _turnCounter;
        store.push({ id: _currentTurnId, label: 'Standalone', timestamp: Date.now(), calls: [] });
        if (store.length > maxTurns) store.shift();
        turn = store[store.length - 1];
    }

    turn.calls.push({
        label,
        prompt:    prompt    ?? '',
        response:  response  ?? null,
        error:     errorMsg  ?? null,
        timestamp: Date.now(),
    });
}

/**
 * Returns a shallow copy of the pipeline turn buffer (oldest first).
 * @returns {{ id: number, label: string, timestamp: number, calls: object[] }[]}
 */
export function getLogs() {
    return [..._pipelineTurns];
}

/**
 * Returns a shallow copy of the workshop turn buffer (oldest first).
 * @returns {{ id: number, label: string, timestamp: number, calls: object[] }[]}
 */
export function getWorkshopLogs() {
    return [..._workshopTurns];
}
