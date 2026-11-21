import assert from "node:assert/strict";
import { validateStory } from "./validate-nature-frontiers-story.mjs";

const valid = {
  title: "Why do crocodiles bask?",
  media_kind: "video",
  learning_objective: "Explain how basking helps crocodiles regulate body temperature.",
  audience_takeaway: "Crocodiles use external heat to warm up and may move to water or shade to cool down.",
  species_identification_basis: "Nile crocodile identified by qualified reviewer from diagnostic features and source metadata.",
  claims: [{ text: "Crocodiles are ectothermic.", sources: ["https://example.org/research"], visual_evidence: "Verified original recording shows the animal basking on a riverbank." }],
  story_beats: [
    { type: "hook_question", description: "Why does this crocodile stay motionless in the sun?" },
    { type: "evidence", description: "Show the animal basking in the verified original recording." },
    { type: "explanation", description: "Explain ectothermy and heat exchange without implying intent." },
    { type: "takeaway", description: "Basking is one way crocodiles regulate body temperature." }
  ],
  visual_claim_alignment: "The footage depicts basking; narration explains only thermoregulation.",
  brand_logo: "lion_face",
  original_camera_provenance: true,
  rights_verified: true,
  human_editorial_review: true,
  accessibility: { captions: true, sound_off_comprehensible: true, alt_text_or_visual_description: "A crocodile resting on a sunny riverbank." },
  ai_generated_wildlife_visuals: false,
  generic_stock_footage: false
};
assert.deepEqual(validateStory(valid), []);
assert.ok(validateStory({ ...valid, learning_objective: "", brand_logo: "elephant" }).length >= 2);
assert.ok(validateStory({ ...valid, claims: [{ text: "Claim", sources: [], visual_evidence: "" }] }).some((error) => error.includes("traceable source")));
assert.ok(validateStory({ ...valid, claims: [{ text: "Claim", sources: ["http://example.org/source"], visual_evidence: "matching original footage" }] }).some((error) => error.includes("HTTPS source")));
assert.ok(validateStory({ ...valid, media_kind: undefined }) .some((error) => error.includes("media_kind")));
assert.ok(validateStory({ ...valid, media_kind: "image", image_teaching_point: "" }).some((error) => error.includes("image_teaching_point")));
assert.ok(validateStory({ ...valid, ai_generated_wildlife_visuals: true }).some((error) => error.includes("AI-generated")));
assert.ok(validateStory({ ...valid, story_beats: [] }).some((error) => error.includes("hook_question")));
console.log("Nature Frontiers educational-story gate tests: PASS");
