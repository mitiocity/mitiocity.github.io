"use strict";

(() => {
  /*
    v4:
    iPhoneのホーム画面Webアプリで、入口動画終了後に
    透明な入口レイヤーがタップを奪い続ける問題を修正する。
  */
  const SESSION_KEY = "mitiocity-entrance-viewed-v4";
  const VIDEO_PATH = "assets/video/entrance.mp4";

  try {
    if (sessionStorage.getItem(SESSION_KEY) === "true") {
      return;
    }
  } catch (error) {
    console.warn("入口画面の保存状態を確認できませんでした。", error);
  }

  function createEntrance() {
    let hasFinished = false;
    let watchTimer = null;

    const entrance = document.createElement("section");
    const style = document.createElement("style");

    entrance.className = "mitiocity-entrance";
    entrance.setAttribute("aria-label", "みちを市ポータルサイト入口");

    entrance.innerHTML = `
      <div class="mitiocity-entrance__stars" aria-hidden="true"></div>

      <div class="mitiocity-entrance__welcome">
        <p class="mitiocity-entrance__eyebrow">ARYUS GATE</p>

        <h1 class="mitiocity-entrance__title">
          <span>みちを市</span>
          <span>ポータルサイト</span>
        </h1>

        <p class="mitiocity-entrance__lead">
          異世界への扉、アリウスゲートへようこそ。
        </p>

        <button
          class="mitiocity-entrance__button"
          type="button"
          id="entrance-start-button"
        >
          アリウスゲートへ入る
        </button>

        <p
          class="mitiocity-entrance__error"
          id="entrance-error"
          hidden
        >
          動画を再生できませんでした。<br>
          もう一度「アリウスゲートへ入る」を押してください。
        </p>
      </div>

      <div class="mitiocity-entrance__movie" hidden>
        <video
          class="mitiocity-entrance__video"
          id="entrance-video"
          playsinline
          preload="auto"
        >
          <source src="${VIDEO_PATH}" type="video/mp4">
          お使いのブラウザは動画再生に対応していません。
        </video>
      </div>
    `;

    style.textContent = `
      .mitiocity-entrance {
        position: fixed;
        z-index: 100000;
        inset: 0;
        display: grid;
        min-height: 100svh;
        overflow: hidden;
        place-items: center;
        color: #fffaf0;
        background:
          radial-gradient(circle at 50% 20%, rgba(87, 121, 214, 0.48), transparent 28%),
          radial-gradient(circle at 12% 79%, rgba(185, 143, 64, 0.17), transparent 28%),
          linear-gradient(155deg, #121f45 0%, #070914 49%, #02030a 100%);
        opacity: 1;
        transition: opacity 0.24s ease;
      }

      /*
        終了後は、透明化より先にタップを完全に通す。
        これがiPhoneのホーム画面起動時の操作不能対策。
      */
      .mitiocity-entrance.is-closing {
        pointer-events: none !important;
        opacity: 0;
      }

      .mitiocity-entrance__stars {
        position: absolute;
        inset: -20%;
        pointer-events: none;
        opacity: 0.82;
        background-image:
          radial-gradient(circle, rgba(255, 248, 215, 0.96) 0 1px, transparent 1.6px),
          radial-gradient(circle, rgba(157, 185, 255, 0.8) 0 1px, transparent 1.7px),
          radial-gradient(circle, rgba(255, 229, 167, 0.7) 0 1px, transparent 1.7px);
        background-position: 0 0, 34px 51px, 92px 13px;
        background-size: 137px 151px, 191px 173px, 239px 221px;
        animation: entrance-stars 16s linear infinite;
      }

      .mitiocity-entrance__welcome {
        position: relative;
        z-index: 1;
        width: min(calc(100% - 40px), 430px);
        padding: 42px 24px 36px;
        text-align: center;
        border: 1px solid rgba(255, 229, 174, 0.68);
        border-radius: 26px;
        background:
          radial-gradient(circle at 50% 0%, rgba(255, 228, 157, 0.2), transparent 39%),
          rgba(5, 7, 20, 0.76);
        box-shadow:
          0 0 0 9px rgba(255, 229, 174, 0.045),
          0 23px 55px rgba(0, 0, 0, 0.57);
      }

      .mitiocity-entrance__welcome::before {
        position: absolute;
        top: -60px;
        left: 50%;
        width: 146px;
        height: 132px;
        content: "";
        border: 2px solid rgba(255, 229, 174, 0.55);
        border-bottom: 0;
        border-radius: 76px 76px 0 0;
        transform: translateX(-50%);
      }

      .mitiocity-entrance__eyebrow {
        position: relative;
        margin: 0 0 13px;
        color: #ffe6ae;
        font-size: 0.73rem;
        font-weight: 900;
        letter-spacing: 0.2em;
      }

      .mitiocity-entrance__title {
        display: flex;
        width: 100%;
        flex-direction: column;
        align-items: center;
        margin: 0;
        color: #fffaf0;
        font-size: clamp(1.7rem, 9vw, 2.55rem);
        line-height: 1.3;
        letter-spacing: 0.08em;
        text-align: center;
        text-shadow: 0 0 18px rgba(255, 233, 178, 0.34);
      }

      .mitiocity-entrance__title span {
        display: block;
        width: 100%;
        text-align: center;
        white-space: nowrap;
      }

      .mitiocity-entrance__lead {
        margin: 21px 0 27px;
        color: rgba(255, 250, 240, 0.85);
        font-size: 0.83rem;
        line-height: 1.8;
      }

      .mitiocity-entrance__button {
        width: min(100%, 300px);
        min-height: 59px;
        padding: 12px 18px;
        color: #261803;
        font-size: 1rem;
        font-weight: 900;
        letter-spacing: 0.04em;
        cursor: pointer;
        border: 1px solid #fff0c8;
        border-radius: 999px;
        background: linear-gradient(135deg, #ffeab5, #d5a94f);
        box-shadow: 0 7px 20px rgba(0, 0, 0, 0.4);
      }

      .mitiocity-entrance__button:active {
        transform: scale(0.97);
      }

      .mitiocity-entrance__movie {
        position: absolute;
        z-index: 3;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        background: #000;
      }

      .mitiocity-entrance__movie[hidden] {
        display: none;
      }

      .mitiocity-entrance__video {
        display: block;
        width: 100vw;
        max-width: 100%;
        height: auto;
        max-height: 100svh;
        margin: auto;
        background: #000;
      }

      .mitiocity-entrance__error {
        position: relative;
        z-index: 1;
        margin: 18px 0 0;
        padding: 11px;
        color: #fffaf0;
        font-size: 0.8rem;
        line-height: 1.7;
        text-align: center;
        border: 1px solid rgba(255, 230, 174, 0.57);
        border-radius: 10px;
        background: rgba(0, 0, 0, 0.46);
      }

      @keyframes entrance-stars {
        from {
          transform: translate3d(0, 0, 0);
        }

        to {
          transform: translate3d(-38px, 45px, 0);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .mitiocity-entrance__stars {
          animation: none;
        }

        .mitiocity-entrance,
        .mitiocity-entrance.is-closing {
          transition: none;
        }
      }
    `;

    document.head.appendChild(style);
    document.body.appendChild(entrance);

    const welcome = entrance.querySelector(".mitiocity-entrance__welcome");
    const movie = entrance.querySelector(".mitiocity-entrance__movie");
    const video = entrance.querySelector("#entrance-video");
    const button = entrance.querySelector("#entrance-start-button");
    const errorMessage = entrance.querySelector("#entrance-error");

    function clearWatchTimer() {
      if (watchTimer !== null) {
        window.clearInterval(watchTimer);
        watchTimer = null;
      }
    }

    function finishEntrance() {
      if (hasFinished) {
        return;
      }

      hasFinished = true;
      clearWatchTimer();

      /*
        最重要：
        先にタップを通し、入口動画レイヤーを操作不能にする。
      */
      entrance.style.pointerEvents = "none";
      entrance.setAttribute("aria-hidden", "true");

      movie.hidden = true;
      entrance.classList.add("is-closing");

      try {
        video.pause();
      } catch (error) {
        console.warn("入口動画の停止処理を完了できませんでした。", error);
      }

      try {
        sessionStorage.setItem(SESSION_KEY, "true");
      } catch (error) {
        console.warn("入口画面の状態を保存できませんでした。", error);
      }

      /*
        フェード表示後、DOM・CSSとも完全削除する。
        透明な固定レイヤーを残さない。
      */
      window.setTimeout(() => {
        entrance.remove();
        style.remove();
      }, 260);
    }

    function showPlaybackError(error) {
      clearWatchTimer();

      console.warn("入口動画を再生できませんでした。", error);

      movie.hidden = true;
      welcome.hidden = false;
      errorMessage.hidden = false;
    }

    function startCompletionWatch() {
      clearWatchTimer();

      /*
        iPhone側で ended が発火しなかった場合にも、
        動画の再生位置で終了を判定する。
      */
      watchTimer = window.setInterval(() => {
        const duration = video.duration;
        const currentTime = video.currentTime;

        if (video.ended) {
          finishEntrance();
          return;
        }

        if (
          Number.isFinite(duration) &&
          duration > 0 &&
          currentTime >= duration - 0.15
        ) {
          finishEntrance();
        }
      }, 160);
    }

    video.muted = false;
    video.defaultMuted = false;
    video.volume = 1;

    button.addEventListener("click", () => {
      errorMessage.hidden = true;
      welcome.hidden = true;
      movie.hidden = false;

      video.muted = false;
      video.defaultMuted = false;
      video.volume = 1;
      video.currentTime = 0;

      video
        .play()
        .then(() => {
          startCompletionWatch();
        })
        .catch((error) => {
          showPlaybackError(error);
        });
    });

    video.addEventListener("ended", finishEntrance, { once: true });

    /*
      iPhone Safari/Web App用の保険。
      動画終了時のWebKit独自イベントでも入口を終了する。
    */
    video.addEventListener("webkitendfullscreen", finishEntrance, {
      once: true
    });

    video.addEventListener("pause", () => {
      const duration = video.duration;

      if (
        Number.isFinite(duration) &&
        duration > 0 &&
        video.currentTime >= duration - 0.15
      ) {
        finishEntrance();
      }
    });

    video.addEventListener("error", () => {
      showPlaybackError(new Error("動画ファイルを読み込めませんでした。"));
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", createEntrance, {
      once: true
    });
  } else {
    createEntrance();
  }
})();
