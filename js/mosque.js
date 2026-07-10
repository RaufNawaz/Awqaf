import { APP_CONFIG } from "./config.js?v=mosque-page-refresh-20260710";
import { loadDrivePhotosForRow, loadShrineRows } from "./data.js?v=mosque-page-refresh-20260710";
import { formatDrivePhotoLabel } from "./drive-photos.js?v=mosque-page-refresh-20260710";
import {
  escapeHtml,
  formatTitleCaseName,
  joinBits,
  normalizeSearchText,
  wait,
} from "./utils.js?v=mosque-page-refresh-20260710";

const UI_TEXT = {
  loading: "Loading mosque details...",
  invalidId: "Invalid mosque id.",
  notFound: "Mosque not found.",
  failedTitle: "Unable to load this mosque page",
  failedPrefix: "Failed to load data:",
  pageEyebrow: "Auqaf Mosque Directory",
  browseMap: "Browse map",
  getDirections: "Get directions",
  openFullMap: "Open full map",
  publicDetails: "Public details",
  aboutTab: "About",
  locationTab: "Location",
  detailsTab: "Public details",
  nearbyTab: "Nearby",
  aboutHeading: "About this mosque",
  mapHeading: "Location map",
  galleryHeading: "Photo gallery",
  nearbyHeading: "Nearby mosques",
  distanceAway: "away",
  fallbackBody:
    "Public information, mapped location details, and available photographs are listed here for general visitors.",
  address: "Address",
  registeredName: "Registered name",
  onSiteName: "Name on site",
  district: "District",
  city: "City",
  imam: "Imam",
  built: "Built",
  womensPrayer: "Women's prayer section",
  associatedShrine: "Associated shrine",
  coordinates: "Coordinates",
};
const PAGE_VERSION_QUERY = "v=mosque-page-refresh-20260710";

const pageEl = document.getElementById("mosquePage");

function registerPhotoCacheWorker() {
  if (!("serviceWorker" in navigator) || window.location.protocol === "file:") {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.warn("Photo cache worker could not be registered.", error);
    });
  });
}

async function waitForLibraries(timeoutMs = 5000) {
  const startedAt = Date.now();

  while (!window.Papa) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("Papa Parse did not finish loading.");
    }

    await wait(30);
  }
}

function getRequestedRowId() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id") || params.get("mosque") || "";
}

function getDistrictLabel(row) {
  return row.zone || "";
}

function getCityLabel(row) {
  return row.city || "";
}

function getMapPageUrl(row) {
  return `./index.html?id=${encodeURIComponent(row.id)}&${PAGE_VERSION_QUERY}`;
}

function getOnSiteName(row) {
  if (row.mosqueNameOnGround && row.mosqueNameOnGround !== row.title) {
    return row.mosqueNameOnGround;
  }

  return "";
}

function getRegisteredName(row) {
  if (
    row.mosqueName &&
    row.mosqueName !== row.title &&
    row.mosqueName !== row.mosqueNameOnGround
  ) {
    return row.mosqueName;
  }

  return "";
}

function getAssociatedShrine(row) {
  if (row.shrineName && row.shrineName !== row.title) {
    return row.shrineName;
  }

  return "";
}

function getLocationLabel(row) {
  return joinBits([getCityLabel(row), getDistrictLabel(row)].filter(Boolean));
}

function getAddressLabel(row) {
  const address = row.address || "";
  const normalizedAddress = normalizeSearchText(address);

  if (
    !normalizedAddress ||
    normalizedAddress === normalizeSearchText(row.city) ||
    normalizedAddress === normalizeSearchText(row.zone) ||
    normalizedAddress === normalizeSearchText(getLocationLabel(row))
  ) {
    return "";
  }

  return address;
}

function getMosquePageUrl(row) {
  return `./mosque.html?id=${encodeURIComponent(row.id)}&${PAGE_VERSION_QUERY}`;
}

function buildDirectionsUrl(lat, lng) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
    `${lat},${lng}`,
  )}`;
}

function buildMiniMapEmbedUrl(lat, lng) {
  return `https://maps.google.com/maps?q=${encodeURIComponent(
    `${lat},${lng}`,
  )}&z=15&output=embed`;
}

function haversineKm(fromLat, fromLng, toLat, toLng) {
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRadians(toLat - fromLat);
  const dLng = toRadians(toLng - fromLng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(fromLat)) *
      Math.cos(toRadians(toLat)) *
      Math.sin(dLng / 2) ** 2;

  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistanceLabel(distanceKm) {
  if (!Number.isFinite(distanceKm)) return "";
  const rounded = distanceKm < 10 ? distanceKm.toFixed(1) : distanceKm.toFixed(0);
  return `${rounded} km ${UI_TEXT.distanceAway}`;
}

function splitParagraphs(text) {
  return String(text || "")
    .split(/\n\s*\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function splitSentences(text) {
  return String(text || "")
    .match(/[^.!?]+[.!?]?/g)
    ?.map((sentence) => sentence.trim())
    .filter(Boolean) || [];
}

function buildGeneratedNarrative(row) {
  const bodyParts = [];

  if (row.mosqueBuiltDate) {
    bodyParts.push(`The recorded built year is ${row.mosqueBuiltDate}.`);
  }

  if (row.imamName) {
    bodyParts.push(`The listed imam is ${formatTitleCaseName(row.imamName)}.`);
  }

  if (row.womensPrayerSection) {
    bodyParts.push(`Women's prayer section: ${row.womensPrayerSection}.`);
  }

  if (getAssociatedShrine(row)) {
    bodyParts.push(`The record also notes an associated shrine: ${getAssociatedShrine(row)}.`);
  }

  return {
    intro: "",
    body: bodyParts.length ? [bodyParts.join(" ")] : [UI_TEXT.fallbackBody],
  };
}

function buildNarrative(row) {
  const commentParagraphs = splitParagraphs(row.comments);
  if (!commentParagraphs.length) {
    return buildGeneratedNarrative(row);
  }

  if (commentParagraphs.length > 1) {
    return {
      intro: commentParagraphs[0],
      body: commentParagraphs.slice(1),
    };
  }

  const sentences = splitSentences(commentParagraphs[0]);
  if (sentences.length >= 3) {
    return {
      intro: sentences.slice(0, 2).join(" "),
      body: [sentences.slice(2).join(" ")],
    };
  }

  const generated = buildGeneratedNarrative(row);
  return {
    intro: commentParagraphs[0],
    body: generated.body,
  };
}

function formatParagraphs(paragraphs) {
  return paragraphs
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join("");
}

function buildPhotoItems(row) {
  const photos = row.drivePhotos?.length
    ? row.drivePhotos.map((photo, index) => ({
        ...photo,
        label: formatDrivePhotoLabel(photo, index),
      }))
    : [
        ...row.outsidePhotos.map((photo, index) => ({
          ...photo,
          label: `Outside photo ${index + 1}`,
        })),
        ...row.insidePhotos.map((photo, index) => ({
          ...photo,
          label: `Inside photo ${index + 1}`,
        })),
      ];

  return photos.filter((photo) => photo.isRenderable && (photo.previewUrl || photo.url));
}

function getPhotoImageUrl(photo, variant = "gallery") {
  return photo?.thumbnailUrls?.[variant] || photo?.previewUrl || photo?.url || "";
}

function getNearbyMosques(rows, currentRow, limit = 4) {
  if (!Number.isFinite(currentRow?.latitude) || !Number.isFinite(currentRow?.longitude)) {
    return [];
  }

  return (rows || [])
    .filter(
      (row) =>
        row.id !== currentRow.id &&
        Number.isFinite(row.latitude) &&
        Number.isFinite(row.longitude) &&
        row.title,
    )
    .map((row) => ({
      row,
      distanceKm: haversineKm(
        currentRow.latitude,
        currentRow.longitude,
        row.latitude,
        row.longitude,
      ),
    }))
    .sort((left, right) => {
      if (left.distanceKm !== right.distanceKm) {
        return left.distanceKm - right.distanceKm;
      }
      return left.row.title.localeCompare(right.row.title);
    })
    .slice(0, limit);
}

function renderFactRows(items) {
  const filtered = items.filter(({ value }) => Boolean(value));
  if (!filtered.length) return "";

  return `
    <dl class="mosque-fact-list">
      ${filtered
        .map(
          ({ label, value }) => `
            <div class="mosque-fact">
              <dt>${escapeHtml(label)}</dt>
              <dd>${escapeHtml(value)}</dd>
            </div>
          `,
        )
        .join("")}
    </dl>
  `;
}

function attachMediaFallbacks(root) {
  root.querySelectorAll(".mosque-media-img").forEach((image) => {
    image.addEventListener(
      "error",
      () => {
        const item = image.closest(".mosque-gallery-item");
        const section = image.closest(".mosque-gallery-section");
        item?.remove();

        if (section && !section.querySelector(".mosque-gallery-item")) {
          section.remove();
        }
      },
      { once: true },
    );
  });
}

function scrollToRequestedSection() {
  const targetId = window.location.hash.replace(/^#/, "");
  if (!targetId) return;

  window.requestAnimationFrame(() => {
    document.getElementById(targetId)?.scrollIntoView({
      block: "start",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  });
}

function attachHeroPhotoFallback(root) {
  root.querySelectorAll(".mosque-hero-media-img").forEach((image) => {
    image.addEventListener(
      "error",
      () => {
        const heroTop = image.closest(".mosque-hero-top");
        image.closest(".mosque-hero-media-wrap")?.remove();
        heroTop?.classList.add("mosque-hero-top-no-media");
      },
      { once: true },
    );
  });
}

function revealImmediately(elements) {
  elements.forEach((element) => {
    element.classList.add("is-visible");
  });
}

function setupScrollReveals(root) {
  const targets = Array.from(
    root.querySelectorAll(
      [
        ".mosque-article-section",
        ".mosque-sidebar-card",
        ".mosque-coordinate-card",
        ".mosque-map-wrap",
        ".mosque-nearby-card",
        ".mosque-gallery-item",
      ].join(", "),
    ),
  );

  targets.forEach((element, index) => {
    element.classList.add("reveal-on-scroll");
    element.style.setProperty("--reveal-delay", `${Math.min(index * 35, 220)}ms`);
  });

  if (
    !("IntersectionObserver" in window) ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    revealImmediately(targets);
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    {
      rootMargin: "0px 0px -8% 0px",
      threshold: 0.12,
    },
  );

  targets.forEach((element) => {
    observer.observe(element);
  });
}

function renderGallerySection(items) {
  if (!items.length) return "";

  return `
    <section id="gallery" class="mosque-gallery-section">
      <div class="mosque-section-heading">
        <h2>${escapeHtml(UI_TEXT.galleryHeading)}</h2>
      </div>
      <div class="mosque-gallery-grid">
        ${items
          .map((photo) => {
            const imageUrl = getPhotoImageUrl(photo, "gallery");

            return `
              <a
                class="mosque-gallery-item"
                href="${escapeHtml(photo.url)}"
                target="_blank"
                rel="noopener noreferrer"
              >
                <div class="mosque-gallery-media">
                  <img
                    class="mosque-gallery-img mosque-media-img"
                    src="${escapeHtml(imageUrl)}"
                    alt="${escapeHtml(photo.label)}"
                    loading="lazy"
                    decoding="async"
                    fetchpriority="low"
                  />
                </div>
                <span>${escapeHtml(photo.label)}</span>
              </a>
            `;
          })
          .join("")}
      </div>
    </section>
  `;
}

function renderNearbySection(items) {
  if (!items.length) return "";

  return `
    <section id="nearby" class="mosque-article-section">
      <div class="mosque-section-heading">
        <h2>${escapeHtml(UI_TEXT.nearbyHeading)}</h2>
      </div>
      <div class="mosque-nearby-grid">
        ${items
          .map(({ row, distanceKm }) => {
            const meta = [getLocationLabel(row), formatDistanceLabel(distanceKm)]
              .filter(Boolean)
              .join(" · ");

            return `
              <a class="mosque-nearby-card" href="${escapeHtml(getMosquePageUrl(row))}">
                <span class="mosque-nearby-name">${escapeHtml(row.title)}</span>
                <span class="mosque-nearby-meta">${escapeHtml(meta)}</span>
              </a>
            `;
          })
          .join("")}
      </div>
    </section>
  `;
}

function renderHeroPhoto(photo, hasGallery) {
  if (!photo) return "";
  const imageUrl = getPhotoImageUrl(photo, "hero");
  if (!imageUrl) return "";

  const linkAttributes = hasGallery
    ? `href="#gallery" aria-label="${escapeHtml(UI_TEXT.galleryHeading)}"`
    : `href="${escapeHtml(photo.url)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(photo.label)}"`;

  return `
    <a class="mosque-hero-media-wrap" ${linkAttributes}>
      <img
        class="mosque-hero-media-img"
        src="${escapeHtml(imageUrl)}"
        alt="${escapeHtml(photo.label)}"
        loading="eager"
        decoding="async"
        fetchpriority="high"
      />
    </a>
  `;
}

function renderPage(rows, row) {
  const narrative = buildNarrative(row);
  const galleryItems = buildPhotoItems(row);
  const heroPhoto = galleryItems[0] || null;
  const galleryPhotos = galleryItems.slice(1);
  const nearbyMosques = getNearbyMosques(rows, row);
  const locationLabel = getLocationLabel(row);
  const addressLabel = getAddressLabel(row);
  const directionsUrl = buildDirectionsUrl(row.latitude, row.longitude);
  const fullMapUrl = row.whatsappLocationUrl || directionsUrl;
  const publicFacts = [
    { label: UI_TEXT.registeredName, value: getRegisteredName(row) },
    { label: UI_TEXT.onSiteName, value: getOnSiteName(row) },
    { label: UI_TEXT.district, value: getDistrictLabel(row) },
    { label: UI_TEXT.city, value: getCityLabel(row) },
    { label: UI_TEXT.imam, value: formatTitleCaseName(row.imamName) },
    { label: UI_TEXT.built, value: row.mosqueBuiltDate },
    { label: UI_TEXT.womensPrayer, value: row.womensPrayerSection },
    { label: UI_TEXT.associatedShrine, value: getAssociatedShrine(row) },
  ];
  pageEl.innerHTML = `
    <div class="mosque-shell">
      <div class="mosque-toolbar">
        <a class="mosque-toolbar-link" href="${escapeHtml(
          getMapPageUrl(row),
        )}">${escapeHtml(UI_TEXT.browseMap)}</a>
      </div>

      <section class="mosque-hero">
        <div class="mosque-hero-top${heroPhoto ? "" : " mosque-hero-top-no-media"}">
          <div class="mosque-hero-copy">
            <p class="mosque-eyebrow">${escapeHtml(UI_TEXT.pageEyebrow)}</p>
            <h1 class="mosque-title">${escapeHtml(row.title)}</h1>
            ${
              locationLabel
                ? `<p class="mosque-location-line">${escapeHtml(locationLabel)}</p>`
                : ""
            }
          </div>
          ${renderHeroPhoto(heroPhoto, galleryPhotos.length > 0)}
        </div>
        <div class="mosque-hero-divider"></div>
        <nav class="mosque-section-nav" aria-label="Mosque page sections">
          <a class="mosque-section-tab mosque-section-tab-active" href="#overview">${escapeHtml(
            UI_TEXT.aboutTab,
          )}</a>
          <a class="mosque-section-tab" href="#location">${escapeHtml(
            UI_TEXT.locationTab,
          )}</a>
          <a class="mosque-section-tab" href="#nearby">${escapeHtml(
            UI_TEXT.nearbyTab,
          )}</a>
          <a class="mosque-section-tab" href="#details">${escapeHtml(
            UI_TEXT.detailsTab,
          )}</a>
        </nav>
      </section>

      <div class="mosque-layout">
        <div class="mosque-main">
          <section id="overview" class="mosque-article-section">
            <div class="mosque-section-heading">
              <h2>${escapeHtml(UI_TEXT.aboutHeading)}</h2>
            </div>
            <div class="mosque-richtext">
              ${formatParagraphs([narrative.intro, ...narrative.body])}
            </div>
          </section>

          <section id="location" class="mosque-article-section">
            <section class="mosque-map-section">
              <div class="mosque-map-section-head">
                <h2>${escapeHtml(UI_TEXT.mapHeading)}</h2>
              </div>
              <div class="mosque-location-tools">
                ${
                  addressLabel
                    ? `<div class="mosque-coordinate-card mosque-address-card">
                        <span>${escapeHtml(UI_TEXT.address)}</span>
                        <p class="mosque-address-text">${escapeHtml(addressLabel)}</p>
                      </div>`
                    : ""
                }
                <div class="mosque-coordinate-card">
                  <span>${escapeHtml(UI_TEXT.coordinates)}</span>
                  <a
                    class="mosque-coordinate-link"
                    href="${escapeHtml(fullMapUrl)}"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <code>${escapeHtml(row.coordinatesLabel)}</code>
                    <small>${escapeHtml(UI_TEXT.openFullMap)}</small>
                  </a>
                </div>
                <div class="mosque-action-row mosque-action-row-compact">
                  <a class="mosque-btn mosque-btn-primary" href="${escapeHtml(
                    directionsUrl,
                  )}" target="_blank" rel="noopener noreferrer">${escapeHtml(
                    UI_TEXT.getDirections,
                  )}</a>
                  <a class="mosque-btn" href="${escapeHtml(
                    fullMapUrl,
                  )}" target="_blank" rel="noopener noreferrer">${escapeHtml(
                    UI_TEXT.openFullMap,
                  )}</a>
                </div>
              </div>
              <div class="mosque-map-wrap">
                <iframe
                  class="mosque-map-frame"
                  title="${escapeHtml(UI_TEXT.mapHeading)}"
                  src="${escapeHtml(buildMiniMapEmbedUrl(row.latitude, row.longitude))}"
                  loading="lazy"
                  referrerpolicy="no-referrer-when-downgrade"
                ></iframe>
              </div>
            </section>
          </section>

          ${renderNearbySection(nearbyMosques)}
          ${renderGallerySection(galleryPhotos)}
        </div>

        <aside class="mosque-aside">
          <section id="details" class="mosque-sidebar-card">
            <div class="mosque-sidebar-brand">${escapeHtml(APP_CONFIG.title)}</div>
            <h3>${escapeHtml(UI_TEXT.publicDetails)}</h3>
            ${renderFactRows(publicFacts)}
          </section>
        </aside>
      </div>
    </div>
  `;

  document.title = `${row.title} | ${APP_CONFIG.title}`;
  attachHeroPhotoFallback(pageEl);
  attachMediaFallbacks(pageEl);
  setupScrollReveals(pageEl);
  scrollToRequestedSection();
}

function renderMessage(title, message) {
  pageEl.innerHTML = `
    <div class="mosque-shell">
      <div class="mosque-toolbar">
        <a class="mosque-toolbar-link" href="./index.html?${PAGE_VERSION_QUERY}">${escapeHtml(
          UI_TEXT.browseMap,
        )}</a>
      </div>
      <section class="mosque-hero">
        <p class="mosque-eyebrow">${escapeHtml(UI_TEXT.pageEyebrow)}</p>
        <h1 class="mosque-title mosque-title-compact">${escapeHtml(title)}</h1>
        <p class="mosque-lede">${escapeHtml(message)}</p>
      </section>
    </div>
  `;
}

async function loadPageDrivePhotos(rows, row) {
  if (APP_CONFIG.drivePhotos?.enabled === false || row.drivePhotosState === "loaded") {
    return;
  }

  row.drivePhotosState = "loading";

  try {
    await loadDrivePhotosForRow(row);
    row.drivePhotosState = "loaded";
    renderPage(rows, row);
  } catch (error) {
    row.drivePhotosState = "failed";
    console.warn("Google Drive photos could not be loaded after initial render.", error);
  }
}

function schedulePagePhotoLoad(rows, row) {
  const loadPhotos = () => {
    void loadPageDrivePhotos(rows, row);
  };

  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(loadPhotos, { timeout: 800 });
    return;
  }

  window.setTimeout(loadPhotos, 0);
}

async function init() {
  pageEl.innerHTML = `<p class="muted">${escapeHtml(UI_TEXT.loading)}</p>`;

  try {
    await waitForLibraries();

    const requestedRowId = getRequestedRowId();
    if (!requestedRowId) {
      renderMessage(UI_TEXT.invalidId, UI_TEXT.notFound);
      return;
    }

    const { rows } = await loadShrineRows({ includeDrivePhotos: false });
    const row = rows.find((item) => item.id === requestedRowId);

    if (!row) {
      renderMessage(UI_TEXT.notFound, UI_TEXT.notFound);
      return;
    }

    renderPage(rows, row);
    schedulePagePhotoLoad(rows, row);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    renderMessage(UI_TEXT.failedTitle, `${UI_TEXT.failedPrefix} ${message}`);
  }
}

registerPhotoCacheWorker();
init();
