const DRIVE_THUMBNAIL_CACHE = "awqaf-drive-thumbnails-v2";
const LOCAL_PHOTOS_CACHE = "awqaf-local-photos-v1";
const PHOTO_MANIFEST_CACHE = "awqaf-photo-manifest-v1";
const MAX_DRIVE_THUMBNAILS = 180;
const MAX_LOCAL_PHOTOS = 400;

function isDriveThumbnailRequest(request) {
  if (request.method !== "GET") return false;

  try {
    const url = new URL(request.url);
    return url.hostname === "drive.google.com" && url.pathname === "/thumbnail";
  } catch {
    return false;
  }
}

function isLocalPhotoManifestRequest(request) {
  if (request.method !== "GET") return false;

  try {
    const url = new URL(request.url);
    return url.origin === self.location.origin && url.pathname.endsWith("/photos/index.json");
  } catch {
    return false;
  }
}

function isLocalPhotoAssetRequest(request) {
  if (request.method !== "GET") return false;

  try {
    const url = new URL(request.url);
    return (
      url.origin === self.location.origin &&
      url.pathname.includes("/photos/") &&
      !url.pathname.endsWith("/photos/index.json")
    );
  } catch {
    return false;
  }
}

async function trimCache(cache, maxEntries) {
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;

  await Promise.all(
    keys.slice(0, keys.length - maxEntries).map((request) => cache.delete(request)),
  );
}

async function cacheFirst(event, cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(event.request, { ignoreVary: true });

  if (cached) {
    return cached;
  }

  const response = await fetch(event.request);
  if (response && (response.ok || response.type === "opaque")) {
    event.waitUntil(
      cache
        .put(event.request, response.clone())
        .then(() => trimCache(cache, maxEntries))
        .catch(() => {}),
    );
  }

  return response;
}

async function networkFirst(event, cacheName) {
  const cache = await caches.open(cacheName);

  try {
    const response = await fetch(event.request, { cache: "no-store" });
    if (response && response.ok) {
      event.waitUntil(cache.put(event.request, response.clone()).catch(() => {}));
    }
    return response;
  } catch (error) {
    const cached = await cache.match(event.request, { ignoreVary: true });
    if (cached) {
      return cached;
    }
    throw error;
  }
}

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  if (isDriveThumbnailRequest(event.request)) {
    event.respondWith(cacheFirst(event, DRIVE_THUMBNAIL_CACHE, MAX_DRIVE_THUMBNAILS));
    return;
  }

  if (isLocalPhotoManifestRequest(event.request)) {
    event.respondWith(networkFirst(event, PHOTO_MANIFEST_CACHE));
    return;
  }

  if (isLocalPhotoAssetRequest(event.request)) {
    event.respondWith(cacheFirst(event, LOCAL_PHOTOS_CACHE, MAX_LOCAL_PHOTOS));
    return;
  }
});
