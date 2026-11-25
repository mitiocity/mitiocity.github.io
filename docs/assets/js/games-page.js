"use strict";

/*
  みちを市ポータルサイトのGAMEページ専用処理。

  #page/games が開かれた時だけ、
  とーたるえいと❣️ ver1.3の専用カードを表示する。

  カードを押すと、縦持ち落下パズル版
  total-eight_mobile.html を開く。
*/

(() => {
  const main = document.getElementById("main-content");

  if (!main) {
    return;
  }

  function currentRoute() {
    return decodeURIComponent(
      location.hash.replace(/^#/, "")
    )
      .trim()
      .toLowerCase();
  }

  function isGamesPage() {
    const route = currentRoute();

    return route === "page/games" || route === "games";
  }

  function createGamesMarkup() {
    return `
      <p class="mitiocity-games-intro">
        みちを市から生まれた、オリジナルゲームの入口です。
      </p>

      <section
        class="mitiocity-games-grid"
        aria-label="オリジナルゲーム一覧"
      >
        <a
          class="mitiocity-game-card"
          href="/total-eight/total-eight_mobile.html?v=20261125-08"
          aria-label="とーたるえいと❣️ ver1.3をはじめる"
        >
          <div class="mitiocity-game-card__inner">
            <div class="mitiocity-game-card__content">
              <p class="mitiocity-game-card__eyebrow">
                ORIGINAL PUZZLE GAME
              </p>

              <h2 class="mitiocity-game-card__title">
                とーたるえいと❣️
              </h2>

              <p class="mitiocity-game-card__description">
                上から落ちるリングをつなげて、<br>
                合計8を作れ。
              </p>

              <span class="mitiocity-game-card__start">
                ver1.3をはじめる
              </span>
            </div>

            <div
              class="mitiocity-game-card__visual"
              aria-hidden="true"
            >
              <i class="mitiocity-game-card__halo"></i>

              <i class="mitiocity-game-card__orb">
                3
              </i>

              <i
                class="mitiocity-game-card__ring mitiocity-game-card__ring--one"
              >
                1
              </i>

              <i
                class="mitiocity-game-card__ring mitiocity-game-card__ring--two"
              >
                2
              </i>

              <i
                class="mitiocity-game-card__ring mitiocity-game-card__ring--three"
              >
                2
              </i>
            </div>
          </div>
        </a>
      </section>
    `;
  }

  function getGamesEntry() {
    return main.querySelector(
      ".page-article .entry-content"
    );
  }

  function makeGamesPage() {
    if (!isGamesPage()) {
      return;
    }

    const entry = getGamesEntry();

    if (!entry) {
      return;
    }

    const existingCard = entry.querySelector(
      ".mitiocity-game-card"
    );

    if (existingCard) {
      entry.dataset.gamesPageReady = "true";
      return;
    }

    entry.dataset.gamesPageReady = "true";
    entry.innerHTML = createGamesMarkup();
  }

  function scheduleGamesPage() {
    requestAnimationFrame(() => {
      makeGamesPage();

      requestAnimationFrame(() => {
        makeGamesPage();
      });
    });
  }

  const observer = new MutationObserver(() => {
    scheduleGamesPage();
  });

  observer.observe(main, {
    childList: true,
    subtree: true
  });

  window.addEventListener("hashchange", scheduleGamesPage);
  window.addEventListener("load", scheduleGamesPage);

  let retryCount = 0;

  const retryTimer = window.setInterval(() => {
    retryCount += 1;
    makeGamesPage();

    if (retryCount >= 24) {
      window.clearInterval(retryTimer);
    }
  }, 250);

  scheduleGamesPage();
})();
