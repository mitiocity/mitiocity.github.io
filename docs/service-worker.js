"use strict";

/*
  サイト全体のService Worker

  通常サイトの主要ファイル：
  キャッシュ優先（オフライン表示を維持）

  /total-eight/ 配下：
  ネットワーク優先
  → GitHubへコミットした最新版を、Safariでゲームを開くたびに取得する。
  → 古いCSS / JavaScriptが残り続ける問題を防ぐ。
*/

const CACHE_NAME = "mitiocity-network-first-20261117";

const CORE_FILES = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./data/site-data.json",
  "./assets/css/style.css",
  "./assets/css/link-buttons.css",
  "./assets/js/entrance.js",
  "./assets/js/site.js",
  "./assets/js/gate.js",
  "./assets/images/arius-gate.png",
  "./assets/images/icons/apple-touch-icon.png",
  "./assets/images/icons/icon-192.png",
  "./assets/images/icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(CORE_FILES);
    })
  );

  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((cacheName) => {
            return (
              cacheName.startsWith("mitiocity-static-") ||
              cacheName.startsWith("mitiocity-network-first-")
            );
          })
          .filter((cacheName) => cacheName !== CACHE_NAME)
          .map((cacheName) => caches.delete(cacheName))
      );
    }).then(() => self.clients.claim())
  );
});

async function cacheFirst(request) {
  const cachedResponse = await caches.match(request);

  if (cachedResponse) {
    return cachedResponse;
  }

  const networkResponse = await fetch(request);

  if (networkResponse.ok) {
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, networkResponse.clone());
  }

  return networkResponse;
}

async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);

    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    const cachedResponse = await caches.match(request);

    if (cachedResponse) {
      return cachedResponse;
    }

    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET") {
    return;
  }

  if (url.origin !== self.location.origin) {
    return;
  }

  /*
    とーたるえいと❣️は常にネットワーク優先。
    index.html / style.css / script.js / 音源 / 画像を、
    GitHub上の最新版から取得する。
  */
  if (url.pathname.startsWith("/total-eight/")) {
    event.respondWith(networkFirst(request));
    return;
  }

  /*
    通常サイトの画面遷移はネットワーク優先。
    オフライン時だけキャッシュを使う。
  */
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }

  /*
    通常サイトの画像・CSS・JSは従来どおりキャッシュ優先。
  */
  event.respondWith(cacheFirst(request));
});
