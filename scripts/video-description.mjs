export const NATURE_FRONTIERS_YOUTUBE_URL = "https://www.youtube.com/@naturefrontiers-life";

export const REQUIRED_PRODUCT_LINKS = Object.freeze([
  { title: "Complete YouTube Wildlife Creator’s Vault — Premium Combo PDF", url: "https://selar.com/0u19v8u99l" },
  { title: "The Full Video Creation Prompt Pack Premium Edition", url: "https://selar.com/539497q11t" },
  { title: "The YouTube Success Blueprint", url: "https://selar.com/91j893378q" },
  { title: "Internet Marketing Bible", url: "https://selar.com/sj6un2sr54" },
  { title: "Online Money — Practical Guide", url: "https://selar.com/8c0n588438" },
  { title: "Cash Smasher Secrets", url: "https://selar.com/i2wz2l5841" }
]);

// Exact owner-supplied Safari.com affiliate URLs. Preserve the a=GM26 tracking parameter.
export const APPROVED_AFFILIATE_LINKS = Object.freeze([
  "https://www.safari.com/sabi-sand?a=GM26",
  "https://www.safari.com/kruger-national-park?a=GM26",
  "https://www.safari.com/destinations?a=GM26",
  "https://www.safari.com/singita-boulders?a=GM26",
  "https://www.safari.com/safaris/4-day-londolozi-varty-camp-fly-in-safari?a=GM26"
]);

export const PRODUCT_DISCLOSURE =
  "Product disclosure: These links lead to third-party paid digital products. Check each seller page for current details, price, contents and terms before purchasing.";

export const AFFILIATE_DISCLOSURE =
  "Disclosure: Some links are affiliate links. Nature Frontiers may earn a commission if you make a booking through them.";

export function buildLongFormVideoDescription({
  seriesTitle,
  episodeNumber,
  episodeTitle,
  episodeDescription,
  nextEpisodeTeaser
}) {
  for (const [field, value] of Object.entries({
    seriesTitle, episodeTitle, episodeDescription, nextEpisodeTeaser
  })) {
    if (typeof value !== "string" || !value.trim()) {
      throw new Error(field + " is required to build a series episode description.");
    }
  }
  if (!Number.isInteger(episodeNumber) || episodeNumber < 1) {
    throw new Error("episodeNumber must be a positive integer.");
  }

  const productSection = REQUIRED_PRODUCT_LINKS
    .map((item) => item.title + ": " + item.url)
    .join("\n");
  const affiliateSection = APPROVED_AFFILIATE_LINKS.join("\n");

  return [
    seriesTitle + " — Episode " + episodeNumber + ": " + episodeTitle,
    episodeDescription.trim(),
    "Watch Nature Frontiers on YouTube and follow the next episode: " + NATURE_FRONTIERS_YOUTUBE_URL,
    "Explore our creator resources:",
    PRODUCT_DISCLOSURE,
    productSection,
    "Explore Safari destinations:",
    affiliateSection,
    AFFILIATE_DISCLOSURE,
    "Next episode: " + nextEpisodeTeaser.trim()
  ].join("\n\n");
}
