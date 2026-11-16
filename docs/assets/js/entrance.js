"use strict";

(() => {
  /*
    v3に変更。
    修正版を保存後、同じブラウザでも入口画面を確認できるようにする。
  */
  const SESSION_KEY = "mitiocity-entrance-viewed-v3";
  const VIDEO_PATH = "assets/video/entrance.mp4";

  try {
    if (sessionStorage.getItem(SESSION_KEY) === "true") {
      return;
    }
  } catch (error) {
    console.warn("入口画面の保存状態を確認できませんでした。", error);
  }

  function finishEntrance(entrance) {
    entrance.classList.add("is-closing");

    window.setTimeout(() => {
      entrance.remove();

      try {
        sessionStorage.setItem(SESSION_KEY, "true");
      } catch (error) {
        console.warn("入口画面の状態を保存できませんでした。", error);
      }
    }, 550);
  }

  function createEntrance() {
    const entrance = document.createElement("section");

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

        <p class="mitiocity-entrance__error" id="entrance-error" hidden>
          動画を再生できませんでした。<br>
          もう一度「アリウスゲートへ入る」を押してください。
        </p>
      </div>
    `;

    const style = document.createElement("style");

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
        transition: opacity 0.55s ease;
      }

      .mitiocity-entrance.is-closing {
        pointer-events: none;
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

      /*
        入口動画の表示領域。
        flexで中央へ置き、背景は黒にする。
      */
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

      /*
        重要：
        横幅だけを画面幅に合わせ、高さは動画本来の比率で自動計算。
        height: 100% や object-fit: cover は使用しない。
        これで横長動画の上下・左右が切れない。
      */
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
        position: absolute;
        right: 18px;
        bottom: 22px;
        left: 18px;
        margin: 0;
        padding: 11px;
        color: #fffaf0;
        font-size: 0.8rem;
        text-align: center;
        border: 1px solid rgba(255, 230, 174, 0.57);
        border-radius: 10px;
        background: rgba(0, 0, 0, 0.76);
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

      video.play().catch((error) => {
        console.warn("入口動画を再生できませんでした。", error);

        movie.hidden = true;
        welcome.hidden = false;
        errorMessage.hidden = false;
      });
    });

    video.addEventListener(
      "ended",
      () => {
        finishEntrance(entrance);
      },
      { once: true }
    );

    video.addEventListener("error", () => {
      movie.hidden = true;
      welcome.hidden = false;
      errorMessage.hidden = false;
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
