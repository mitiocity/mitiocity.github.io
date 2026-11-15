"use strict";

const CACHE_NAME = "mitiocity-static-v1";

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
            return cacheName.startsWith("mitiocity-static-");
          })
          .filter((cacheName) => {
            return cacheName !== CACHE_NAME;
          })
          .map((cacheName) => {
            return caches.delete(cacheName);
          })
      );
    })
  );

  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  if (new URL(request.url).origin !== self.location.origin) {
    return;
  }

  /*
    画面移動はネットワーク優先。
    通信できないときだけトップ画面を表示する。
  */
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => {
        return caches.match("./index.html");
      })
    );

    return;
  }

  /*
    CSS・JS・画像・BGM・動画は、
    一度取得したものをキャッシュから先に返す。
    未キャッシュの素材はネットワークから取得し、
    次回以降のために保存する。
  */
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(request).then((networkResponse) => {
        const responseCopy = networkResponse.clone();

        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, responseCopy);
        });

        return networkResponse;
      });
    })
  );
});
