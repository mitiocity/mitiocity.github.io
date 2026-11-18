"use strict";

/*
<<<<<<< HEAD
  みちを市ポータルサイト / とーたるえいと❣️

  更新が反映されない事故を防ぐためのService Worker。

  独自キャッシュは一切使わない。
  同一サイト内のHTML、CSS、JavaScript、画像、音声は、
  毎回ネットワークから取得する。

  これにより、GitHubでコミットした最新版が
  iPhone Safari / iPhone Chrome / PCブラウザで読み込まれる。
*/
=======
  サイト全体のService Worker

  通常サイト：
  キャッシュ優先で表示する。

  とーたるえいと❣️（/total-eight/）：
  ネットワーク優先で表示する。
  GitHubでコミットした最新版の index.html / style.css / script.js を
  SafariでゲームURLを開いた時に最初に取得する。

  通信できない時だけ、最後に保存されたキャッシュを使う。
*/

const CACHE_NAME = "mitiocity-network-first-20261118-v1";
>>>>>>> 83972afd5b83761fde4d7aff6cef1388ff269aa5

const VERSION = "network-only-20261118-v1";

self.addEventListener("install", () => {
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
<<<<<<< HEAD
              cacheName.startsWith("mitiocity-network-first-") ||
              cacheName.startsWith("mitiocity-")
            );
          })
=======
              cacheName.startsWith("mitiocity-network-first-")
            );
          })
          .filter((cacheName) => cacheName !== CACHE_NAME)
>>>>>>> 83972afd5b83761fde4d7aff6cef1388ff269aa5
          .map((cacheName) => caches.delete(cacheName))
      );
    }).then(() => self.clients.claim())
  );
});

/*
  通常サイト用：
  すでに保存済みならキャッシュを優先する。
*/
async function cacheFirst(request) {
  const cachedResponse = await caches.match(request);

  if (cachedResponse) {
    return cachedResponse;
  }

  const networkResponse = await fetch(request);

  if (networkResponse.ok && !request.headers.has("range")) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, networkResponse.clone());
  }

  return networkResponse;
}

/*
  とーたるえいと❣️用：
  常にGitHub Pages上の最新版を最初に取得する。
  取得できなかった場合だけキャッシュを使う。
*/
async function networkFirst(request) {
  try {
    const latestRequest = new Request(request, {
      cache: "no-store"
    });

    const networkResponse = await fetch(latestRequest);

    if (networkResponse.ok && !request.headers.has("range")) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, networkResponse.clone());
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
<<<<<<< HEAD
    cache: "no-store" により、ブラウザキャッシュも使わず、
    GitHub Pages上の最新ファイルを取得する。
  */
  const latestRequest = new Request(request, {
    cache: "no-store"
  });

  event.respondWith(fetch(latestRequest));
=======
    とーたるえいと❣️だけは常にネットワーク優先。
    index.html、style.css、script.js、画像、音声も含めて
    公開サーバー上の最新版を最初に読む。
  */
  if (url.pathname.startsWith("/total-eight/")) {
    event.respondWith(networkFirst(request));
    return;
  }

  /*
    通常サイトのページ移動はネットワーク優先。
    オフライン時だけキャッシュを使う。
  */
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }

  /*
    通常サイトの画像・CSS・JavaScriptはキャッシュ優先。
  */
  event.respondWith(cacheFirst(request));
>>>>>>> 83972afd5b83761fde4d7aff6cef1388ff269aa5
});
