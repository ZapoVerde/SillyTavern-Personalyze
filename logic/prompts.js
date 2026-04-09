/**
 * @file data/default-user/extensions/personalyze/logic/prompts.js
 * @stamp {"utc":"2026-04-10T21:00:00.000Z"}
 * @architectural-role Pipeline Templates
 * @description
 * Defines the strict Key-Value templates for the Layered State Pipeline.
 * Optimized for Dual-Model routing (Fast/Smart).
 * 
 * Includes prompts for the standard pipeline, proactive scene tracking,
 * and manual workshop extraction tools.
 * 
 * @api-declaration
 * PHASE_1_SUBJECT_PROMPT
 * PHASE_2_CHANGE_PROMPT
 * PHASE_3_LAYERED_PROMPT
 * SCENE_CHANGE_PROMPT
 * WARDROBE_VALIDITY_PROMPT
 * REDRESS_PROMPT
 * ANCHOR_SCAN_PROMPT
 * FORCE_COSTUME_PROMPT
 * OUTFIT_GENERATOR_PROMPT
 */

// ─── Phase 1-3: Standard Pipeline ─────────────────────────────────────────────

/** Phase 1: Identify the active character. Output: [Name] or None. */
export const PHASE_1_SUBJECT_PROMPT =
`[SYSTEM: TASK — SUBJECT IDENTIFICATION]
Identify the primary character speaking or acting in the following text.

ROSTER:
{{active_roster}}

TEXT:
{{message}}

INSTRUCTIONS:
- Return ONLY the exact name from the roster if they are the main focus.
- If the character is referred to by an alias (AKA), return their canonical Roster Name.
- If it is a narrator, a group, or an unlisted character, return their name (e.g. RESULT: The Guard).
- Do NOT provide explanations.

RESULT:`;

/** Phase 2: YES/NO Gate for visual changes. Output: YES or NO. */
export const PHASE_2_CHANGE_PROMPT =
`[SYSTEM: TASK — VISUAL CHANGE GATE]
Determine if the character's appearance or emotion has changed in the new text.

CHARACTER: {{character_name}}
CURRENT STATE:
{{current_layers}}

NEW TEXT:
{{message}}

QUESTION:
In the New Text, does the character explicitly change clothes, put something on, take something off, or does an item get dirty/damaged? Has their emotion or body language significantly shifted?

Reply ONLY with 'YES' or 'NO'.

RESULT:`;

/** Phase 3: Structural Extraction. Output: Key-Value List. */
export const PHASE_3_LAYERED_PROMPT =
`[SYSTEM: TASK — VISUAL STATE EXTRACTION]
Update the character's visual state based ONLY on the provided text.

CHARACTER: {{character_name}}
IDENTITY: {{identity_anchor}}

RULES:
1. Only update a slot if the text explicitly describes a change.
2. If an item is put on or modified: [Item] | [Modifier]
3. If an item is explicitly REMOVED: None | None
4. If a slot is UNMENTIONED or UNCHANGED: KEEP | KEEP
5. EMOTION: Provide one adjective describing their mood and physical expression. Use KEEP if unchanged.
6. DO NOT OUTPUT JSON.

FORMAT:
Outerwear: [Item] | [Modifier]
Top: [Item] | [Modifier]
Bottom: [Item] | [Modifier]
Accessories: [Item] | [Modifier]
Emotion: [Adjective]

TEXT:
{{message}}

RESULT:`;

// ─── Scene Tracking & Redress ─────────────────────────────────────────────────

/** Detects if the narrative has physically left the current location. */
export const SCENE_CHANGE_PROMPT =
`[SYSTEM: LOCATION CHANGE DETECTOR]
Determine whether the scene has left the current known location.

Current known location: {{current_location}}

{{history}}

Latest message:
{{message}}

At the END of the latest message, has the scene clearly left the current known location?

Rules:
- Answer with ONLY the single word YES or NO.
- Evaluate the scene state strictly at the end of the latest message, not during earlier parts.
- YES = character(s) clearly exited the location, are in transit, or arrived somewhere new.
- NO = character(s) are still within the location or its immediate sub-areas.
- Movement within a location does NOT count.
- Intent to leave does NOT count; the exit must be completed.

Answer:`;

/** Batched check for multiple characters. Output: Name: YES/NO. */
export const WARDROBE_VALIDITY_PROMPT =
`[SYSTEM: WARDROBE VALIDITY GATE]
Determine if the character outfits are narratively valid for the new scene.

NEW SCENE:
{{scene_context}}

CURRENT OUTFITS:
{{roster_block}}

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
SCENE CONTEXT:
{{scene_text}}

INSTRUCTIONS:
1. Extract the specific new clothing described in the text.
2. If the text does NOT explicitly mention what they are wearing now (e.g. they just woke up or the scene started), reply ONLY with 'USE_DEFAULT'.
3. Otherwise, use the standard 5-slot format.

FORMAT (if clothes mentioned):
Outerwear: [Item] | [Modifier]
Top: [Item] | [Modifier]
Bottom: [Item] | [Modifier]
Accessories: [Item] | [Modifier]
Emotion: [Adjective]

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
1. Extract only permanent physical features: face, hair, eye colour, build, marks.
2. Do NOT include clothing or current mood.
3. Output ONLY the Name and Identity Anchor.

FORMAT:
Name: [Exact name]
Identity Anchor: [2-3 sentences for an image generator]`;

/** Forces extraction from a specific turn snippet. */
export const FORCE_COSTUME_PROMPT =
`[SYSTEM: TASK — MANUAL COSTUME EXTRACTION]
Extract visual clothing details from the provided text snippet.

CHARACTER: {{character_name}}
{{hint_block}}

TRANSCRIPT SNIPPET:
{{context}}

INSTRUCTIONS:
- Identify what the character is wearing in this specific text.
- Use 'None' for missing slots.
- Do not provide explanations.

FORMAT:
Outerwear: [Item] | [Modifier]
Top: [Item] | [Modifier]
Bottom: [Item] | [Modifier]
Accessories: [Item] | [Modifier]
Emotion: [Adjective]`;

/** Outfit Generator for the Workshop Studio. */
export const OUTFIT_GENERATOR_PROMPT =
`[SYSTEM: TASK — OUTFIT DESIGNER]
Design a specific clothing item description based on keywords.

KEYWORD: {{keyword}}

FORMAT:
[Item] | [Visual Details/Materials/Colors]`;