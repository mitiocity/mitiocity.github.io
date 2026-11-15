"use strict";

(() => {
  const IOS_GUIDE_KEY = "mitiocity-ios-install-guide-dismissed";
  const ANDROID_NOTICE_KEY = "mitiocity-android-install-notice-dismissed";

  let deferredInstallPrompt = null;
  let installButton = null;
  let installNotice = null;

  const isStandalone = () => {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true
    );
  };

  const isIOS = () => {
    return /iPad|iPhone|iPod/.test(window.navigator.userAgent) &&
      !window.MSStream;
  };

  const isAndroid = () => {
    return /Android/i.test(window.navigator.userAgent);
  };

  const escapeHtml = (value) => {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };

  const createInstallButton = () => {
    if (document.querySelector(".app-install-button")) {
      return document.querySelector(".app-install-button");
    }

    const drawerMenu = document.querySelector(".drawer-menu");

    if (!drawerMenu) {
      return null;
    }

    const section = document.createElement("section");
    section.className = "drawer-section app-install-section";
    section.innerHTML = `
      <h2>アプリとして使う</h2>
      <p class="app-install-section__text">
        ホーム画面へ追加すると、アプリのように開けます。
      </p>
      <button class="app-install-button" type="button">
        <span class="app-install-button__icon" aria-hidden="true">＋</span>
        <span class="app-install-button__label">ホーム画面に追加</span>
      </button>
    `;

    drawerMenu.appendChild(section);

    const button = section.querySelector(".app-install-button");

    button.addEventListener("click", async () => {
      if (isStandalone()) {
        return;
      }

      if (isIOS()) {
        showIOSGuide();
        return;
      }

      if (deferredInstallPrompt) {
        await showAndroidInstallPrompt();
        return;
      }

      showAndroidWaitingGuide();
    });

    return button;
  };

  const updateInstallButton = () => {
    if (isStandalone()) {
      if (installButton) {
        installButton.closest(".app-install-section")?.remove();
      }
      return;
    }

    if (!installButton) {
      installButton = createInstallButton();
    }

    if (!installButton) {
      return;
    }

    const label = installButton.querySelector(".app-install-button__label");

    if (isIOS()) {
      installButton.hidden = false;

      if (label) {
        label.textContent = "ホーム画面に追加";
      }

      return;
    }

    if (deferredInstallPrompt) {
      installButton.hidden = false;

      if (label) {
        label.textContent = "アプリとして追加";
      }

      return;
    }

    if (isAndroid()) {
      installButton.hidden = false;

      if (label) {
        label.textContent = "ホーム画面に追加";
      }

      return;
    }

    installButton.hidden = false;

    if (label) {
      label.textContent = "ホーム画面に追加";
    }
  };

  const showAndroidInstallPrompt = async () => {
    if (!deferredInstallPrompt) {
      showAndroidWaitingGuide();
      return;
    }

    const promptEvent = deferredInstallPrompt;
    deferredInstallPrompt = null;

    updateInstallButton();

    try {
      await promptEvent.prompt();

      const result = await promptEvent.userChoice;

      if (result.outcome === "accepted") {
        closeInstallNotice();
      }
    } catch (error) {
      console.warn("アプリ追加確認を開けませんでした。", error);
      showAndroidWaitingGuide();
    }
  };

  const closeInstallNotice = () => {
    if (!installNotice) {
      return;
    }

    installNotice.classList.add("is-closing");

    window.setTimeout(() => {
      installNotice?.remove();
      installNotice = null;
    }, 220);
  };

  const createNoticeBase = () => {
    closeInstallNotice();

    const wrapper = document.createElement("div");
    wrapper.className = "mitiocity-install-notice";
    wrapper.setAttribute("role", "dialog");
    wrapper.setAttribute("aria-modal", "true");

    document.body.appendChild(wrapper);

    installNotice = wrapper;

    wrapper.addEventListener("click", (event) => {
      if (event.target === wrapper) {
        closeInstallNotice();
      }
    });

    return wrapper;
  };

  const showIOSGuide = () => {
    const modal = createNoticeBase();

    modal.innerHTML = `
      <div class="mitiocity-install-notice__panel">
        <button class="mitiocity-install-notice__close" type="button" aria-label="閉じる">
          ×
        </button>

        <p class="mitiocity-install-notice__eyebrow">ARYUS GATE APP</p>
        <h2>ホーム画面に追加</h2>

        <p class="mitiocity-install-notice__lead">
          iPhoneでは、Safariの共有メニューから追加します。
        </p>

        <ol class="mitiocity-install-steps">
          <li>
            画面下部の
            <strong class="mitiocity-share-icon" aria-label="共有ボタン">□↑</strong>
            <strong>共有ボタン</strong>を押す
          </li>
          <li>
            一覧を下へスクロールする
          </li>
          <li>
            <strong>「ホーム画面に追加」</strong>を押す
          </li>
          <li>
            右上の<strong>「追加」</strong>を押す
          </li>
        </ol>

        <p class="mitiocity-install-notice__note">
          追加後は、ホーム画面のアイコンからアプリのように起動できます。
        </p>

        <button class="mitiocity-install-notice__ok" type="button">
          わかった
        </button>
      </div>
    `;

    modal
      .querySelector(".mitiocity-install-notice__close")
      .addEventListener("click", closeInstallNotice);

    modal
      .querySelector(".mitiocity-install-notice__ok")
      .addEventListener("click", () => {
        sessionStorage.setItem(IOS_GUIDE_KEY, "1");
        closeInstallNotice();
      });
  };

  const showAndroidWaitingGuide = () => {
    const modal = createNoticeBase();

    modal.innerHTML = `
      <div class="mitiocity-install-notice__panel">
        <button class="mitiocity-install-notice__close" type="button" aria-label="閉じる">
          ×
        </button>

        <p class="mitiocity-install-notice__eyebrow">ARYUS GATE APP</p>
        <h2>ホーム画面に追加</h2>

        <p class="mitiocity-install-notice__lead">
          この端末では、ブラウザのメニューから追加できます。
        </p>

        <ol class="mitiocity-install-steps">
          <li>
            ブラウザ右上の<strong>「︙」</strong>を押す
          </li>
          <li>
            <strong>「アプリをインストール」</strong>または<br>
            <strong>「ホーム画面に追加」</strong>を押す
          </li>
          <li>
            表示された確認画面で<strong>「インストール」</strong>を押す
          </li>
        </ol>

        <p class="mitiocity-install-notice__note">
          ブラウザや端末の状態により、項目名が少し異なる場合があります。
        </p>

        <button class="mitiocity-install-notice__ok" type="button">
          わかった
        </button>
      </div>
    `;

    modal
      .querySelector(".mitiocity-install-notice__close")
      .addEventListener("click", closeInstallNotice);

    modal
      .querySelector(".mitiocity-install-notice__ok")
      .addEventListener("click", () => {
        sessionStorage.setItem(ANDROID_NOTICE_KEY, "1");
        closeInstallNotice();
      });
  };

  const injectStyles = () => {
    if (document.querySelector("#mitiocity-install-style")) {
      return;
    }

    const style = document.createElement("style");
    style.id = "mitiocity-install-style";

    style.textContent = `
      .app-install-section {
        margin-top: 18px;
        padding-top: 18px;
        border-top: 1px solid rgba(255, 230, 174, .22);
      }

      .app-install-section__text {
        margin: 0 0 12px;
        color: rgba(255, 250, 240, .78);
        font-size: .82rem;
        line-height: 1.65;
      }

      .app-install-button {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 9px;
        width: 100%;
        min-height: 52px;
        padding: 12px 14px;
        border: 1px solid rgba(255, 230, 174, .82);
        border-radius: 12px;
        background:
          linear-gradient(135deg, rgba(216, 175, 99, .95), rgba(111, 76, 24, .95));
        box-shadow:
          0 8px 20px rgba(0, 0, 0, .24),
          inset 0 1px 0 rgba(255, 255, 255, .3);
        color: #171108;
        cursor: pointer;
        font: inherit;
        font-weight: 800;
        letter-spacing: .06em;
        text-align: center;
        transition: transform .16s ease, filter .16s ease;
      }

      .app-install-button:active {
        filter: brightness(.9);
        transform: translateY(1px) scale(.985);
      }

      .app-install-button:focus-visible {
        outline: 3px solid #ffffff;
        outline-offset: 3px;
      }

      .app-install-button__icon {
        display: grid;
        width: 24px;
        height: 24px;
        place-items: center;
        border: 1px solid rgba(23, 17, 8, .54);
        border-radius: 50%;
        font-size: 1.15rem;
        line-height: 1;
      }

      .mitiocity-install-notice {
        position: fixed;
        z-index: 999999;
        inset: 0;
        display: grid;
        place-items: center;
        padding: 18px;
        background: rgba(0, 0, 0, .78);
        backdrop-filter: blur(7px);
        animation: mitiocity-install-fade-in .2s ease both;
      }

      .mitiocity-install-notice.is-closing {
        animation: mitiocity-install-fade-out .22s ease both;
      }

      .mitiocity-install-notice__panel {
        position: relative;
        width: min(100%, 410px);
        padding: 30px 22px 22px;
        overflow: hidden;
        border: 1px solid rgba(255, 230, 174, .62);
        border-radius: 20px;
        background:
          radial-gradient(circle at 50% 0%, rgba(55, 83, 154, .5), transparent 48%),
          linear-gradient(155deg, #172142, #070914 68%);
        box-shadow:
          0 25px 80px rgba(0, 0, 0, .72),
          inset 0 1px 0 rgba(255, 255, 255, .11);
        color: #fffaf0;
      }

      .mitiocity-install-notice__panel::before {
        position: absolute;
        inset: 8px;
        border: 1px solid rgba(216, 175, 99, .24);
        border-radius: 14px;
        content: "";
        pointer-events: none;
      }

      .mitiocity-install-notice__panel > * {
        position: relative;
        z-index: 1;
      }

      .mitiocity-install-notice__close {
        position: absolute;
        top: 12px;
        right: 12px;
        display: grid;
        width: 38px;
        height: 38px;
        place-items: center;
        border: 1px solid rgba(255, 230, 174, .45);
        border-radius: 50%;
        background: rgba(0, 0, 0, .28);
        color: #fffaf0;
        cursor: pointer;
        font-size: 1.5rem;
        line-height: 1;
      }

      .mitiocity-install-notice__eyebrow {
        margin: 0 0 8px;
        color: #ffe6ae;
        font-size: .72rem;
        font-weight: 800;
        letter-spacing: .18em;
        text-align: center;
      }

      .mitiocity-install-notice h2 {
        margin: 0;
        color: #fffaf0;
        font-size: 1.38rem;
        text-align: center;
      }

      .mitiocity-install-notice__lead {
        margin: 18px 0;
        color: rgba(255, 250, 240, .88);
        font-size: .94rem;
        line-height: 1.75;
        text-align: center;
      }

      .mitiocity-install-steps {
        display: grid;
        gap: 10px;
        margin: 0;
        padding: 0;
        list-style: none;
        counter-reset: mitiocity-step;
      }

      .mitiocity-install-steps li {
        position: relative;
        min-height: 52px;
        padding: 14px 12px 14px 48px;
        border: 1px solid rgba(255, 230, 174, .18);
        border-radius: 12px;
        background: rgba(0, 0, 0, .22);
        color: rgba(255, 250, 240, .94);
        font-size: .9rem;
        line-height: 1.6;
      }

      .mitiocity-install-steps li::before {
        position: absolute;
        top: 50%;
        left: 12px;
        display: grid;
        width: 25px;
        height: 25px;
        place-items: center;
        border-radius: 50%;
        background: #d8af63;
        color: #171108;
        content: counter(mitiocity-step);
        counter-increment: mitiocity-step;
        font-size: .78rem;
        font-weight: 900;
        transform: translateY(-50%);
      }

      .mitiocity-share-icon {
        display: inline-grid;
        width: 28px;
        height: 28px;
        place-items: center;
        border: 1px solid rgba(255, 230, 174, .68);
        border-radius: 7px;
        color: #ffe6ae;
        font-size: .92rem;
      }

      .mitiocity-install-notice__note {
        margin: 16px 0;
        color: rgba(255, 250, 240, .67);
        font-size: .78rem;
        line-height: 1.65;
      }

      .mitiocity-install-notice__ok {
        width: 100%;
        min-height: 50px;
        border: 0;
        border-radius: 12px;
        background: linear-gradient(135deg, #f3d28e, #b77c30);
        color: #171108;
        cursor: pointer;
        font: inherit;
        font-weight: 900;
        letter-spacing: .08em;
      }

      @keyframes mitiocity-install-fade-in {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      @keyframes mitiocity-install-fade-out {
        from { opacity: 1; }
        to { opacity: 0; }
      }
    `;

    document.head.appendChild(style);
  };

  const initialize = () => {
    if (isStandalone()) {
      return;
    }

    injectStyles();
    installButton = createInstallButton();
    updateInstallButton();

    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      deferredInstallPrompt = event;
      updateInstallButton();
    });

    window.addEventListener("appinstalled", () => {
      deferredInstallPrompt = null;
      closeInstallNotice();

      if (installButton) {
        installButton.closest(".app-install-section")?.remove();
      }
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
