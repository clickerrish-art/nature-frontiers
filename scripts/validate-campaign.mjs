import { readFile } from "node:fs/promises";

const file = new URL("../data/products.json", import.meta.url);
const products = JSON.parse(await readFile(file, "utf8"));
const errors = [];
const warnings = [];

if (!Array.isArray(products) || products.length === 0) {
  errors.push("Catalogue must be a non-empty array.");
} else {
  const ids = new Set();
  for (const [index, product] of products.entries()) {
    const label = product?.id || `item ${index + 1}`;
    for (const field of ["id", "title", "price", "url", "promotion_angle", "status"]) {
      if (typeof product?.[field] !== "string" || !product[field].trim()) {
        errors.push(`${label}: missing required field "${field}".`);
      }
    }
    if (product?.id && ids.has(product.id)) errors.push(`Duplicate product id: ${product.id}`);
    if (product?.id) ids.add(product.id);

    try {
      const url = new URL(product.url);
      if (url.protocol !== "https:" || url.hostname !== "selar.com") {
        errors.push(`${label}: URL must be an HTTPS Selar link.`);
      }
    } catch {
      errors.push(`${label}: invalid URL.`);
    }

    if (product?.status !== "review-required") {
      warnings.push(`${label}: status is not review-required; human review is still required.`);
    }

    const text = `${product?.title ?? ""} ${product?.promotion_angle ?? ""}`.toLowerCase();
    // Remove explicit cautionary wording before checking for claims. A warning such as
    // "never imply guaranteed income" is not itself a promise of guaranteed income.
    const claimText = text.replace(
      /\b(?:do not|don't|never|without)\b[^.!?]{0,120}\b(?:guarantee(?:d)?|promise(?:d)?|claim(?:ed)?)\b[^.!?]{0,80}[.!?]?/gi,
      ""
    );
    if (/guaranteed income|guaranteed earnings|make money fast|risk[- ]free income/.test(claimText)) {
      errors.push(`${label}: contains a prohibited guaranteed-income style claim.`);
    }
  }

  const urls = new Map();
  for (const product of products) {
    if (!product?.url) continue;
    const previous = urls.get(product.url);
    if (previous) {
      warnings.push(`Shared checkout URL used by "${previous}" and "${product.id}". Verify each link resolves to the intended product before promotion.`);
    } else {
      urls.set(product.url, product.id);
    }
  }
}

if (warnings.length) {
  console.log("Review warnings:");
  for (const warning of warnings) console.log(`- ${warning}`);
}
if (errors.length) {
  console.error("Validation failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Catalogue validation passed for ${products.length} fixed products.`);
console.log("Publishing remains disabled; this script does not publish or schedule content.");
