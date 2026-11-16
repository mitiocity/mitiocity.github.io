"use strict";

/*
  mitiocity PWA キャッシュ初期化版

  以前の v1 / v2 キャッシュを削除する。
  今後はHTML・JavaScript・CSS・JSONをキャッシュで固定せず、
  常にGitHub Pagesの公開中最新版を利用する。

  これにより、Safari版とホーム画面のPWA版で
  表示・タップ動作が食い違う問題を防ぐ。
*/

const CACHE_PREFIX = "mitiocity-static-";

self.addEventListener("install", () => {
  /*
    新しいService Workerを待機させず、
    更新後すぐ利用できるようにする。
  */
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((cacheName) => {
              return cacheName.startsWith(CACHE_PREFIX);
            })
            .map((cacheName) => {
              return caches.delete(cacheName);
            })
        );
      })
      .then(() => {
        return self.clients.claim();
      })
  );
});

/*
  fetchイベントを登録しない。

  つまり、PWAとしてホーム画面から開く形は維持しつつ、
  HTML・CSS・JavaScript・site-data.json・画像・BGM・動画は
  GitHub Pagesからその時点の最新版を直接読み込む。
*/
