import { readFileSync } from "node:fs";
import { validateStory } from "../shared/nature-frontiers-story.mjs";

export { validateStory };

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const path = process.argv[2];
  if (!path) {
    console.error("Usage: node scripts/validate-nature-frontiers-story.mjs <story.json>");
    process.exit(2);
  }
  try {
    const story = JSON.parse(readFileSync(path, "utf8"));
    const errors = validateStory(story);
    if (errors.length) {
      console.error("Nature Frontiers educational-story gate: HOLD");
      for (const error of errors) console.error(`- ${error}`);
      process.exit(1);
    }
    console.log("Nature Frontiers educational-story gate: PASS");
  } catch (error) {
    console.error(`Nature Frontiers educational-story gate: invalid JSON or unreadable file (${error.message})`);
    process.exit(1);
  }
}
