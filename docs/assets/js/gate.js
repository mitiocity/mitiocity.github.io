"use strict";

(() => {
  const GATE_DURATION = 2000;
  const APP_HANDOFF_CLOSE_DELAY = 1300;

  function isExternalLink(link) {
    const href = link.getAttribute("href") || "";

    if (
      !href ||
      href.startsWith("#") ||
      href.startsWith("mailto:") ||
      href.startsWith("tel:") ||
      link.hasAttribute("download")
    ) {
      return false;
    }

    /*
      OFUSEは公式ウィジェットに任せる。
      アリウスゲート演出の対象にしない。
    */
    if (
      link.matches("[data-ofuse-widget-button]") ||
      href.includes("ofuse.me")
    ) {
      return false;
    }

    try {
      const url = new URL(href, window.location.href);

      return (
        (url.protocol === "http:" || url.protocol === "https:") &&
        url.origin !== window.location.origin
      );
    } catch {
      return false;
    }
  }

  function escapeForHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function openAriusGate(destinationUrl) {
    /*
      タップと同時に新規タブを作る。
      iPhone／iPad／Chromeのポップアップ制限を避ける。
    */
    const gateWindow = window.open("", "_blank");

    if (!gateWindow) {
      window.location.href = destinationUrl;
      return;
    }

    const gateImageUrl = new URL(
      "assets/images/arius-gate.png",
      window.location.href
    ).href;

    const safeDestination = escapeForHtml(destinationUrl);
    const safeGateImage = escapeForHtml(gateImageUrl);

    gateWindow.document.open();

    gateWindow.document.write(`
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#000000">
  <title> </title>

  <style>
    :root {
      color-scheme: dark;
    }

    * {
      box-sizing: border-box;
    }

    html,
    body {
      width: 100%;
      min-height: 100%;
      margin: 0;
      overflow: hidden;
      background: #000;
    }

    body {
      min-height: 100svh;
    }

    /*
      装飾を足さず、黒い空間と扉そのものだけを見せる。
    */
    .scene {
      position: relative;
      width: 100%;
      min-height: 100svh;
      overflow: hidden;
      background:
        radial-gradient(
          ellipse at 50% 52%,
          rgba(33, 46, 90, 0.32) 0%,
          rgba(4, 6, 15, 0.62) 38%,
          #000 76%
        );
    }

    /*
      扉の奥。
      扉が開くまでほぼ見えず、
      開いた後だけ白い光が増す。
    */
    .beyond {
      position: absolute;
      top: 50%;
      left: 50%;
      width: min(58vw, 290px);
      aspect-ratio: 0.74;
      opacity: 0;
      background:
        radial-gradient(
          ellipse at 50% 50%,
          #ffffff 0%,
          #f7f2dc 14%,
          rgba(202, 220, 255, 0.78) 38%,
          rgba(75, 108, 188, 0.25) 62%,
          transparent 76%
        );
      filter: blur(2px);
      transform: translate(-50%, -50%) scale(0.58);
      animation: beyond-light 2s cubic-bezier(.2, .72, .26, 1) forwards;
    }

    /*
      扉画像。
      金枠、文字、星、追加装飾は使わない。
    */
    .gate {
      position: absolute;
      top: 50%;
      left: 50%;
      width: min(78vw, 420px);
      aspect-ratio: 0.72;
      transform: translate(-50%, -50%) scale(0.72);
      transform-style: preserve-3d;
      filter:
        drop-shadow(0 22px 32px rgba(0, 0, 0, 0.9))
        drop-shadow(0 0 11px rgba(190, 210, 255, 0.08));
      animation: camera-forward 2s cubic-bezier(.21, .78, .24, 1) forwards;
    }

    .door {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 50%;
      overflow: hidden;
      backface-visibility: hidden;
      will-change: transform;
    }

    .door--left {
      left: 0;
      transform-origin: left center;
      animation:
        left-door-open 0.78s cubic-bezier(.18, .74, .2, 1) 0.62s forwards,
        left-door-weight 0.16s ease-in-out 1.38s 2 alternate;
    }

    .door--right {
      right: 0;
      transform-origin: right center;
      animation:
        right-door-open 0.78s cubic-bezier(.18, .74, .2, 1) 0.62s forwards,
        right-door-weight 0.16s ease-in-out 1.38s 2 alternate;
    }

    /*
      左右の各半分に、同じ扉画像の対応する半分を表示する。
    */
    .door img {
      position: absolute;
      top: 0;
      display: block;
      width: 200%;
      max-width: none;
      height: 100%;
      object-fit: fill;
      user-select: none;
      -webkit-user-drag: none;
    }

    .door--left img {
      left: 0;
    }

    .door--right img {
      right: 0;
    }

    /*
      扉の中央の隙間から出る細い光。
    */
    .seam {
      position: absolute;
      z-index: 5;
      top: 7%;
      bottom: 7%;
      left: 50%;
      width: 1px;
      opacity: 0;
      background: rgba(255, 255, 255, 0.95);
      box-shadow:
        0 0 5px rgba(255, 255, 255, 0.92),
        0 0 20px rgba(211, 226, 255, 0.82);
      transform: translateX(-50%);
      animation: seam-light 2s ease-out forwards;
    }

    /*
      最後だけ光へ溶ける。
      画面全体をずっと白くせず、移動直前にだけ使う。
    */
    .end-light {
      position: absolute;
      inset: 0;
      opacity: 0;
      pointer-events: none;
      background:
        radial-gradient(
          circle at 50% 50%,
          rgba(255, 255, 255, 0.98) 0%,
          rgba(241, 245, 255, 0.78) 30%,
          rgba(214, 225, 255, 0.18) 58%,
          transparent 80%
        );
      animation: end-light 2s ease-out forwards;
    }

    @keyframes camera-forward {
      0% {
        opacity: 0;
        transform: translate(-50%, -50%) scale(0.57);
      }

      14% {
        opacity: 1;
      }

      48% {
        transform: translate(-50%, -50%) scale(0.9);
      }

      73% {
        transform: translate(-50%, -50%) scale(1.06);
      }

      100% {
        opacity: 0;
        transform: translate(-50%, -50%) scale(3.85);
      }
    }

    @keyframes left-door-open {
      0% {
        transform: perspective(900px) rotateY(0deg);
      }

      100% {
        transform: perspective(900px) rotateY(-79deg);
      }
    }

    @keyframes right-door-open {
      0% {
        transform: perspective(900px) rotateY(0deg);
      }

      100% {
        transform: perspective(900px) rotateY(79deg);
      }
    }

    @keyframes left-door-weight {
      from {
        margin-left: 0;
      }

      to {
        margin-left: -4px;
      }
    }

    @keyframes right-door-weight {
      from {
        margin-right: 0;
      }

      to {
        margin-right: -4px;
      }
    }

    @keyframes seam-light {
      0%,
      42% {
        opacity: 0;
      }

      55% {
        opacity: 1;
      }

      75% {
        opacity: 0;
      }

      100% {
        opacity: 0;
      }
    }

    @keyframes beyond-light {
      0%,
      45% {
        opacity: 0;
        transform: translate(-50%, -50%) scale(0.58);
      }

      71% {
        opacity: 0.98;
        transform: translate(-50%, -50%) scale(1.16);
      }

      100% {
        opacity: 1;
        transform: translate(-50%, -50%) scale(5.2);
      }
    }

    @keyframes end-light {
      0%,
      76% {
        opacity: 0;
      }

      100% {
        opacity: 1;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .beyond,
      .gate,
      .door--left,
      .door--right,
      .seam,
      .end-light {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
      }
    }
  </style>
</head>

<body>
  <main class="scene">
    <div class="beyond" aria-hidden="true"></div>

    <div class="gate" aria-hidden="true">
      <div class="door door--left">
        <img src="${safeGateImage}" alt="">
      </div>

      <div class="door door--right">
        <img src="${safeGateImage}" alt="">
      </div>

      <div class="seam"></div>
    </div>

    <div class="end-light" aria-hidden="true"></div>
  </main>

  <script>
    window.setTimeout(function () {
      window.location.replace("${safeDestination}");

      /*
        YouTubeなどでアプリに渡った場合だけ、
        演出用タブが残るため閉じる。
      */
      window.setTimeout(function () {
        window.close();
      }, ${APP_HANDOFF_CLOSE_DELAY});
    }, ${GATE_DURATION});
  <\/script>
</body>
</html>
    `);

    gateWindow.document.close();
  }

  document.addEventListener(
    "click",
    (event) => {
      const link = event.target.closest("a[href]");

      if (!link || !isExternalLink(link)) {
        return;
      }

      event.preventDefault();
      openAriusGate(link.href);
    },
    true
  );
})();
