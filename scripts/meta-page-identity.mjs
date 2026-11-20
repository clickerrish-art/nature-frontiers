export function isVerifiedMetaPageIdentity(pageId, expectedPageId) {
  return typeof pageId === "string" &&
    typeof expectedPageId === "string" &&
    /^\d+$/.test(pageId) &&
    /^\d+$/.test(expectedPageId) &&
    pageId === expectedPageId;
}

export function isVerifiedMetaInstagramIdentity(instagramUserId, expectedInstagramUserId) {
  return typeof instagramUserId === "string" &&
    typeof expectedInstagramUserId === "string" &&
    /^\d+$/.test(instagramUserId) &&
    /^\d+$/.test(expectedInstagramUserId) &&
    instagramUserId === expectedInstagramUserId;
}
