export function isVerifiedMetaPageIdentity(pageId, expectedPageId) {
  return typeof pageId === "string" &&
    typeof expectedPageId === "string" &&
    /^\d+$/.test(pageId) &&
    /^\d+$/.test(expectedPageId) &&
    pageId === expectedPageId;
}
