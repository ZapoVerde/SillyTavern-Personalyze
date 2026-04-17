/**
 * @file data/default-user/extensions/personalyze/logic/prompts.js
 * @stamp {"utc":"2026-04-17T13:40:00.000Z"}
 * @architectural-role Pipeline Templates
 * @description
 * Defines the strict Key-Value templates for the Layered State Pipeline.
 * Optimized for Dual-Model routing (Fast/Smart).
 * 
 * Updated for Granular Identity Architecture:
 * 1. Overhauled ANCHOR_SCAN_PROMPT for structured physical trait extraction.
 * 2. Updated PHASE_3_LAYERED_PROMPT to handle permanent physical changes.
 * 
 * @api-declaration
 * PHASE_1_SUBJECT_PROMPT
 * PHASE_2_CHANGE_PROMPT
 * PHASE_3_LAYERED_PROMPT
 * SCENE_CHANGE_PROMPT
 * SCENE_ROSTER_PROMPT
 * WARDROBE_VALIDITY_PROMPT
 * REDRESS_PROMPT
 * ANCHOR_SCAN_PROMPT
 * FORCE_COSTUME_PROMPT
 * 
 * @contract
 *   assertions:
 *     purity: Pure Data
 *     state_ownership: []
 *     external_io: []
 */

// ─── Phase 1-3: Standard Pipeline ─────────────────────────────────────────────

/** Phase 1: Identify the active character. Output: [ID] or a raw name if unknown. */
export const PHASE_1_SUBJECT_PROMPT =
`[SYSTEM: TASK — SUBJECT IDENTIFICATION]
Identify the primary character speaking or acting in the LATEST MESSAGE.

ROSTER:
{{active_roster}}

CONTEXT (Previous Turns):
{{history}}

LATEST MESSAGE:
{{message}}

INSTRUCTIONS:
- Identify the primary character in the LATEST MESSAGE only.
- Use the CONTEXT to resolve pronouns (e.g. "He", "She") to a specific Roster entry.
- Each Roster entry shows the display name followed by the System ID in parentheses.
- If the character matches a Roster entry (by name or AKA), return ONLY the exact System ID shown in parentheses (e.g. RESULT: strider_01).
- If it is a narrator, a group, or a character not on the Roster, return their name as it appears (e.g. RESULT: The Guard).
- Do NOT return the display name. Do NOT provide explanations.

RESULT:`;

/** Phase 2: YES/NO Gate for visual changes. Output: YES or NO. */
export const PHASE_2_CHANGE_PROMPT =
`[SYSTEM: TASK — VISUAL CHANGE GATE]
Determine if the character's appearance or emotion has changed in the LATEST MESSAGE.

CHARACTER: {{character_name}}
CURRENT STATE:
{{current_layers}}

CONTEXT (Previous Turns):
{{history}}

LATEST MESSAGE:
{{message}}

QUESTION:
In the LATEST MESSAGE, does the character explicitly change clothes, put something on, take something off, or does an item get dirty/damaged? Has their emotion, pose, or body language significantly shifted? Or has their physical appearance changed (e.g. hair cut, new scar)?

Reply ONLY with 'YES' or 'NO'.

RESULT:`;

/** Phase 3: Structural Extraction. Output: Key-Value List. */
export const PHASE_3_LAYERED_PROMPT =
`[SYSTEM: TASK — VISUAL STATE EXTRACTION]
Update the character's visual state based ONLY on the LATEST MESSAGE.

CHARACTER: {{character_name}}
IDENTITY: {{identity_anchor}}

CURRENT VISUAL STATE:
{{current_state}}

CONTEXT (Previous Turns):
{{history}}

RULES:
1. Only update a slot if the LATEST MESSAGE explicitly describes a change or removal.
2. For Wardrobe items: [Item] | [Modifier]
3. If an item is explicitly REMOVED (e.g. "took off", "discarded"): None | None
4. If a slot is UNMENTIONED or UNCHANGED: KEEP | KEEP
5. Full-body items: If a character wears a single item covering multiple slots (e.g. a "Dress"), put it in "Top" and set "Bottom" to "None".
6. Physical Features: If the character's permanent physical body changes (e.g. "cuts hair", "gets a scar"), update that slot with a simple descriptive string.
7. DO NOT OUTPUT JSON.

FORMAT:
{{slot_format_instructions}}

LATEST MESSAGE:
{{message}}

RESULT:`;

// ─── Scene Tracking & Redress ─────────────────────────────────────────────────

/** Detects if the narrative has physically left the current location. */
export const SCENE_CHANGE_PROMPT =
`[SYSTEM: LOCATION CHANGE DETECTOR]
Determine whether the scene has left the current known location.

Current known location: {{current_location}}

CONTEXT (Previous Turns):
{{history}}

LATEST MESSAGE:
{{current_turn}}

At the END of the latest message, has the scene clearly left the current known location?

Rules:
- Answer with ONLY the single word YES or NO.
- Evaluate the scene state strictly at the end of the latest message, not during earlier parts.
- YES = character(s) clearly exited the location, are in transit, or arrived somewhere new.
- NO = character(s) are still within the location or its immediate sub-areas.
- Movement within a location does NOT count.
- Intent to leave does NOT count; the exit must be completed.

Answer:`;

/** Identifies which characters are present in the new scene. */
export const SCENE_ROSTER_PROMPT =
`[SYSTEM: SCENE ROSTER DISCOVERY]
Identify which characters are present in the narrative's new location.

CURRENT ROSTER (Previously present):
{{active_roster}}

CONTEXT (Previous Turns):
{{history}}

LATEST MESSAGE (The transition):
{{current_turn}}

INSTRUCTIONS:
1. Identify all characters who have arrived at or are present in the new location.
2. Use the CURRENT ROSTER to determine if existing characters followed the protagonist or stayed behind.
3. If the transition text explicitly mentions a character leaving or staying behind, remove them.
4. If new characters are introduced in the new location, include their names.
5. If the protagonist is clearly alone, return 'None'.
6. Return the result as a comma-separated list of Names or System IDs.

RESULT:`;

/** Batched check for multiple characters. Output: Name: YES/NO. */
export const WARDROBE_VALIDITY_PROMPT =
`[SYSTEM: WARDROBE VALIDITY GATE]
Determine if the character outfits are narratively valid for the new scene.

CHARACTERS:
{{character_names}}

CURRENT OUTFITS:
{{current_layers}}

CONTEXT (Previous Turns):
{{history}}

LATEST MESSAGE:
{{current_turn}}

INSTRUCTIONS:
Is it still logical for these characters to be wearing these specific clothes?
(e.g. Is it a new day? A formal event while they wear pajamas? A snowy mountain in swimwear?)

Reply with the Name followed by NO if they need a change, or YES if their outfit is still fine.

FORMAT:
[Name]: [YES/NO]

RESULT:`;

/** Extracts new clothes for a scene shift. Supports USE_DEFAULT. */
export const REDRESS_PROMPT =
`[SYSTEM: CHARACTER REDRESS]
Determine the character's new visual state for this scene.

CHARACTER: {{character_name}}

CONTEXT (Previous Turns):
{{history}}

LATEST MESSAGE:
{{current_turn}}

INSTRUCTIONS:
1. Extract the specific new clothing described in the text.
2. If the text does NOT explicitly mention what they are wearing now (e.g. they just woke up or the scene started), reply ONLY with 'USE_DEFAULT'.
3. Full-body items: If a character wears a single item covering multiple slots (e.g. a "Dress"), put the item in "Top" and set "Bottom" to "None".
4. Use the requested format.

FORMAT (if clothes mentioned):
{{slot_format_instructions}}

RESULT:`;

// ─── Workshop Tools ───────────────────────────────────────────────────────────

/** Identity Anchor Scan for new characters. */
export const ANCHOR_SCAN_PROMPT =
`[SYSTEM: TASK — CHARACTER ARCHIVIST]
Analyze the transcript to identify a character's permanent physical appearance.

{{character_focus}}
TRANSCRIPT:
{{context}}

INSTRUCTIONS:
1. Extract only permanent physical features.
2. Do NOT include current clothing or temporary items.
3. Identify unique features (wings, horns, cybernetics, scars) as separate entries if present.
4. Output as a structured Key-Value list.

FORMAT:
Name: [Exact name]
Hair: [Style and color]
Eyes: [Color, shape, notable expression]
Face: [Bone structure, facial shape]
Body: [Build, height, silhouette]
Skin: [Tone and texture]
Age: [Apparent age or age range]
Species: [Human ethnicity or non-human species/race]
Features: [Distinguishing marks, scars, tattoos, birthmarks]
[Special Feature Name]: [Descriptive string — repeat for each unique anatomical feature e.g. wings, horns, cybernetics]

RESULT:`;

/** Forces extraction from a specific turn snippet. */
export const FORCE_COSTUME_PROMPT =
`[SYSTEM: TASK — MANUAL COSTUME EXTRACTION]
Extract visual clothing details from the provided text.

CHARACTER: {{character_name}}
{{hint_block}}

CONTEXT (Previous Turns):
{{history}}

LATEST MESSAGE:
{{current_turn}}

INSTRUCTIONS:
- Identify what the character is wearing in this specific text.
- Use 'None' for missing slots.
- Do not provide explanations.

FORMAT:
{{slot_format_instructions}}`;