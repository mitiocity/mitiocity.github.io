"use strict";

/*
  正常版PWAのキャッシュを、新規作成する。

  以前の v1 / v2 など、修正途中で残ったキャッシュは
  activate時にすべて削除する。
*/
const CACHE_NAME = "mitiocity-static-reset-20261116";

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
    画面遷移はネットワーク優先。
    オフライン時のみキャッシュしたトップ画面を返す。
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
    CSS・JavaScript・画像・BGM・動画はキャッシュ優先。
    ただし、今回は新しいキャッシュ名のため、
    壊れた旧キャッシュは使用されない。
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
