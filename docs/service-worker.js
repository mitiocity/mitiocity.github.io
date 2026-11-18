"use strict";

/*
  みちを市ポータルサイト / とーたるえいと❣️

  更新が反映されない事故を防ぐためのService Worker。

  独自キャッシュは一切使わない。
  同一サイト内のHTML、CSS、JavaScript、画像、音声は、
  毎回ネットワークから取得する。

  これにより、GitHubでコミットした最新版が
  iPhone Safari / iPhone Chrome / PCブラウザで読み込まれる。
*/

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
              cacheName.startsWith("mitiocity-network-first-") ||
              cacheName.startsWith("mitiocity-")
            );
          })
          .map((cacheName) => caches.delete(cacheName))
      );
    }).then(() => self.clients.claim())
  );
});

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
    cache: "no-store" により、ブラウザキャッシュも使わず、
    GitHub Pages上の最新ファイルを取得する。
  */
  const latestRequest = new Request(request, {
    cache: "no-store"
  });

  event.respondWith(fetch(latestRequest));
});
