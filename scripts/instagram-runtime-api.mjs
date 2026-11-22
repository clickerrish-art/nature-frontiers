import {
  createInstagramMediaContainer, getInstagramContainerStatus,
  publishInstagramContainer, verifyInstagramMedia,
  listRecentInstagramMedia, getInstagramPublishingLimit
} from "./instagram-api.mjs";

export function createInstagramApiClient(config) {
  return {
    createContainer: (media) => createInstagramMediaContainer(config, media),
    getContainerStatus: (id) => getInstagramContainerStatus(config, id),
    publishContainer: (id) => publishInstagramContainer(config, id),
    verifyMedia: (id, kind) => verifyInstagramMedia(config, id, kind),
    listRecentMedia: (limit) => listRecentInstagramMedia(config, limit),
    getPublishingLimit: () => getInstagramPublishingLimit(config)
  };
}
