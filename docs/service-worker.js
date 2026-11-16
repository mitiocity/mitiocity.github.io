"use strict";

/*
  キャッシュ名を v1 → v2 へ変更する。

  これにより、以前の壊れたJavaScript・JSONのキャッシュを削除し、
  次回アクセス時に最新版を取得する。
*/
const CACHE_NAME = "mitiocity-static-v2";

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

/*
  サイト本体をキャッシュへ保存する。

  ただし、下のfetch処理ではHTML・CSS・JS・JSONについて
  ネットワーク優先にしているため、公開後の修正が
  古いキャッシュで妨げられない。
*/
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(CORE_FILES);
    })
  );

  self.skipWaiting();
});

/*
  v1などの旧キャッシュを削除し、
  更新直後から新しいService Workerを使う。
*/
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

function isAlwaysFreshFile(requestUrl) {
  const pathname = requestUrl.pathname;

  return (
    pathname.endsWith("/") ||
    pathname.endsWith("/index.html") ||
    pathname.endsWith("/manifest.webmanifest") ||
    pathname.endsWith("/data/site-data.json") ||
    pathname.endsWith(".js") ||
    pathname.endsWith(".css")
  );
}

function saveToCache(request, response) {
  if (!response || !response.ok) {
    return;
  }

  const responseCopy = response.clone();

  caches.open(CACHE_NAME).then((cache) => {
    cache.put(request, responseCopy);
  });
}

/*
  動作に直結するファイルはネットワーク優先。

  対象：
  - HTML
  - JavaScript
  - CSS
  - site-data.json
  - manifest

  これにより公開後の修正が即座に反映される。
  通信不能時だけキャッシュへ戻る。
*/
self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(request.url);

  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  if (request.mode === "navigate" || isAlwaysFreshFile(requestUrl)) {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          saveToCache(request, networkResponse);
          return networkResponse;
        })
        .catch(() => {
          return caches.match(request).then((cachedResponse) => {
            return cachedResponse || caches.match("./index.html");
          });
        })
    );

    return;
  }

  /*
    画像・BGM・動画はキャッシュ優先。
    重い素材を毎回ダウンロードしないための設定。
  */
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(request).then((networkResponse) => {
        saveToCache(request, networkResponse);
        return networkResponse;
      });
    })
  );
});
