const REQUIRED_BEATS = ["hook_question", "evidence", "explanation", "takeaway"];
const NON_EMPTY = (value) => typeof value === "string" && value.trim().length > 0;
function isPublicHttpsSource(value) {
  if (!NON_EMPTY(value)) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return false;
    const host = url.hostname.toLowerCase().replace(/^\\[|\\]$/g, "");
    if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") ||
        host.endsWith(".internal") || host.endsWith(".test") || host.endsWith(".invalid")) return false;
    if (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:")) return false;
    const ipv4 = host.match(/^(\\d{1,3})\\.(\\d{1,3})\\.(\\d{1,3})\\.(\\d{1,3})$/);
    if (ipv4) {
      const [a,b,c,d] = ipv4.slice(1).map(Number);
      if ([a,b,c,d].some((part) => part > 255) || a === 0 || a === 10 || a === 127 || a >= 224 ||
          (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
          (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) ||
          (a === 192 && b === 0 && c === 2) || (a === 198 && (b === 18 || b === 19 || b === 51)) ||
          (a === 203 && b === 0 && c === 113)) return false;
    }
    return true;
  } catch { return false; }
}


export function validateStory(story) {
  const errors = [];
  if (!story || typeof story !== "object" || Array.isArray(story)) return ["story must be an object"];
  if (!NON_EMPTY(story.title)) errors.push("title is required");
  if (!NON_EMPTY(story.learning_objective)) errors.push("learning_objective must state one clear lesson");
  if (!NON_EMPTY(story.audience_takeaway)) errors.push("audience_takeaway must state what viewers should learn");
  if (!Array.isArray(story.claims) || story.claims.length === 0) errors.push("at least one factual claim is required");
  else story.claims.forEach((claim, index) => {
    if (!NON_EMPTY(claim.text)) errors.push(`claims[${index}].text is required`);
    if (!Array.isArray(claim.sources) || claim.sources.length === 0 ||
        claim.sources.some((source) => !isPublicHttpsSource(source))) {
      errors.push(`claims[${index}] needs at least one traceable public HTTPS source`);
    }
    if (!NON_EMPTY(claim.visual_evidence)) errors.push(`claims[${index}] must identify matching visual evidence`);
  });
  if (!Array.isArray(story.story_beats)) errors.push("story_beats must be an array");
  else for (const beat of REQUIRED_BEATS) {
    if (!story.story_beats.some((item) => item?.type === beat && NON_EMPTY(item.description))) {
      errors.push(`story_beats must include a described ${beat} beat`);
    }
  }
  if (!["image", "video"].includes(story.media_kind)) errors.push("media_kind must be image or video");
  if (story.media_kind === "image" && !NON_EMPTY(story.image_teaching_point)) errors.push("image_teaching_point is required so a still image teaches a specific fact");
  if (story.media_kind === "video" && !NON_EMPTY(story.visual_claim_alignment)) errors.push("visual_claim_alignment must explain how footage supports the lesson");
  if (!NON_EMPTY(story.species_identification_basis)) errors.push("species_identification_basis is required; use 'not confidently identified' when uncertain");
  if (story.brand_logo !== "lion_face") errors.push("brand_logo must be lion_face");
  if (story.original_camera_provenance !== true) errors.push("original_camera_provenance must be true");
  if (story.rights_verified !== true) errors.push("rights_verified must be true");
  if (story.human_editorial_review !== true) errors.push("human_editorial_review must be true");
  if (story.accessibility?.captions !== true || story.accessibility?.sound_off_comprehensible !== true ||
      !NON_EMPTY(story.accessibility?.alt_text_or_visual_description)) errors.push("captions, sound-off comprehension, and descriptive alt text are required");
  if (story.ai_generated_wildlife_visuals !== false || story.generic_stock_footage !== false) errors.push("AI-generated wildlife visuals and generic stock footage are not permitted");
  return errors;
}
