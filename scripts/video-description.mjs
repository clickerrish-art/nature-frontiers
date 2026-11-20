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
  nextEpisodeTeaser,
  productLinks = [],
  affiliateLinks = []
}) {
  if (typeof episodeDescription !== "string" || !episodeDescription.trim()) {
    throw new Error("episodeDescription is required.");
  }
  const hasSeriesMetadata = Boolean(seriesTitle || episodeNumber || episodeTitle || nextEpisodeTeaser);
  if (hasSeriesMetadata) {
    for (const [field, value] of Object.entries({ seriesTitle, episodeTitle, nextEpisodeTeaser })) {
      if (typeof value !== "string" || !value.trim()) throw new Error(field + " is required for a series episode.");
    }
    if (!Number.isInteger(episodeNumber) || episodeNumber < 1) throw new Error("episodeNumber must be a positive integer.");
  }
  if (!Array.isArray(productLinks) || !Array.isArray(affiliateLinks)) {
    throw new Error("productLinks and affiliateLinks must be arrays.");
  }
  const sections = [];
  if (hasSeriesMetadata) sections.push(seriesTitle + " — Episode " + episodeNumber + ": " + episodeTitle);
  sections.push(episodeDescription.trim());

  if (productLinks.length > 0) {
    const known = new Map(REQUIRED_PRODUCT_LINKS.map((item) => [item.url, item.title]));
    if (productLinks.some((url) => !known.has(url))) throw new Error("Product link is not in the owner-approved catalogue.");
    sections.push("Optional creator resources:");
    sections.push(PRODUCT_DISCLOSURE);
    sections.push(productLinks.map((url) => known.get(url) + ": " + url).join("\n"));
  }
  if (affiliateLinks.length > 0) {
    if (affiliateLinks.some((url) => !APPROVED_AFFILIATE_LINKS.includes(url))) {
      throw new Error("Affiliate link is not in the owner-approved Safari catalogue.");
    }
    sections.push("Optional Safari affiliate links:");
    sections.push(affiliateLinks.join("\n"));
    sections.push(AFFILIATE_DISCLOSURE);
  }
  if (hasSeriesMetadata) sections.push("Next episode: " + nextEpisodeTeaser.trim());
  return sections.join("\n\n");
}
