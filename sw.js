const DRIVE_THUMBNAIL_CACHE = "awqaf-drive-thumbnails-v1";
const MAX_DRIVE_THUMBNAILS = 180;

function isDriveThumbnailRequest(request) {
  if (request.method !== "GET") return false;

  try {
    const url = new URL(request.url);
    return url.hostname === "drive.google.com" && url.pathname === "/thumbnail";
  } catch {
    return false;
  }
}

async function trimCache(cache) {
  const keys = await cache.keys();
  if (keys.length <= MAX_DRIVE_THUMBNAILS) return;

  await Promise.all(
    keys.slice(0, keys.length - MAX_DRIVE_THUMBNAILS).map((request) => cache.delete(request)),
  );
}

async function cacheFirstDriveThumbnail(event) {
  const cache = await caches.open(DRIVE_THUMBNAIL_CACHE);
  const cached = await cache.match(event.request, { ignoreVary: true });

  if (cached) {
    return cached;
  }

  const response = await fetch(event.request);
  if (response && (response.ok || response.type === "opaque")) {
    event.waitUntil(
      cache
        .put(event.request, response.clone())
        .then(() => trimCache(cache))
        .catch(() => {}),
    );
  }

  return response;
}

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  if (!isDriveThumbnailRequest(event.request)) return;
  event.respondWith(cacheFirstDriveThumbnail(event));
});
