"use strict";

/* =========================================================
   とーたるえいと❣️
   ゲーム調整用の定数
========================================================= */

const CONFIG = {
  rows: 4,
  cols: 8,

  baseClearScore: 100,
  simultaneousBonus: 80,
  levelScoreStep: 900,

  feverDuration: 8000,
  feverMultiplier: 2,

  clearDelay: 260,
  levelPreviewDelay: 900,

  rankingKey: "total-eight-local-ranking-v1",

  // 後から、この名前でMP3を置けば自動的に読み込む。
  // 例：assets/audio/bgm/level-1.mp3
  bgmPath(level) {
    return `assets/audio/bgm/level-${level}.mp3`;
  },

  // 例：assets/audio/tutorial/tutorial-01.mp3
  tutorialVoicePath(step) {
    return `assets/audio/tutorial/tutorial-${String(step).padStart(2, "0")}.mp3`;
  }
};

const ORB_COLORS = 4;

const TUTORIAL_STEPS = [
  "ようこそ、とーたるえいと❣️へ。オーブとリングの数字を足して、合計8を作ろう。",
  "左にある球体がオーブ。オーブ自身の数字も、合計に入るぞ。",
  "右から来る輪っかがリング。置きたいレーンをタップして、オーブへつなげよう。",
  "オーブとつながったリングは、オーブと同じ色になる。",
  "合計が5になると緑色に変化する。6、7と近づくほど、強く点滅するぞ。",
  "合計がちょうど8になると、オーブとつながったリングが消える。",
  "8を超えると、新しいリングだけが消えて、オーバーゲージがたまる。ゲージが3つたまると連鎖の力が下がる。",
  "複数のオーブを7まで育てて、まとめて8にしよう。連鎖と同時消去で高得点を狙え！"
];

/* =========================================================
   DOM
========================================================= */

const $ = (selector) => document.querySelector(selector);

const screens = {
  title: $("#title-screen"),
  game: $("#game-screen"),
  tutorial: $("#tutorial-screen"),
  ranking: $("#ranking-screen")
};

const elements = {
  gameBoard: $("#game-board"),
  tutorialBoard: $("#tutorial-board"),

  score: $("#score-value"),
  level: $("#level-value"),
  overGauge: $("#over-gauge"),
  combo: $("#combo-label"),
  fever: $("#fever-label"),

  nextRing: $("#next-ring"),
  nextRingNumber: $("#next-ring-number"),

  tutorialStepLabel: $("#tutorial-step-label"),
  tutorialText: $("#tutorial-text"),
  tutorialNextButton: $("#tutorial-next-button"),

  rankingList: $("#ranking-list"),

  tutorialExitModal: $("#tutorial-exit-modal"),
  tutorialCompleteModal: $("#tutorial-complete-modal"),
  gameOverModal: $("#game-over-modal"),
  finalScore: $("#final-score-value")
};

/* =========================================================
   ゲーム状態
========================================================= */

let state = null;
let pieceId = 0;
let tutorialStep = 0;
let tutorialVoice = null;

let audioContext = null;
let currentBgm = null;

/* =========================================================
   画面表示
========================================================= */

function showScreen(name) {
  Object.values(screens).forEach((screen) => {
    screen.classList.remove("is-active");
  });

  screens[name].classList.add("is-active");
}

function openModal(modal) {
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
}

function closeModal(modal) {
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
}

function closeAllModals() {
  closeModal(elements.tutorialExitModal);
  closeModal(elements.tutorialCompleteModal);
  closeModal(elements.gameOverModal);
}

/* =========================================================
   基本ユーティリティ
========================================================= */

function randomNumber() {
  return Math.floor(Math.random() * 4) + 1;
}

function randomColor() {
  return Math.floor(Math.random() * ORB_COLORS);
}

function wait(milliseconds) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

function createPiece(type, number, color = null) {
  pieceId += 1;

  return {
    id: pieceId,
    type,
    number,
    color
  };
}

function createEmptyBoard() {
  return Array.from(
    { length: CONFIG.rows },
    () => Array(CONFIG.cols).fill(null)
  );
}

/* =========================================================
   音
========================================================= */

function getAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }

  if (audioContext.state === "suspended") {
    audioContext.resume();
  }

  return audioContext;
}

function playTone(frequency, startAfter = 0, duration = 0.11, volume = 0.075) {
  try {
    const context = getAudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = "sine";
    oscillator.frequency.value = frequency;

    gain.gain.setValueAtTime(0.0001, context.currentTime + startAfter);
    gain.gain.exponentialRampToValueAtTime(
      volume,
      context.currentTime + startAfter + 0.015
    );
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      context.currentTime + startAfter + duration
    );

    oscillator.connect(gain);
    gain.connect(context.destination);

    oscillator.start(context.currentTime + startAfter);
    oscillator.stop(context.currentTime + startAfter + duration + 0.02);
  } catch (error) {
    // 音を再生できない環境でもゲーム本体は止めない。
  }
}

function playClearSound(chain) {
  const cMajor = [
    261.63,
    293.66,
    329.63,
    349.23,
    392.0,
    440.0,
    493.88,
    523.25
  ];

  // レベルごとに全音上へ転調する。
  const transposeSemitones = (state.level - 1) * 2;
  const transpose = 2 ** (transposeSemitones / 12);

  // 連鎖が増えるほど高速にする。
  const speed =
    chain === 1 ? 0.1 :
    chain === 2 ? 0.075 :
    0.052;

  cMajor.forEach((note, index) => {
    playTone(note * transpose, index * speed, speed * 1.12, 0.055);
  });
}

function playTutorialVoice(step) {
  stopTutorialVoice();

  tutorialVoice = new Audio(CONFIG.tutorialVoicePath(step));
  tutorialVoice.volume = 0.9;

  tutorialVoice.play().catch(() => {
    // まだ音声ファイルを置いていない段階では無音で進める。
  });
}

function stopTutorialVoice() {
  if (!tutorialVoice) return;

  tutorialVoice.pause();
  tutorialVoice.currentTime = 0;
  tutorialVoice = null;
}

/*
  BGMファイルを入れた後に働くクロスフェード処理。
  assets/audio/bgm/level-1.mp3
  assets/audio/bgm/level-2.mp3
  のように配置する。
*/
function changeBgm(level) {
  const nextBgm = new Audio(CONFIG.bgmPath(level));

  nextBgm.loop = true;
  nextBgm.volume = 0;

  nextBgm.play().then(() => {
    const fadeDuration = 900;
    const steps = 18;
    const stepDuration = fadeDuration / steps;

    let step = 0;

    const timer = window.setInterval(() => {
      step += 1;

      const ratio = step / steps;
      nextBgm.volume = Math.min(0.42, ratio * 0.42);

      if (currentBgm) {
        currentBgm.volume = Math.max(0, 0.42 * (1 - ratio));
      }

      if (step >= steps) {
        window.clearInterval(timer);

        if (currentBgm) {
          currentBgm.pause();
          currentBgm.currentTime = 0;
        }

        currentBgm = nextBgm;
      }
    }, stepDuration);
  }).catch(() => {
    // BGMファイルをまだ置いていない場合は何もしない。
  });
}

function stopBgm() {
  if (!currentBgm) return;

  currentBgm.pause();
  currentBgm.currentTime = 0;
  currentBgm = null;
}

/* =========================================================
   ゲーム開始・盤面生成
========================================================= */

function newGameState() {
  return {
    board: createEmptyBoard(),

    score: 0,
    level: 1,
    nextLevelScore: CONFIG.levelScoreStep,

    overGauge: 0,
    chainPower: 1,

    feverUntil: 0,
    orbAreaCols: 1,

    nextRing: randomNumber(),

    isBusy: false,
    isGameOver: false,
    isExpanding: false
  };
}

function placeInitialOrbs() {
  for (let row = 0; row < CONFIG.rows; row += 1) {
    state.board[row][0] = createPiece(
      "orb",
      randomNumber(),
      randomColor()
    );
  }
}

function startGame() {
  closeAllModals();
  stopTutorialVoice();
  showScreen("game");

  state = newGameState();
  placeInitialOrbs();

  changeBgm(state.level);
  renderGame();
}

function returnToTitle() {
  stopTutorialVoice();
  stopBgm();
  closeAllModals();
  showScreen("title");
}

/* =========================================================
   盤面計算
========================================================= */

/*
  オーブの右に、途切れずに接続しているリングを取得する。
  オーブの数字も合計値に含める。
*/
function getGroups() {
  const groups = [];

  for (let row = 0; row < CONFIG.rows; row += 1) {
    for (let col = 0; col < CONFIG.cols; col += 1) {
      const piece = state.board[row][col];

      if (!piece || piece.type !== "orb") continue;

      const rings = [];
      let cursor = col + 1;

      while (
        cursor < CONFIG.cols &&
        state.board[row][cursor] &&
        state.board[row][cursor].type === "ring"
      ) {
        rings.push({
          piece: state.board[row][cursor],
          row,
          col: cursor
        });

        cursor += 1;
      }

      groups.push({
        orb: piece,
        orbRow: row,
        orbCol: col,
        rings,
        total: piece.number + rings.reduce(
          (sum, ring) => sum + ring.piece.number,
          0
        )
      });
    }
  }

  return groups;
}

/*
  空いた場所があればリングは左に詰まる。
  オーブは固定され、リングはオーブを越えない。
*/
function settleBoard() {
  for (let row = 0; row < CONFIG.rows; row += 1) {
    const oldRow = state.board[row];
    const nextRow = Array(CONFIG.cols).fill(null);

    const orbColumns = [];

    oldRow.forEach((piece, col) => {
      if (piece?.type === "orb") {
        nextRow[col] = piece;
        orbColumns.push(col);
      }
    });

    const boundaries = [...orbColumns, CONFIG.cols];
    let start = 0;

    boundaries.forEach((end) => {
      const rings = [];

      for (let col = start; col < end; col += 1) {
        const piece = oldRow[col];

        if (piece?.type === "ring") {
          rings.push(piece);
        }
      }

      let writeCol = start;

      rings.forEach((ring) => {
        while (nextRow[writeCol]) {
          writeCol += 1;
        }

        if (writeCol < end) {
          nextRow[writeCol] = ring;
          writeCol += 1;
        }
      });

      start = end + 1;
    });

    state.board[row] = nextRow;
  }
}

function findGroupByRingId(ringId) {
  return getGroups().find((group) => {
    return group.rings.some((ring) => ring.piece.id === ringId);
  });
}

function removeRingById(ringId) {
  for (let row = 0; row < CONFIG.rows; row += 1) {
    for (let col = 0; col < CONFIG.cols; col += 1) {
      if (state.board[row][col]?.id === ringId) {
        state.board[row][col] = null;
        return;
      }
    }
  }
}

function removeGroup(group) {
  state.board[group.orbRow][group.orbCol] = null;

  group.rings.forEach((ring) => {
    state.board[ring.row][ring.col] = null;
  });
}

function countOrbs() {
  let total = 0;

  state.board.forEach((row) => {
    row.forEach((piece) => {
      if (piece?.type === "orb") total += 1;
    });
  });

  return total;
}

/* =========================================================
   リング配置・消去
========================================================= */

async function placeRing(row) {
  if (!state || state.isBusy || state.isGameOver) return;

  /*
    右端からリングが入る。
    右端が詰まっているレーンには置けない。
  */
  if (state.board[row][CONFIG.cols - 1]) {
    elements.combo.textContent = "LANE BLOCKED";
    return;
  }

  state.isBusy = true;

  const newRing = createPiece("ring", state.nextRing);
  state.board[row][CONFIG.cols - 1] = newRing;

  // 全レーンのリングを左へ詰める。
  settleBoard();
  renderGame();

  const connectedGroup = findGroupByRingId(newRing.id);

  /*
    9以上なら、新しく置いたリングだけを消す。
    オーブおよび既存リングの状態はそのまま。
  */
  if (connectedGroup && connectedGroup.total >= 9) {
    elements.combo.textContent = "OVER!";

    await wait(150);

    removeRingById(newRing.id);
    state.overGauge += 1;

    if (state.overGauge >= 3) {
      state.overGauge = 0;
      state.chainPower = Math.max(1, state.chainPower - 1);
      elements.combo.textContent = "CHAIN DOWN";
    }

    settleBoard();
    state.nextRing = randomNumber();

    renderGame();
    state.isBusy = false;
    return;
  }

  await resolveClearChains();

  state.nextRing = randomNumber();
  state.isBusy = false;

  renderGame();
}

async function resolveClearChains() {
  let chain = 1;

  while (true) {
    const clearingGroups = getGroups().filter((group) => group.total === 8);

    if (clearingGroups.length === 0) break;

    const simultaneousCount = clearingGroups.length;
    const feverMultiplier = isFeverActive() ? CONFIG.feverMultiplier : 1;
    const chainMultiplier = state.chainPower + chain - 1;
    const simultaneousMultiplier = simultaneousCount > 1 ? simultaneousCount : 1;

    const points =
      (CONFIG.baseClearScore * simultaneousCount +
        CONFIG.simultaneousBonus * Math.max(0, simultaneousCount - 1)) *
      chainMultiplier *
      simultaneousMultiplier *
      feverMultiplier;

    state.score += points;

    // オーブを消すごとにオーバーゲージを1つ減らす。
    state.overGauge = Math.max(0, state.overGauge - simultaneousCount);

    if (simultaneousCount >= 2) {
      elements.combo.textContent = `${simultaneousCount} SIMULTANEOUS!`;
    } else if (chain >= 2) {
      elements.combo.textContent = `${chain} CHAIN!`;
    } else {
      elements.combo.textContent = "CLEAR!";
    }

    playClearSound(chain);

    clearingGroups.forEach(removeGroup);
    renderGame();

    await wait(CONFIG.clearDelay);

    settleBoard();
    renderGame();

    chain += 1;
  }

  checkFever();
  checkLevelUp();
}

/* =========================================================
   フィーバー
========================================================= */

function isFeverActive() {
  return Date.now() < state.feverUntil;
}

function checkFever() {
  if (countOrbs() !== 0) return;

  state.feverUntil = Date.now() + CONFIG.feverDuration;
  elements.combo.textContent = "ALL CLEAR!";
  elements.fever.classList.remove("is-hidden");

  /*
    全オーブを消した後、少し間を空けて次のオーブ群を置く。
    フィーバー中は得点倍率が2倍。
  */
  window.setTimeout(() => {
    if (!state || state.isGameOver) return;

    for (let row = 0; row < CONFIG.rows; row += 1) {
      const col = Math.min(state.orbAreaCols - 1, CONFIG.cols - 1);

      if (!state.board[row][col]) {
        state.board[row][col] = createPiece(
          "orb",
          randomNumber(),
          randomColor()
        );
      }
    }

    renderGame();
  }, 520);

  window.setTimeout(() => {
    if (!state || state.isGameOver) return;

    elements.fever.classList.add("is-hidden");
    renderGame();
  }, CONFIG.feverDuration);
}

/* =========================================================
   レベルアップ・オーブ領域拡張
========================================================= */

function checkLevelUp() {
  if (state.score < state.nextLevelScore || state.isExpanding) return;

  state.level += 1;
  state.nextLevelScore += CONFIG.levelScoreStep;
  state.isExpanding = true;

  elements.combo.textContent = `LEVEL ${state.level}`;

  // 次のオーブ領域を半透明で予告表示。
  renderGame(true);

  // 通常ゲームは止めず、予告後に領域だけ拡張する。
  window.setTimeout(() => {
    extendOrbArea();
  }, CONFIG.levelPreviewDelay);

  changeBgm(state.level);
}

function extendOrbArea() {
  const newOrbColumn = state.orbAreaCols;

  state.orbAreaCols += 1;
  state.isExpanding = false;

  if (state.orbAreaCols >= CONFIG.cols) {
    renderGame();
    gameOver();
    return;
  }

  /*
    新しいオーブ領域になる列より右側のリングを右へ寄せる。
    その列へ新しいオーブを1つ追加する。
  */
  for (let row = 0; row < CONFIG.rows; row += 1) {
    for (let col = CONFIG.cols - 1; col > newOrbColumn; col -= 1) {
      if (
        !state.board[row][col] &&
        state.board[row][col - 1]?.type === "ring"
      ) {
        state.board[row][col] = state.board[row][col - 1];
        state.board[row][col - 1] = null;
      }
    }
  }

  const targetRow = Math.floor(Math.random() * CONFIG.rows);

  if (!state.board[targetRow][newOrbColumn]) {
    state.board[targetRow][newOrbColumn] = createPiece(
      "orb",
      randomNumber(),
      randomColor()
    );
  }

  settleBoard();
  renderGame();

  // 拡張で新たに8ができた場合は自動消去。
  resolveClearChains();
}

/* =========================================================
   描画
========================================================= */

function getPieceVisualData(piece, groupMap) {
  if (piece.type === "orb") {
    const group = groupMap.get(piece.id);

    return {
      color: piece.color,
      total: group?.total || piece.number
    };
  }

  return groupMap.get(piece.id) || {
    color: null,
    total: 0
  };
}

function makePieceElement(piece, visualData) {
  const pieceElement = document.createElement("span");

  pieceElement.className = `piece piece--${piece.type}`;
  pieceElement.textContent = piece.number;

  if (visualData.color !== null && visualData.color !== undefined) {
    pieceElement.classList.add(`piece--color-${visualData.color}`);
  }

  if (visualData.total === 5) {
    pieceElement.classList.add("is-total-5");
  }

  if (visualData.total === 6) {
    pieceElement.classList.add("is-total-6");
  }

  if (visualData.total === 7) {
    pieceElement.classList.add("is-total-7");
  }

  return pieceElement;
}

function renderGame(showExpansionPreview = false) {
  if (!state) return;

  const groups = getGroups();
  const groupMap = new Map();

  groups.forEach((group) => {
    groupMap.set(group.orb.id, {
      color: group.orb.color,
      total: group.total
    });

    group.rings.forEach((ring) => {
      groupMap.set(ring.piece.id, {
        color: group.orb.color,
        total: group.total
      });
    });
  });

  elements.gameBoard.innerHTML = "";
  elements.gameBoard.style.setProperty("--rows", CONFIG.rows);
  elements.gameBoard.style.setProperty("--cols", CONFIG.cols);

  for (let row = 0; row < CONFIG.rows; row += 1) {
    for (let col = 0; col < CONFIG.cols; col += 1) {
      const cell = document.createElement("button");
      const piece = state.board[row][col];

      cell.type = "button";
      cell.className = "board-cell";
      cell.setAttribute("aria-label", `${row + 1}番レーン`);

      if (col < state.orbAreaCols) {
        cell.classList.add("is-orb-zone");
      }

      if (
        showExpansionPreview &&
        col === state.orbAreaCols &&
        col < CONFIG.cols
      ) {
        cell.classList.add("is-expansion-preview");
      }

      /*
        各レーンをどこでもタップできる。
        実際のリングは右端から入るので、盤面上の空マス自体へ
        直接置かれるわけではない。
      */
      if (!state.isBusy && !state.isGameOver) {
        cell.classList.add("is-tappable");
      }

      cell.addEventListener("click", () => {
        placeRing(row);
      });

      if (piece) {
        cell.appendChild(
          makePieceElement(piece, getPieceVisualData(piece, groupMap))
        );
      }

      elements.gameBoard.appendChild(cell);
    }
  }

  elements.score.textContent = state.score.toLocaleString("ja-JP");
  elements.level.textContent = state.level;

  [...elements.overGauge.children].forEach((gauge, index) => {
    gauge.classList.toggle("is-filled", index < state.overGauge);
  });

  elements.nextRingNumber.textContent = state.nextRing;
  elements.nextRing.classList.toggle("is-disabled", state.isBusy);

  if (isFeverActive()) {
    elements.fever.classList.remove("is-hidden");
  }
}

/* =========================================================
   チュートリアル
========================================================= */

function startTutorial() {
  closeAllModals();
  stopBgm();

  tutorialStep = 0;
  showScreen("tutorial");

  renderTutorial();
}

function renderTutorial() {
  elements.tutorialStepLabel.textContent =
    `STEP ${tutorialStep + 1} / ${TUTORIAL_STEPS.length}`;

  elements.tutorialText.textContent = TUTORIAL_STEPS[tutorialStep];

  const isLastStep = tutorialStep === TUTORIAL_STEPS.length - 1;

  elements.tutorialNextButton.textContent = isLastStep
    ? "完了"
    : "次へ";

  renderTutorialBoard(tutorialStep);
  playTutorialVoice(tutorialStep + 1);
}

function renderTutorialBoard(step) {
  elements.tutorialBoard.innerHTML = "";

  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 6; col += 1) {
      const cell = document.createElement("div");
      cell.className = "board-cell";

      /*
        チュートリアルの説明に合わせた簡易盤面。
      */
      const isExampleRow = row === 1;

      if (isExampleRow && col === 0) {
        const orb = createPiece("orb", 3, 0);
        cell.appendChild(
          makePieceElement(orb, {
            color: 0,
            total: step >= 4 ? 7 : 3
          })
        );
      }

      if (isExampleRow && col === 1 && step >= 2) {
        const ring = createPiece("ring", 2);
        cell.appendChild(
          makePieceElement(ring, {
            color: step >= 3 ? 0 : null,
            total: step >= 4 ? 7 : 5
          })
        );
      }

      if (isExampleRow && col === 2 && step >= 4) {
        const ring = createPiece("ring", step >= 5 ? 3 : 2);
        cell.appendChild(
          makePieceElement(ring, {
            color: 0,
            total: step >= 5 ? 8 : 7
          })
        );
      }

      elements.tutorialBoard.appendChild(cell);
    }
  }
}

function nextTutorialStep() {
  if (tutorialStep >= TUTORIAL_STEPS.length - 1) {
    stopTutorialVoice();
    openModal(elements.tutorialCompleteModal);
    return;
  }

  tutorialStep += 1;
  renderTutorial();
}

/* =========================================================
   ランキング
========================================================= */

function getRanking() {
  try {
    const ranking = JSON.parse(localStorage.getItem(CONFIG.rankingKey));

    if (Array.isArray(ranking)) {
      return ranking;
    }
  } catch (error) {
    // 壊れた保存データは空ランキング扱いにする。
  }

  return [
    { name: "みかん", score: 25480 },
    { name: "ねこ〜", score: 18920 },
    { name: "ゆーき", score: 12840 },
    { name: "あ－る", score: 11300 }
  ];
}

function saveRanking(ranking) {
  localStorage.setItem(CONFIG.rankingKey, JSON.stringify(ranking));
}

function renderRanking() {
  const ranking = getRanking()
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  elements.rankingList.innerHTML = "";

  ranking.forEach((entry, index) => {
    const item = document.createElement("li");

    const rank = document.createElement("span");
    rank.className = "ranking-list__rank";
    rank.textContent = index + 1;

    const name = document.createElement("span");
    name.className = "ranking-list__name";
    name.textContent = entry.name;

    const score = document.createElement("span");
    score.className = "ranking-list__score";
    score.textContent = entry.score.toLocaleString("ja-JP");

    item.append(rank, name, score);
    elements.rankingList.appendChild(item);
  });
}

function openRanking() {
  renderRanking();
  showScreen("ranking");
}

function trySaveScore(score) {
  const ranking = getRanking()
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  const qualifies =
    ranking.length < 10 ||
    score > ranking[ranking.length - 1].score;

  if (!qualifies || score <= 0) return;

  let name = "";

  while (true) {
    const enteredName = window.prompt(
      "ランキング入り！\n名前を1〜6文字で入力してください。\n使える文字：ひらがな、〜、ー、－",
      ""
    );

    if (enteredName === null) return;

    name = enteredName.trim();

    /*
      「ゆーき」の例に合わせ、長音記号「ー」も許可する。
    */
    const isValid = /^[ぁ-ゖ〜ー－]{1,6}$/u.test(name);

    if (isValid) break;

    window.alert(
      "名前は1〜6文字のひらがな、〜、ー、－だけで入力してください。"
    );
  }

  ranking.push({ name, score });
  ranking.sort((a, b) => b.score - a.score);

  saveRanking(ranking.slice(0, 10));
}

/* =========================================================
   ゲームオーバー
========================================================= */

function gameOver() {
  state.isGameOver = true;
  state.isBusy = true;

  stopBgm();

  elements.finalScore.textContent =
    state.score.toLocaleString("ja-JP");

  trySaveScore(state.score);
  openModal(elements.gameOverModal);
}

/* =========================================================
   ボタンイベント
========================================================= */

$("#start-button").addEventListener("click", startGame);
$("#tutorial-button").addEventListener("click", startTutorial);
$("#ranking-button").addEventListener("click", openRanking);

$("#game-menu-button").addEventListener("click", returnToTitle);

$("#tutorial-next-button").addEventListener("click", nextTutorialStep);

$("#tutorial-exit-button").addEventListener("click", () => {
  openModal(elements.tutorialExitModal);
});

$("#tutorial-resume-button").addEventListener("click", () => {
  closeModal(elements.tutorialExitModal);
});

$("#tutorial-quit-button").addEventListener("click", () => {
  stopTutorialVoice();
  closeModal(elements.tutorialExitModal);
  returnToTitle();
});

$("#tutorial-start-game-button").addEventListener("click", () => {
  closeModal(elements.tutorialCompleteModal);
  startGame();
});

$("#tutorial-restart-button").addEventListener("click", () => {
  closeModal(elements.tutorialCompleteModal);
  tutorialStep = 0;
  renderTutorial();
});

$("#retry-button").addEventListener("click", () => {
  closeModal(elements.gameOverModal);
  startGame();
});

$("#return-title-button").addEventListener("click", () => {
  closeModal(elements.gameOverModal);
  returnToTitle();
});

document.querySelectorAll("[data-return-to-title]").forEach((button) => {
  button.addEventListener("click", returnToTitle);
});

/* =========================================================
   初期表示
========================================================= */

showScreen("title");
