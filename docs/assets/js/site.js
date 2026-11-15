"use strict";

(() => {
  const DATA_URL = "data/site-data.json";
  const DEFAULT_PAGE_SLUG = "notes";

  const BGM_FILES = Array.from(
    { length: 50 },
    (_, index) => `assets/audio/bgm-${String(index + 1).padStart(2, "0")}.mp3`
  );

  const state = {
    data: null,
    audio: null,
    currentTrackIndex: -1
  };

  const main = document.getElementById("main-content");

  const menuToggle = document.getElementById("menu-toggle");
  const drawer = document.getElementById("portal-drawer");
  const drawerClose = document.getElementById("drawer-close");
  const drawerBackdrop = document.getElementById("drawer-backdrop");

  const bgmToggle = document.getElementById("bgm-toggle");
  const bgmControls = document.getElementById("bgm-controls");
  const bgmPlayStop = document.getElementById("bgm-play-stop");
  const bgmNext = document.getElementById("bgm-next");

  const ticker = document.getElementById("news-ticker");
  const tickerText = document.getElementById("news-ticker-text");

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function normalizeSlug(value) {
    return String(value ?? "")
      .trim()
      .replace(/^\/+|\/+$/g, "")
      .toLowerCase();
  }

  function getPages() {
    return Array.isArray(state.data?.pages) ? state.data.pages : [];
  }

  function getNews() {
    return Array.isArray(state.data?.news) ? state.data.news : [];
  }

  function getPageBySlug(slug) {
    const targetSlug = normalizeSlug(slug);

    return getPages().find((page) => {
      return normalizeSlug(page.slug) === targetSlug;
    });
  }

  function getNewsBySlug(slug) {
    const targetSlug = normalizeSlug(slug);

    return getNews().find((news) => {
      return normalizeSlug(news.slug) === targetSlug;
    });
  }

  function getTitle(item) {
    return item?.title || item?.postTitle || "無題";
  }

  function getContent(item) {
    return item?.content || item?.postContent || "";
  }

  function getExcerpt(item) {
    const excerpt = item?.excerpt || item?.postExcerpt || "";

    if (excerpt) {
      return excerpt;
    }

    const temporary = document.createElement("div");
    temporary.innerHTML = getContent(item);

    return temporary.textContent.trim().slice(0, 110);
  }

  function getDate(item) {
    return item?.date || item?.postDate || item?.publishedAt || "";
  }

  function getFeaturedImage(item) {
    return (
      item?.featuredImage ||
      item?.featuredImageUrl ||
      item?.thumbnail ||
      item?.image ||
      ""
    );
  }

  function formatDate(value) {
    if (!value) {
      return "";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return String(value).slice(0, 10).replaceAll("-", ".");
    }

    return new Intl.DateTimeFormat("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    })
      .format(date)
      .replaceAll("/", ".");
  }

  function scrollMainToTop() {
    window.scrollTo({
      top: 0,
      behavior: "instant"
    });
  }

  /*
    WordPressから移行した本文に含まれるOFUSEを削除する。

    ここで消すのはページ本文に含まれるものだけ。
    index.htmlにある画面端の常設OFUSE（.ofuse-area）は触らない。
  */
  function removeOfuseFromPageContent(content) {
    const container = document.createElement("div");

    container.innerHTML = String(content || "");

    container
      .querySelectorAll(
        [
          "a[data-ofuse-widget-button]",
          'a[href*="ofuse.me"]',
          'script[src*="ofuse.me/assets/platform/widget.js"]'
        ].join(",")
      )
      .forEach((element) => {
        const parent = element.parentElement;

        element.remove();

        if (
          parent &&
          /^(P|DIV)$/i.test(parent.tagName) &&
          parent.textContent.trim() === "" &&
          parent.children.length === 0
        ) {
          parent.remove();
        }
      });

    return container.innerHTML;
  }

  /* ハンバーガーメニュー */

  function openDrawer() {
    document.body.classList.add("menu-is-open");
    drawer.classList.add("is-open");
    drawerBackdrop.classList.add("is-open");

    drawer.setAttribute("aria-hidden", "false");
    menuToggle.setAttribute("aria-expanded", "true");
    menuToggle.setAttribute("aria-label", "メニューを閉じる");
  }

  function closeDrawer() {
    document.body.classList.remove("menu-is-open");
    drawer.classList.remove("is-open");
    drawerBackdrop.classList.remove("is-open");

    drawer.setAttribute("aria-hidden", "true");
    menuToggle.setAttribute("aria-expanded", "false");
    menuToggle.setAttribute("aria-label", "メニューを開く");
  }

  menuToggle.addEventListener("click", () => {
    if (drawer.classList.contains("is-open")) {
      closeDrawer();
    } else {
      openDrawer();
    }
  });

  drawerClose.addEventListener("click", closeDrawer);
  drawerBackdrop.addEventListener("click", closeDrawer);

  /* BGM */

  function updateBgmButtons() {
    const isPlaying = state.audio && !state.audio.paused;

    bgmToggle.textContent = isPlaying ? "❚❚" : "♪";
    bgmToggle.classList.toggle("is-playing", isPlaying);
    bgmToggle.setAttribute("aria-pressed", isPlaying ? "true" : "false");

    bgmPlayStop.textContent = isPlaying ? "停止" : "再生";
  }

  function chooseRandomTrackIndex() {
    if (BGM_FILES.length <= 1) {
      return 0;
    }

    let nextIndex = state.currentTrackIndex;

    while (nextIndex === state.currentTrackIndex) {
      nextIndex = Math.floor(Math.random() * BGM_FILES.length);
    }

    return nextIndex;
  }

  function playTrack(index) {
    state.currentTrackIndex = index;
    state.audio.src = BGM_FILES[index];
    state.audio.load();

    state.audio.play().catch(() => {
      updateBgmButtons();
    });
  }

  function playNextTrack() {
    playTrack(chooseRandomTrackIndex());
  }

  function playOrStopBgm() {
    if (state.audio.paused) {
      if (state.currentTrackIndex < 0) {
        playNextTrack();
      } else {
        state.audio.play().catch(() => {
          updateBgmButtons();
        });
      }

      return;
    }

    state.audio.pause();
  }

  function initializeAudio() {
    state.audio = new Audio();
    state.audio.preload = "auto";
    state.audio.volume = 0.38;

    state.audio.addEventListener("play", updateBgmButtons);
    state.audio.addEventListener("pause", updateBgmButtons);
    state.audio.addEventListener("ended", playNextTrack);
  }

  bgmToggle.addEventListener("click", (event) => {
    event.stopPropagation();
    bgmControls.hidden = !bgmControls.hidden;
  });

  bgmPlayStop.addEventListener("click", () => {
    playOrStopBgm();
    bgmControls.hidden = true;
  });

  bgmNext.addEventListener("click", () => {
    playNextTrack();
    bgmControls.hidden = true;
  });

  document.addEventListener("pointerdown", (event) => {
    const clickedControls = bgmControls.contains(event.target);
    const clickedToggle = bgmToggle.contains(event.target);

    if (!clickedControls && !clickedToggle) {
      bgmControls.hidden = true;
    }
  });

  /* 最新NEWSテロップ */

  function updateTicker() {
    const latestNews = getNews()[0];

    if (!latestNews) {
      ticker.href = "#news";
      tickerText.textContent = "現在、お知らせはありません";
      return;
    }

    ticker.href = `#news/${encodeURIComponent(latestNews.slug)}`;
    tickerText.textContent =
      `${formatDate(getDate(latestNews))}　${getTitle(latestNews)}`;
  }

  /* 本文内リンク */

  function makeContentLinksSafe() {
    main.querySelectorAll("a[href]").forEach((link) => {
      const href = link.getAttribute("href") || "";

      if (
        href.startsWith("#") ||
        href.startsWith("/") ||
        href.startsWith("./") ||
        href.startsWith("../")
      ) {
        return;
      }

      if (/^https?:\/\//i.test(href)) {
        link.target = "_blank";
        link.rel = "noopener noreferrer";
      }
    });
  }

  /* ページ表示 */

  function renderPage(page) {
    if (!page) {
      renderNotFound();
      return;
    }

    const title = getTitle(page);
    const image = getFeaturedImage(page);

    /*
      すべての静的ページ本文から、
      WordPress移行時に混ざったOFUSEを除去する。
      画面端の常設OFUSEは残る。
    */
    const content = removeOfuseFromPageContent(getContent(page));

    document.title = `${title}｜みちを市ポータルサイト`;

    main.innerHTML = `
      <article class="page-article">
        <header class="page-hero">
          <p class="page-hero__eyebrow">MITIOCITY PORTAL</p>
          <h1>${escapeHtml(title)}</h1>
        </header>

        ${
          image
            ? `
              <figure class="news-article__image">
                <img src="${escapeHtml(image)}" alt="${escapeHtml(title)}">
              </figure>
            `
            : ""
        }

        <div class="entry-content">
          ${content}
        </div>
      </article>
    `;

    makeContentLinksSafe();
  }

  function renderNewsList() {
    const newsItems = getNews();

    document.title = "ニュース一覧｜みちを市ポータルサイト";

    const cards = newsItems.length
      ? newsItems
          .map((news) => {
            const slug = encodeURIComponent(news.slug);
            const title = getTitle(news);
            const excerpt = getExcerpt(news);
            const date = formatDate(getDate(news));

            return `
              <a class="news-card" href="#news/${slug}">
                <time class="news-card__date">${escapeHtml(date)}</time>
                <strong class="news-card__title">${escapeHtml(title)}</strong>
                ${
                  excerpt
                    ? `<p class="news-card__excerpt">${escapeHtml(excerpt)}</p>`
                    : ""
                }
              </a>
            `;
          })
          .join("")
      : "<p>現在、お知らせはありません。</p>";

    main.innerHTML = `
      <section class="news-list">
        <header class="news-hero">
          <p class="news-hero__eyebrow">MITIOCITY PORTAL</p>
          <h1>ニュース一覧</h1>
        </header>

        ${cards}
      </section>
    `;
  }

  function renderNewsArticle(news) {
    if (!news) {
      renderNotFound();
      return;
    }

    const title = getTitle(news);
    const image = getFeaturedImage(news);
    const date = formatDate(getDate(news));
    const content = removeOfuseFromPageContent(getContent(news));

    document.title = `${title}｜みちを市ポータルサイト`;

    main.innerHTML = `
      <article class="news-article">
        <header class="page-hero">
          <p class="page-hero__eyebrow">LATEST NEWS</p>
          <h1>${escapeHtml(title)}</h1>
        </header>

        ${date ? `<p class="news-article__date">${escapeHtml(date)}</p>` : ""}

        ${
          image
            ? `
              <figure class="news-article__image">
                <img src="${escapeHtml(image)}" alt="${escapeHtml(title)}">
              </figure>
            `
            : ""
        }

        <div class="entry-content">
          ${content}
        </div>

        <p>
          <a href="#news">← ニュース一覧へ戻る</a>
        </p>
      </article>
    `;

    makeContentLinksSafe();
  }

  function renderNotFound() {
    document.title = "ページが見つかりません｜みちを市ポータルサイト";

    main.innerHTML = `
      <section class="page-article">
        <header class="page-hero">
          <p class="page-hero__eyebrow">ARYUS GATE</p>
          <h1>ページが見つかりません</h1>
        </header>

        <div class="entry-content">
          <p>指定されたページは見つかりませんでした。</p>
          <p><a href="#page/${DEFAULT_PAGE_SLUG}">注意事項へ戻る</a></p>
        </div>
      </section>
    `;
  }

  /* URLルート */

  function getRoute() {
    const hash = decodeURIComponent(location.hash.replace(/^#/, "")).trim();

    if (!hash || hash === "home") {
      return {
        type: "page",
        slug: DEFAULT_PAGE_SLUG
      };
    }

    if (hash === "news") {
      return {
        type: "news-list",
        slug: "news"
      };
    }

    if (hash.startsWith("news/")) {
      return {
        type: "news-detail",
        slug: hash.slice("news/".length)
      };
    }

    if (hash.startsWith("page/")) {
      return {
        type: "page",
        slug: hash.slice("page/".length)
      };
    }

    return {
      type: "page",
      slug: hash
    };
  }

  function renderCurrentRoute({ shouldScroll = true } = {}) {
    const route = getRoute();

    if (route.type === "news-list") {
      renderNewsList();
    } else if (route.type === "news-detail") {
      renderNewsArticle(getNewsBySlug(route.slug));
    } else {
      renderPage(getPageBySlug(route.slug));
    }

    closeDrawer();

    if (shouldScroll) {
      scrollMainToTop();
    }
  }

  window.addEventListener("hashchange", () => {
    renderCurrentRoute();
  });

  /* データ読込 */

  async function loadSiteData() {
    try {
      const response = await fetch(DATA_URL, {
        cache: "no-store"
      });

      if (!response.ok) {
        throw new Error(`データ読込失敗: ${response.status}`);
      }

      const json = await response.json();

      state.data = {
        ...json,
        pages: Array.isArray(json.pages) ? json.pages : [],
        news: Array.isArray(json.news) ? json.news : []
      };

      state.data.news.sort((a, b) => {
        return new Date(getDate(b)).getTime() - new Date(getDate(a)).getTime();
      });

      updateTicker();
      renderCurrentRoute({
        shouldScroll: false
      });
    } catch (error) {
      console.error(error);

      main.innerHTML = `
        <section class="page-article">
          <header class="page-hero">
            <p class="page-hero__eyebrow">DATA ERROR</p>
            <h1>サイトデータを読み込めません</h1>
          </header>

          <div class="entry-content">
            <p><code>data/site-data.json</code> を読み込めませんでした。</p>
          </div>
        </section>
      `;
    }
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeDrawer();
      bgmControls.hidden = true;
    }
  });

  initializeAudio();
  loadSiteData();
})();
