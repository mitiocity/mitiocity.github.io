"use strict";

/*
  みちを市ポータルサイトのGAMEページ専用処理。

  既存の assets/js/site.js は変更しない。
  #page/games が開かれた時だけ、
  とーたるえいと❣️の専用カードを表示する。
*/

(() => {
  const main = document.getElementById("main-content");

  if (!main) {
    return;
  }

  function isGamesPage() {
    const hash = decodeURIComponent(
      location.hash.replace(/^#/, "")
    ).trim();

    return (
      hash === "page/games" ||
      hash === "games"
    );
  }

  function makeGamesPage() {
    if (!isGamesPage()) {
      return;
    }

    const entry = main.querySelector(
      ".page-article .entry-content"
    );

    /*
      site.js が本文を描画し終えるまでは何もしない。
    */
    if (!entry) {
      return;
    }

    /*
      同じカードを何度も追加しない。
    */
    if (entry.dataset.gamesPageReady === "true") {
      return;
    }

    entry.dataset.gamesPageReady = "true";

    entry.innerHTML = `
      <p class="mitiocity-games-intro">
        みちを市から生まれた、オリジナルゲームの入口です。
      </p>

      <section
        class="mitiocity-games-grid"
        aria-label="オリジナルゲーム一覧"
      >
        <a
          class="mitiocity-game-card"
          href="./total-eight/"
          aria-label="とーたるえいと❣️をはじめる"
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
                右から流れるリングをつなげて、<br>
                合計8を作れ。
              </p>

              <span class="mitiocity-game-card__start">
                ゲームをはじめる
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

  /*
    site.js がページ本文を作り直すたびに監視する。
    GAME以外のページには何もしない。
  */
  const observer = new MutationObserver(() => {
    makeGamesPage();
  });

  observer.observe(main, {
    childList: true,
    subtree: true
  });

  window.addEventListener("hashchange", () => {
    requestAnimationFrame(makeGamesPage);
  });

  requestAnimationFrame(makeGamesPage);
})();
