import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildYouTubeDescription, validateYouTubeDescription } from "./youtube-content.mjs";

const inputPath = process.argv[2];
if (!inputPath) {
  console.error("Usage: npm run build:youtube-description -- path/to/episode.json");
  process.exitCode = 2;
} else {
  try {
    const episode = JSON.parse(await readFile(resolve(inputPath), "utf8"));
    const description = buildYouTubeDescription(episode);
    const errors = validateYouTubeDescription(description);
    if (errors.length) {
      console.error("Description validation failed:");
      for (const error of errors) console.error("- " + error);
      process.exitCode = 1;
    } else {
      process.stdout.write(description + "\n");
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
