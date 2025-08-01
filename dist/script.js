let HypoDate = 0;
let allData = [];
// ファイルの先頭付近にグローバル変数を宣言
let latestTsunamiInfo = null; // 既存
let tsunamiAreaGeoJson = null; // <-- 追加: 津波区域GeoJSONデータ用
let tsunamiAreaGeoJsonData = null; // 既存
let tsunamiLayer = null; // 既存
// 統合表示用変数
let combinedData = {
  jmaEew: null,
  scEew: null,
  fjEew: null,
  jmaEqList: [],
  jmaHypoData: [],
  cencEqList: {},
  emscEqList: {},
  cwaEqList: [],
  cwaEqList_tiny: [],
  usgsData: [],
  bmkgData: [],
  bmkg_M5Data: [],
};

let markerGroup = null; // マーカーのグループを保持する変数
let priactive = null; // 現在アクティブなマーカーを保持する変数

// --- 通知レベルの定義 ---
// マグニチュードに応じた通知レベル設定
const NOTIFICATION_LEVELS = {
  LOW: {
    minMag: 0,
    maxMag: 3.9, // 4.0未満
    sound: "Shindo0.mp3",
    vibrate: [100],
    icon: "favicon_low.ico",
    label: "低",
  },
  MEDIUM: {
    minMag: 4.0,
    maxMag: 5.9, // 6.0未満
    sound: "Shindo1.mp3",
    vibrate: [200, 100, 200],
    icon: "favicon_medium.ico",
    label: "中",
  },
  HIGH: {
    minMag: 6.0,
    maxMag: Infinity, // 6.0以上
    sound: "Shindo2.mp3",
    vibrate: [400, 200, 400, 200, 400],
    icon: "favicon_high.ico",
    label: "高",
  },
};

// --- 通知関連のグローバル変数 (既存の変数を置き換えまたは追加) ---
let enableNotification = true; // 既存
let soundNotification = true; // 既存
let magThreshold = 1.0; // 既存
let lastNotificationId = null; // 既存、通知重複防止用
let processedIds = new Set(); // 既存、通知済みID記録用

// --- 新規データ検知とレベル別通知 ---
// 統合された allData 配列から新しい地震情報を検出し、マグニチュードに応じて通知
function checkNewEarthquake(dataArray) {
  if (!enableNotification) return;

  dataArray.forEach((item) => {
    // ✅ 1時間以上前の地震は通知しないフィルターを追加
    // --- 時刻フィルタリング開始 ---
    const oneHourInMillis = 60 * 60 * 1000; // 1時間 = 3600000 ミリ秒
    const now = new Date();
    let earthquakeTime = null;

    // item オブジェクトから時刻情報を取得 (各データソースの形式に対応)
    // 例: time_full, time, shockTime, DateTime など
    //const timeStr = item.time_full || item.time || item.shockTime || item.DateTime || item.origin_time || null;
    const timeStr =
      item.time_full || item.time || item.shockTime || item.DateTime || "不明";

    if (timeStr) {
      // 文字列を Date オブジェクトに変換
      // 注意: 入力フォーマットによっては、より明示的なパースが必要な場合があります (例: 'YYYY-MM-DD HH:mm:ss')
      earthquakeTime = new Date(timeStr);
    }

    // 時刻情報が取得できなかった場合、または1時間以上前であれば通知をスキップ
    if (
      !earthquakeTime ||
      isNaN(earthquakeTime.getTime()) ||
      now - earthquakeTime > oneHourInMillis
    ) {
      return; // この item に対する処理をスキップ
    }
    // --- 時刻フィルタリング終了 ---

    // --- ユニークなIDの生成 ---
    // 各データソースのIDフィールドを考慮して、できるだけ一意なIDを生成
    const uniqueId =
      item.id ||
      item.eid ||
      item.EventID ||
      item.eventId ||
      item.code ||
      item.EventId ||
      item.EventCode ||
      `${item.time_full || item.time || item.shockTime || item.DateTime}_${
        item.lat
      }_${item.lng}_${item.magnitude}`;

    // 既に処理済みまたは通知済みならスキップ
    if (processedIds.has(uniqueId) || lastNotificationId === uniqueId) return;

    // --- マグニチュードの取得とチェック ---
    const mag = parseFloat(item.magnitude);
    if (isNaN(mag)) {
      console.warn(
        "checkNewEarthquake: マグニチュードが無効です",
        item.magnitude,
        item
      );
      return; // マグニチュードが無効な場合はスキップ
    }

    // グローバルなマグニチュード閾値チェック
    if (mag < magThreshold) return;

    // --- 通知レベルの判定 ---
    let notificationLevel = null;
    for (const [levelName, levelConfig] of Object.entries(
      NOTIFICATION_LEVELS
    )) {
      if (mag >= levelConfig.minMag && mag <= levelConfig.maxMag) {
        notificationLevel = levelConfig;
        break;
      }
    }

    // 通知レベルが見つからない場合（念のため）
    if (!notificationLevel) {
      console.warn(
        "checkNewEarthquake: 通知レベルが判定できませんでした。",
        mag,
        item
      );
      // デフォルトでMEDIUMレベルを使用するか、スキップする
      notificationLevel = NOTIFICATION_LEVELS.MEDIUM;
      // return; // スキップする場合はこちら
    }

    // --- 通知内容の作成 ---

    const locationStr = item.location || item.placeName || "不明";
    const magStr = isNaN(mag) ? "不明" : mag.toFixed(1);
    const depthStr = item.depth || item.Depth || "不明";
    const title = `M ${magStr} - ${locationStr}\n` || "新しい地震情報";

    const body = `発生時刻: ${timeStr}\n深さ: ${depthStr} km\n通知レベル: ${notificationLevel.label}`;

    // --- 通知の実行 ---
    showNotification(title, body, notificationLevel, uniqueId);

    // --- 処理済みとして記録 ---
    processedIds.add(uniqueId);
    lastNotificationId = uniqueId; // 重複防止用にも記録
  });
}

// - ブラウザ通知と音声通知を表示 (レベル別対応版) -
function showNotification(title, body, levelSettings, itemId) {
  // 通知が有効でない、または許可されていない場合は何もしない
  if (!enableNotification || Notification.permission !== "granted") {
    console.log("通知が許可されていないか、無効です。");
    return;
  }

  // levelSettings が undefined または null の場合に備えて、デフォルト値を設定
  const safeLevelSettings = levelSettings || {}; // ✅ levelSettings が falsy なら空オブジェクト

  // - ブラウザ通知の作成 -
  const notificationOptions = {
    body: body,
    // ✅ safeLevelSettings を使用し、さらにその中の icon プロパティが無ければデフォルト値
    icon: safeLevelSettings.icon || "favicon.ico",
    // ✅ safeLevelSettings を使用し、さらにその中の vibrate プロパティが無ければデフォルト値
    vibrate: safeLevelSettings.vibrate || [200],
    // ... 他のオプションも同様に修正可能 ...
    // 例: requireInteraction: safeLevelSettings.requireInteraction ?? true,
  };
  // - 音声通知（オプション）-
  if (soundNotification && levelSettings && levelSettings.sound) {
    // levelSettings の存在もチェック
    try {
      console.log(`音声通知再生を試みます: ${levelSettings.sound}`); // デバッグ用ログ
      const audio = new Audio(levelSettings.sound);
      // audio.volume = 0.8; // 必要に応じて音量調整 (0.0 〜 1.0)
      // audio.load(); // 読み込みを促す（オプション）

      const playPromise = audio.play();

      if (playPromise !== undefined) {
        playPromise.catch((error) => {
          // iOS Safari など、ユーザー操作なしでの再生がブロックされた場合
          if (error.name === "NotAllowedError" || error.name === "AbortError") {
            console.warn(
              `音声再生がブロックされました。ユーザー操作が必要な可能性があります。ファイル: ${levelSettings.sound}`,
              error
            );
          } else {
            console.error(
              `音声再生エラー (${levelSettings.sound}):`,
              error.name,
              error.message
            );
          }
        });
      }
    } catch (e) {
      console.error(
        "音声オブジェクトの作成または再生中にエラーが発生しました:",
        e
      );
    }
  } else if (soundNotification) {
    // soundNotification は ON だが、levelSettings または levelSettings.sound がない場合
    console.warn(
      "音声通知が有効ですが、音声ファイルが指定されていません。",
      levelSettings
    );
  }
  try {
    // - ブラウザ通知の表示 -
    const notification = new Notification(title, notificationOptions);
    console.log("通知を表示しました:", title, body, safeLevelSettings);

    // - 通知クリック時の動作 -
    notification.onclick = function () {
      // 通知クリック時の処理 (例: タブ切り替えなど)
      console.log("通知がクリックされました:", itemId);
      // window.focus();
      // 対応するタブや要素に移動する処理をここに書くことも可能
    };
  } catch (error) {
    console.error("通知の作成または表示中にエラーが発生しました:", error);
  }
}
// - 通知設定チェックボックスの状態管理関数 -
function initNotificationSettings() {
  // 1. チェックボックス要素を取得 (関数スコープ内での定義)
  const enableNotificationCheckbox =
    document.getElementById("enableNotification");
  const soundNotificationCheckbox =
    document.getElementById("soundNotification");

  // 2. チェックボックスの状態が変更されたときのイベントリスナーを設定 (通知有効/無効)
  if (enableNotificationCheckbox) {
    enableNotificationCheckbox.addEventListener("change", function () {
      // チェックボックスの状態をグローバル変数 enableNotification に反映
      enableNotification = this.checked;
      console.log("通知設定が変更されました:", enableNotification);

      // 通知が有効になった場合、ブラウザの通知許可を確認・リクエスト
      if (enableNotification && Notification.permission !== "granted") {
        Notification.requestPermission()
          .then((permission) => {
            // アロー関数に変更
            if (permission === "granted") {
              console.log("通知の許可が得られました。");
            } else {
              console.warn("通知の許可がありません。");
              // チェックボックスの状態を再度更新してUIを同期させる
              enableNotification = false;
              enableNotificationCheckbox.checked = false;
            }
          })
          .catch((error) => {
            // アロー関数に変更
            console.error("通知許可リクエスト中にエラーが発生しました:", error);
            enableNotification = false;
            enableNotificationCheckbox.checked = false;
          });
      }
      // 必要に応じて、通知設定の変更を反映するために他の関数を呼び出す
      // 例: updateCombinedDisplay();
    });
  } else {
    console.warn(
      "ID 'enableNotification' のチェックボックスが見つかりません。"
    );
  }

  // 3. チェックボックスの状態が変更されたときのイベントリスナーを設定 (音声通知有効/無効)
  if (soundNotificationCheckbox) {
    soundNotificationCheckbox.addEventListener("change", function () {
      // チェックボックスの状態をグローバル変数 soundNotification に反映
      soundNotification = this.checked;
      console.log("音声通知設定が変更されました:", soundNotification);
      // 必要に応じて、音声通知設定の変更を反映する処理をここに追加
    });
  } else {
    console.warn("ID 'soundNotification' のチェックボックスが見つかりません。");
  }

  // 4. ページ読み込み時に、チェックボックスの状態を現在のグローバル変数値と同期させます。
  // (これは、設定がローカルストレージなどから読み込まれた場合や、HTMLの初期状態とJS変数が食い違っている場合に重要です)
  if (enableNotificationCheckbox) {
    enableNotificationCheckbox.checked = enableNotification;
  }
  if (soundNotificationCheckbox) {
    soundNotificationCheckbox.checked = soundNotification;
  }

  console.log("通知設定の初期化が完了しました。");
}
// 接続状態
let connections = {
  jmaEew: false,
  jmaEq: false,
  scEew: false,
  fjEew: false,
  cencEq: false,
  ceaEew: false,
  iclEew: false,
  emscEq: false,
  cwaEq: false,
  cwaEq_tiny: false,
};

// 最終更新時刻
let lastUpdateTimes = {
  jmaEew: null,
  scEew: null,
  fjEew: null,
  jmaEq: null,
  cencEq: null,
  jmaXml: null,
  ceaEew: null,
  iclEew: null,
  emscEq: null,
  cwaEq: null,
  cwaEq_tiny: null,
  jmaGeojson: null,
};

// DOM要素取得
const combinedEqList = document.getElementById("combinedEqList");
const combinedStatus = document.getElementById("combinedStatus");
const sourceJMA = document.getElementById("sourceJMA");
const sourceSC = document.getElementById("sourceSC");
const sourceFJ = document.getElementById("sourceFJ");
const sourceCENC = document.getElementById("sourceCENC");
const sourceJmaXml = document.getElementById("sourceJmaXml");
const sourceCea = document.getElementById("sourceCea");
const sourceIcl = document.getElementById("sourceIcl");
const sourceUSGS = document.getElementById("sourceUSGS");
const sourceEMSC = document.getElementById("sourceEMSC");
const sourceCWA = document.getElementById("sourceCWA");
const sourceCWA_tiny = document.getElementById("sourceCWA_tiny");
const sourceJmaEqList = document.getElementById("sourceJmaEqList");
const sourceJmaHypo = document.getElementById("sourceJmaHypo");

const intervalInput = document.getElementById("intervalInput");
const startButton = document.getElementById("startButton");
const stopButton = document.getElementById("stopButton");

// セレクト変更時に再実行
document.getElementById("usgssetting").addEventListener("change", () => {
  fetchUsgsData();
  updateCombinedDisplay();
});

document.getElementById("usgssettingmag").addEventListener("change", () => {
  fetchUsgsData();
  updateCombinedDisplay();
});

// テーマ切替ボタンのイベントリスナー
document.getElementById("themeToggle").addEventListener("click", () => {
  document.body.classList.toggle("dark-mode");

  // 現在のテーマを保存
  const isDarkMode = document.body.classList.contains("dark-mode");
  localStorage.setItem("theme", isDarkMode ? "dark" : "light");

  // ボタンテキストの更新
  document.getElementById("themeToggle").textContent = isDarkMode
    ? "ライトモード"
    : "ダークモード";
});

// JMA XMLデータ取得用変数
let jmaXmlData = [];
let jmaXmlLastUpdate = null;
const xmlCache = {}; // XML詳細情報のキャッシュ用

// BMKG地震情報データ

let bmkgLastUpdate = null;
// BMKG M5.0+ 地震情報用変数

let bmkg_M5LastUpdate = null;
// USGS 地震情報用変数

let usgsLastUpdate = null;
//JmaHypoData 用変数
let jmaHypoLastUpdate = null;
// 中央気象署（台湾）用変数
const CWA_API_KEY = "CWA-1D4B4F6B-A52D-4CC0-9478-5C9AE9D7270A"; // CWA APIキー

// CWA 地震情報のフィールド抽出

// WebSocket接続用変数
let jmaEewWs = null;
let jmaEqWs = null;
let scEewWs = null;
let fjEewWs = null;
let cencEqWs = null;
let jmaEqList = null;
let ceaEewWs = null;
let iclEewWs = null;
let emscEqWs = null;
let cwaEqWs = null;
let cwaEqWs_tiny = null;

// 中国地震局（CEA）用変数
let ceaWs = null;
let ceaData = null;
let ceaLastUpdate = null;
let ceaStatus = null;

// 成都高新防災減災研究所（ICL）用変数
let iclWs = null;
let iclData = null;
let iclLastUpdate = null;

//emsc 地震情報用変数
let emscLastUpdate = null;

// 中央気象署（台湾）地震情報表示更新
function updateCwaEqList(data) {
  if (data && data.length > 0) {
    combinedData.cwaEqList = data;
  }
  lastUpdateTimes.cwaEq = new Date();
  updateCombinedDisplay();
}
// JMA 緊急地震速報表示更新
function updateJmaEewDisplay(data) {
  if (data.isCancel) {
    combinedData.jmaEew = null;
  } else {
    combinedData.jmaEew = data;
    checkAndNotify(data, "jma_eew"); // ✅ 通知を送信
  }

  lastUpdateTimes.jmaEew = new Date();
  updateCombinedDisplay();
}

//中央気象署（台湾）小区域地震情報表示更新
function updateCwaTinyEqList(data) {
  if (data && data.length > 0) {
    combinedData.cwaEqList_tiny = data;
  }
  lastUpdateTimes.cwaEq_tiny = new Date();
  updateCombinedDisplay();
}
// 四川地震局 地震警報表示更新
function updateScEewDisplay(data) {
  if (data.Cancel) {
    combinedData.scEew = null;
  } else {
    combinedData.scEew = data;
    checkAndNotify(data, "sc_eew"); // ✅ 通知を送信
  }

  lastUpdateTimes.scEew = new Date();
  updateCombinedDisplay();
}

// 福建地震局 地震警報表示更新
function updateFjEewDisplay(data) {
  if (data.isCancel) {
    combinedData.fjEew = null;
  } else {
    combinedData.fjEew = data;
    checkAndNotify(data, "fj_eew"); // ✅ 通知を送信
  }

  lastUpdateTimes.fjEew = new Date();
  updateCombinedDisplay();
}

// 中国地震台網 地震情報表示更新
function updateCencEqList(data) {
  if (data && data.type === "automatic") {
    combinedData.cencEqList[data.id] = data;
    checkAndNotify(data, "cenc"); // ✅ 通知を送信
  }

  lastUpdateTimes.cencEq = new Date();
  updateCombinedDisplay();
}

//EMSC 地震情報表示更新
function updateEmscEqList(data) {
  // --- ここにデバッグログを追加 ---
  console.log("★★★ updateEmscEqList 関数が呼び出されました ★★★");
  console.log("updateEmscEqList に渡された data:", data);
  console.log("data.type:", data?.type);
  console.log("data.id:", data?.id);
  console.log("data.properties:", data?.properties);
  // --- デバッグログここまで ---

  // combinedData.emscEqList = {}; // ❌ 削除: この行があると履歴が毎回クリアされる

  if (
    data &&
    data.id &&
    (data.type === "Feature" ||
      data.data.type === "Feature" ||
      (data.properties && data.properties.type === "Feature"))
  ) {
    const props = data.properties;
const date = new Date(props.time);
// JST（UTC+9）に変換
const jstDate = new Date(date.getTime() + 9 * 60 * 60 * 1000);

// 年/月/日 時:分:秒 形式にフォーマット
const formattedtime = jstDate.toISOString()
  .replace(/T/, ' ')      // Tをスペースに置換
  .replace(/\..+Z/, '')   // ミリ秒とZを削除
  .replace(/-/g, '/');    // -を/に置換

    // 統一構造に変換 (ID と source を追加)
    const convertedData = {
      id: data.id, // ✅ IDを保持
      source: "emsc", // ✅ EMSC ソースを明示
      auth: props.auth, 
      displayType: "eq", // ✅ 表示タイプを明示
      // properties から必要な情報を抽出・変換
      time: formattedtime, // 発生時刻
      updateTime: props.lastupdate, // 最終更新時刻
      location: props.flynn_region || props.region || "情報なし", // 地域
      magnitude:
        props.mag !== undefined && props.mag !== null
          ? props.mag.toFixed(1)
          : "情報なし", // マグニチュード
      magtype: props.magtype || "M", // マグニチュードタイプ
      depth:
        props.depth !== undefined && props.depth !== null
          ? props.depth.toFixed(1)
          : "情報なし", // 深さ
      lat: props.lat, // 緯度
      lng: props.lon, // 経度
      // 必要に応じて他のプロパティも追加可能
      Title: props.flynn_region || "EMSC 地震", // 表示用タイトル
      // intensity: props.intensity || "情報なし", // 必要に応じて
    };

    // ✅ ID をキーとして格納して履歴を保持
    combinedData.emscEqList[data.id] = convertedData;

    // 通知
    //checkAndNotify(convertedData, "emsc"); // ✅ 通知を送信 (convertedData を渡す)

    emscLastUpdate = new Date();
    updateCombinedDisplay(); // ✅ 統合表示を更新
    console.log("updateEmscEqList - データを格納しました。", convertedData);
    return; // 正常に処理されたことを示す
  }
  console.log("updateEmscEqList - 条件を満たしませんでした。", data);
  // else の場合の処理は特に必要ないかもしれませんが、念のため updateCombinedDisplay は呼び出す
  emscLastUpdate = new Date();
  updateCombinedDisplay(); // ✅ 統合表示を更新
}

//JMA Hypo 地震情報表示更新
function updateJmaHypoList(data) {
  if (data && data.features && Array.isArray(data.features)) {
    return data.features.map((feature) => {
      const props = feature.properties;
      const coords = feature.geometry.coordinates;
      return {
        // 統一されたプロパティ名を使用 (他のデータソースと整合性を持たせる)
        id: props.eid, // ✅ IDを追加
        source: "jma_geojson", // ✅ ソースを明示
        displayType: "eq", // ✅ 表示タイプを明示
        time: props.origin_time, // 発生時刻
        // time_full: props.origin_time, // 必要に応じて追加
        location: props.name || "不明",
        magnitude:
          props.magnitude !== undefined && props.magnitude !== null
            ? props.magnitude
            : "不明",
        depth: coords[2] !== null ? (coords[2] / 1000).toFixed(1) : "不明", // kmに変換
        lat: coords[1],
        lng: coords[0],
        intensity: props.intensity || "なし", // 最大震度 (あれば)
        // 必要に応じて他のプロパティも追加
        // title: props.ttl || `M${props.magnitude} 地震`, // タイトル
        // json: props.json, // 詳細JSONパス
        // ... propsの他のフィールド
      };
    });
  }
  return [];
}

// USGS 地震情報表示更新
function updateUsgsList(data) {
  if (data && data.type === "usgs") {
    combinedData.usgsData = data;
    checkAndNotify(data, "usgs"); // ✅ 通知を送信
  }
  usgsLastUpdate = new Date();
  updateCombinedDisplay();
}

// BMKG 地震情報表示更新
function updateBmkgDisplay(data) {
  if (data && data.type === "bmkg") {
    combinedData.bmkgData = data;
    checkAndNotify(data, "bmkg"); // ✅ 通知を送信
  }

  bmkgLastUpdate = new Date();
  updateCombinedDisplay();
}

// BMKG M5.0+ 地震情報表示更新
function updateBmkgM5Display(data) {
  if (data && data.type === "bmkg_m5") {
    combinedData.bmkg_M5Data = data;
    checkAndNotify(data, "bmkg_m5"); // ✅ 通知を送信
  }

  bmkg_M5LastUpdate = new Date();
  updateCombinedDisplay();
}

// 中国地震局（CEA）地震情報表示更新
function updateCeaDisplay(data) {
  if (data && data.type === "cea_eew") {
    ceaData = data;
    checkAndNotify(data, "cea"); // ✅ 通知を送信以下に、**新しく地震情報が追加されたときに通知を出す機能**を追加するコードを示します。この機能は既存の統合地震情報システムに統合可能で、マグニチュード閾値や通知のON/OFF設定も可能です。
  }
}

// 中国地震局（CEA）接続関数
function connectCea() {
  if (ceaEewWs) ceaEewWs.close();
  ceaEewWs = new WebSocket("wss://ws.fanstudio.tech/cea");

  ceaEewWs.onopen = () => {
    connections.ceaEew = true;
    ceaEewWs.send("query_cea");
    ceaStatus.textContent = "接続状況: 接続済み";
    ceaStatus.className = "status connected";

    if (ceaEewWs.readyState === WebSocket.OPEN) {
      ceaEewWs.send("query_cea");
    }
  };

  ceaEewWs.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);

      if (data.type === "heartbeat") {
        ceaEewWs.send(
          JSON.stringify({ type: "pong", timestamp: data.timestamp })
        );
      } else if (data.type === "initial" || data.type === "update") {
        lastUpdateTimes.ceaEew = new Date();
        updateCeaDisplay(data.Data);
      }
    } catch (error) {
      console.error("CEAデータ解析エラー:", error);
    }

    //updateCombinedDisplay();
  };

  ceaEewWs.onclose = () => {
    connections.cea = false;
    ceaStatus.textContent = "接続状況: 切断されました";
    ceaStatus.className = "status disconnected";
    setTimeout(connectCea, 30000); // 30秒後に再接続
  };

  ceaEewWs.onerror = (error) => {
    console.error("CEA WebSocketエラー:", error);
    ceaEewWs.close();
  };
}
// 成都高新防災減災研究所（ICL）接続関数（公開ソフトウェアでの使用禁止）
function connectIcl() {
  if (iclWs) iclWs.close();
  iclWs = new WebSocket("wss://ws.fanstudio.tech/icl");

  iclWs.onopen = () => {
    connections.icl = true;
    iclStatus.textContent = "接続状況: 接続済み";
    iclStatus.className = "status connected";

    if (iclWs.readyState === WebSocket.OPEN) {
      iclWs.send("query_icl");
    }
  };

  iclWs.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);

      if (data.type === "heartbeat") {
        iclWs.send(JSON.stringify({ type: "pong", timestamp: data.timestamp }));
      } else if (data.type === "initial" || data.type === "update") {
        lastUpdateTimes.iclEew = new Date();
        updateIclDisplay(data.Data);
      }
    } catch (error) {
      console.error("ICLデータ解析エラー:", error);
    }

    //updateCombinedDisplay();
  };

  iclWs.onclose = () => {
    connections.icl = false;
    iclStatus.textContent = "接続状況: 切断されました";
    iclStatus.className = "status disconnected";
    setTimeout(connectIcl, 3000); // 30秒後に再接続
  };

  iclWs.onerror = (error) => {
    console.error("ICL WebSocketエラー:", error);
    iclWs.close();
  };
}
// 中国地震局（CEA）表示更新
function updateCeaDisplay(data) {
  // 関数の冒頭付近で変換
let utcShockTimeObj = null;
let displayShockTimeStr = "日時不明";
if (data && data.shockTime) {
    utcShockTimeObj = parseLocalTimeToUTCDate(data.shockTime, 8); // 中国時間 (UTC+8)
    displayShockTimeStr = utcShockTimeObj ? formatUTCDateToJSTString(utcShockTimeObj) : "日時不明";
}
  ceaList.innerHTML = "";

  if (!data) {
    ceaList.innerHTML = "<p>地震情報がありません</p>";
    return;
  }

  const item = document.createElement("div");
  item.className = "earthquake-item";
  item.innerHTML = `
        <div class="earthquake-info">
            <strong>地震情報（CEA）</strong><br>
            <span class="time">発生時刻: ${displayShockTimeStr}</span><br>
            <span class="location">震源地: ${data.placeName}</span><br>
            <span>マグニチュード: ${data.magnitude}</span><br>
            <span>最大烈度: ${getIntersityLabel(data.epiIntensity)}</span><br>
            <span>深さ: ${data.depth} km</span><br>
            <span>緯度: ${data.latitude}° 経度: ${data.longitude}°</span><br>
            <span class="source">情報源: 中国地震局（CEA）</span>
        </div>
    `;
  ceaList.appendChild(item);
}
// 成都高新防災減災研究所（ICL）表示更新（公開ソフトウェアでの使用禁止）
function updateIclDisplay(data) {
  // 関数の冒頭付近で変換
let utcShockTimeObj = null;
let displayShockTimeStr = "日時不明";
if (data && data.shockTime) {
    utcShockTimeObj = parseLocalTimeToUTCDate(data.shockTime, 8); // 中国時間 (UTC+8)
    displayShockTimeStr = utcShockTimeObj ? formatUTCDateToJSTString(utcShockTimeObj) : "日時不明";
}
  iclList.innerHTML = "";

  if (!data) {
    iclList.innerHTML = "<p>地震情報がありません</p>";
    return;
  }

  const item = document.createElement("div");
  item.className = "earthquake-item";
  item.innerHTML = `
        <div class="earthquake-info">
            <strong>地震情報（ICL）</strong><br>
            <span class="time">発生時刻: ${displayShockTimeStr}</span><br>
            <span class="time">発表時刻: ${data.updateTime}</span><br>
            <span class="location">震源地: ${data.placeName}</span><br>
            <span>マグニチュード: ${data.magnitude}</span><br>
            
            <!-- epiIntensity が 0 のときは表示しない -->
            ${
              data.epiIntensity > 0
                ? `<span>最大烈度: ${getIntersityLabel(
                    data.epiIntensity
                  )}</span><br>`
                : ""
            }
            
            <span>深さ: ${data.depth} km</span><br>
            <span>ステーション数: ${data.sations}</span><br>
            <span class="source">情報源: 成都高新防災減災研究所（ICL）</span>
        </div>
    `;
  iclList.appendChild(item);
}
// USGS 地震情報取得関数
async function fetchUsgsData() {
  const usgssetting = document.getElementById("usgssetting").value;
  let usgsType = "day"; // デフォルト値

  if (usgssetting === "1h") {
    usgsType = "hour";
  } else if (usgssetting === "1d") {
    usgsType = "day";
  } else if (usgssetting === "1w") {
    usgsType = "week";
  } else if (usgssetting === "1m") {
    usgsType = "month";
  }

  const usgssettingmag = document.getElementById("usgssettingmag").value;
  let usgsTypemag = "all"; // デフォルト値

  if (usgssettingmag === "significant") {
    usgsTypemag = "significant";
  } else if (usgssettingmag === "4.5") {
    usgsTypemag = "4.5";
  } else if (usgssettingmag === "2.5") {
    usgsTypemag = "2.5";
  } else if (usgssettingmag === "1.0") {
    usgsTypemag = "1.0";
  } else if (usgssettingmag === "all") {
    usgsTypemag = "all";
  }

  try {
    const response = await fetch(
      `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/${usgsTypemag}_${usgsType}.geojson`
    );
    const data = await response.json();
    console.log("USGSデータ受信:", data);

    // 既存データをクリア
    combinedData.usgsData = [];

    // features を抽出
    if (data && Array.isArray(data.features)) {
      data.features.forEach((feature) => {
        const props = feature.properties;
        const geom = feature.geometry;

        // 時刻の変換（Unix timestamp → 日付）
        const time = new Date(props.time);
        const updateTime = new Date(props.updated);

        // 座標の抽出
        const coordinates = geom.coordinates || [
          "情報なし",
          "情報なし",
          "情報なし",
        ];
        const lon = coordinates[0]?.toFixed(4) || "情報なし";
        const lat = coordinates[1]?.toFixed(4) || "情報なし";
        const depth = coordinates[2]?.toFixed(2) || "情報なし";

        // マグニチュードの変換
        const magnitude =
          props.mag !== undefined ? props.mag.toFixed(2) : "情報なし";
const cdi = props.cdi || "情報なし"; // 最大震度（CDI）
const mmi = props.mmi || "情報なし"; // 最大震度（MMI）
if (cdi >= mmi) {
          props.intensity = cdi; // CDIがMMI以上の場合はCDIを使用
        } else if (cdi < mmi) {
          props.intensity = mmi; // CDIがMMI未満の場合は推定震度" + mmi; // MMIを使用
} else {
          props.intensity = null; // どちらも情報なしの場合は"情報なし"を使用
}
        // 統一構造に変換
        combinedData.usgsData.push({
          type: "usgs",
          Title: props.title,
          time: time.toLocaleString(),
          updateTime: updateTime.toLocaleString(),
          location: props.place,
          magnitude: magnitude,
          magtype: props.magType || "M", // マグニチュードタイプ
          intensity: props.intensity || "情報なし", // 最大震度（CDI または MMI）
          depth: depth,
          lat: lat,
          lng: lon,
          displayType: "eq",
          source: "usgs",
        });
      });
    }

    usgsLastUpdate = new Date();
    updateCombinedDisplay();
  } catch (error) {
    console.error("USGS データ取得エラー:", error);
  }
}

// 中央気象署（CWA）地震情報取得
async function fetchCwaData() {
  try {
    const response = await fetch(
      `https://opendata.cwa.gov.tw/api/v1/rest/datastore/E-A0015-002?Authorization=${CWA_API_KEY}&format=JSON`
    );
    const data = await response.json();

    console.log("CWAデータ受信:", data);
    // 既存データをクリア
    combinedData.cwaEqList = [];

    // features を抽出
    if (data && Array.isArray(data.records.Earthquake)) {
      data.records.Earthquake.forEach((item) => {
        const EarthquakeInfo = item.EarthquakeInfo;

        const time = new Date(EarthquakeInfo.OriginTime);
        const ReportType = item.ReportType || "情報なし";

        const magnitude =
          EarthquakeInfo.EarthquakeMagnitude.MagnitudeValue.toFixed(1) ||
          "情報なし";
        const depth = EarthquakeInfo.FocalDepth;
        const location = EarthquakeInfo.Epicenter.Location;
        const lat =
          EarthquakeInfo.Epicenter.EpicenterLatitude.toFixed(4) || "情報なし";
        const lon =
          EarthquakeInfo.Epicenter.EpicenterLongitude.toFixed(4) || "情報なし";

        const ReportContent = item.ReportContent || "情報なし";
        const match = ReportContent.match(/Highest intensity was \d+/);
        let highestIntensity = "";
        if (match) {
          highestIntensity = match[0];
          const intensity = highestIntensity.match(/\d+/)?.[0] || "情報なし";
          combinedData.cwaEqList.push({
            type: "cwa",
            Title: ReportType,
            time: time.toLocaleString(),
            location: location,
            magnitude: magnitude,
            depth: depth,
            intensity: intensity,
            lat: lat,
            lng: lon,
            displayType: "eq",
            source: "cwa",
          });
        }
      });
    }

    lastUpdateTimes.cwaEq = new Date();
    updateCombinedDisplay();
  } catch (error) {
    console.error("CWAデータ取得エラー:", error);
  }
}

//中央気象署（CWA）小区域地震情報取得
async function fetchCwaTinyData() {
  try {
    const response = await fetch(
      `https://opendata.cwa.gov.tw/api/v1/rest/datastore/E-A0016-002?Authorization=${CWA_API_KEY}&format=JSON`
    );
    const data = await response.json();

    console.log("CWAデータ受信:", data);
    // 既存データをクリア
    combinedData.cwaEqList_tiny = [];

    // features を抽出
    if (data && Array.isArray(data.records.Earthquake)) {
      data.records.Earthquake.forEach((item) => {
        const EarthquakeInfo = item.EarthquakeInfo;

        const time = new Date(EarthquakeInfo.OriginTime);
        const ReportType = item.ReportType || "情報なし";

        const magnitude = EarthquakeInfo.EarthquakeMagnitude.MagnitudeValue;
        const depth = EarthquakeInfo.FocalDepth;
        const location = EarthquakeInfo.Epicenter.Location;
        const lat =
          EarthquakeInfo.Epicenter.EpicenterLatitude.toFixed(4) || "情報なし";
        const lon =
          EarthquakeInfo.Epicenter.EpicenterLongitude.toFixed(4) || "情報なし";

        const ReportContent = item.ReportContent || "情報なし";
        const match = ReportContent.match(/Highest intensity was \d+/);
        let highestIntensity = "";
        if (match) {
          highestIntensity = match[0];
          const intensity = highestIntensity.match(/\d+/)?.[0] || "情報なし";
          combinedData.cwaEqList_tiny.push({
            type: "cwa_tiny",
            Title: ReportType,
            time: time.toLocaleString(),
            location: location,
            magnitude: magnitude,
            depth: depth,
            intensity: intensity,
            lat: lat,
            lng: lon,
            displayType: "eq",
            source: "cwa_tiny",
          });
        }
      });
    }
  } catch (error) {
    console.error("CWA小区域データ取得エラー:", error);
  }
}

// 初期テーマの読み込み
function loadTheme() {
  const savedTheme = localStorage.getItem("theme") || "light";
  document.body.classList.toggle("dark-mode", savedTheme === "dark");
  document.getElementById("themeToggle").textContent =
    savedTheme === "dark" ? "ライトモード" : "ダークモード";
}
function applyTheme(theme) {
  document.body.classList.toggle("dark-mode", theme === "dark");
  localStorage.setItem("theme", theme);
  document.getElementById("themeToggle").textContent =
    theme === "dark" ? "ライトモード" : "ダークモード";
}
// テーマ切替ボタンのイベントリスナー
document.getElementById("themeToggle").addEventListener("click", () => {
  document.body.classList.toggle("dark-mode");

  // 現在のテーマを保存
  const currentTheme = document.body.classList.contains("dark-mode")
    ? "dark"
    : "light";
  localStorage.setItem("theme", currentTheme);

  // ボタンテキストを更新
  document.getElementById("themeToggle").textContent =
    currentTheme === "dark" ? "ライトモード" : "ダークモード";
});

// 初期テーマの設定
loadTheme();

// 震度ラベル取得関数（CWAにも対応）
function getIntersityNumber(intensity) {
  if (!intensity) return "";

  let level = "";
  let text = "";

  if (typeof intensity === "string") {
    // ローマ数字対応（例: "III"）
    if (intensity === "I") {
      level = "level-1";
      text = "I";
    } else if (intensity === "II") {
      level = "level-2";
      text = "II";
    } else if (intensity === "III") {
      level = "level-3";
      text = "III";
    } else if (intensity === "IV") {
      level = "level-4";
      text = "IV";
    } else if (intensity === "V") {
      level = "level-5";
      text = "V";
    } else if (intensity === "VI") {
      level = "level-6";
      text = "VI";
    } else if (intensity === "VII") {
      level = "level-7";
      text = "VII";
    } else if (intensity === "VIII") {
      level = "level-8";
      text = "VIII";
    } else if (intensity === "IX") {
      level = "level-9";
      text = "IX";
    } else if (intensity === "X") {
      level = "level-10";
      text = "X";
    } else if (intensity === "弱") {
      level = "weak";
      text = "弱";
    } else if (intensity === "強") {
      level = "strong";
      text = "強";
    } else if (!isNaN(intensity)) {
      const num = parseFloat(intensity);
      const isDecimal = num % 1 !== 0;

      if (isDecimal) {
        level = `level-${num.toFixed(1)}`;
        text = num.toFixed(1);
      } else {
        level = `level-${Math.floor(num)}`;
        text = Math.floor(num).toString();
      }
    } else {
      return "";
    }
  } else if (typeof intensity === "number") {
    const isDecimal = intensity % 1 !== 0;

    if (isDecimal) {
      level = `level-${intensity.toFixed(1)}`;
      text = intensity.toFixed(1);
    } else {
      level = `level-${Math.floor(intensity)}`;
      text = Math.floor(intensity).toString();
    }
  } else {
    return "";
  }

  return `<span class="intensity-label ${level}">${text}</span>`;
}
// 深さを数値に変換（ソート用）
function getDepthNumber(Depth) {
  if (!Depth || Depth === "情報なし") return 0;

  const numStr = Depth.replace(/[^\d.]/g, "");
  const num = parseFloat(numStr);
  return isNaN(num) ? 0 : num;
}

function getMagnitudeInteger(magnitude) {
  // magnitude が null, undefined, 空文字の場合は 0 を返す
  if (magnitude === null || magnitude === undefined || magnitude === "") {
    return 0;
  }

  // すでに数値型であれば、整数に変換
  if (typeof magnitude === "number") {
    return Math.floor(Math.abs(magnitude)); // 負数の場合は絶対値を取る
  }

  // 文字列型の場合、数値に変換を試みる
  if (typeof magnitude === "string") {
    // "M5.4" のような形式から数値部分を抽出
    const match = magnitude.match(/[\d.]+/);
    if (match) {
      const num = parseFloat(match[0]);
      if (!isNaN(num)) {
        return Math.floor(Math.abs(num)); // 負数の場合は絶対値を取る
      }
    }
    // 数値部分が抽出できない場合、0 を返す
    return 0;
  }

  // その他の型の場合は 0 を返す
  return 0;
}

function getIntensityInteger(intensity) {
  // intensity が null, undefined, 空文字の場合は 0 を返す
  if (intensity === null || intensity === undefined || intensity === "") {
    return 0;
  }

  // すでに数値型であれば、整数に変換
  if (typeof intensity === "number") {
    return Math.floor(Math.abs(intensity)); // 負数の場合は絶対値を取る
  }

  // 文字列型の場合、数値に変換を試みる
  if (typeof intensity === "string") {
    // "V" や "VI" のような形式から数値部分を抽出
    const romanToNumber = {
      I: 1,
      II: 2,
      III: 3,
      IV: 4,
      V: 5,
      VI: 6,
      VII: 7,
      VIII: 8,
      IX: 9,
      X: 10,
    };
    if (intensity in romanToNumber) {
      return romanToNumber[intensity];
    }
  }

  return 0;
}

// 震度ラベル取得関数（小数値か整数値かで分岐）
function getIntersityLabel(intensity) {
  if (!intensity) return "";

  let level = "";
  let text = "";

  if (typeof intensity === "string") {
    // ローマ数字対応（例: "III"）
    if (intensity === "I") {
      level = "level-1";
      text = "I";
    } else if (intensity === "II") {
      level = "level-2";
      text = "II";
    } else if (intensity === "III") {
      level = "level-3";
      text = "III";
    } else if (intensity === "IV") {
      level = "level-4";
      text = "IV";
    } else if (intensity === "V") {
      level = "level-5";
      text = "V";
    } else if (intensity === "VI") {
      level = "level-6";
      text = "VI";
    } else if (intensity === "VII") {
      level = "level-7";
      text = "VII";
    } else if (intensity === "VIII") {
      level = "level-8";
      text = "VIII";
    } else if (intensity === "IX") {
      level = "level-9";
      text = "IX";
    } else if (intensity === "X") {
      level = "level-10";
      text = "X";
    }

    // 弱/強に対応
    else if (intensity === "弱") {
      level = "weak";
      text = "弱";
    } else if (intensity === "強") {
      level = "strong";
      text = "強";

      const match = intensity.match(/([1-9]\.?5?)/);
      if (match) return parseFloat(match[1]);
    } else if (typeof intensity === "number") {
      return intensity;
    }

    // 数値（小数含む）に対応
    else if (!isNaN(intensity)) {
      const num = parseFloat(intensity);
      const isDecimal = num % 1 !== 0;

      // 小数値の場合はlevel-5.5などの形式
      if (isDecimal) {
        level = `level-${num}`;
        text = num.toFixed(1); // 例: 5.5 → "5.5"
      } else {
        level = `level-${Math.floor(num)}`;
        text = Math.floor(num).toString(); // 例: 5 → "5"
      }
    } else {
      return "";
    }
  } else if (typeof intensity === "number") {
    const isDecimal = intensity % 1 !== 0;

    // 小数値の場合はlevel-5.5などの形式
    if (isDecimal) {
      level = `level-${intensity.toFixed(0)}`;
      text = intensity.toFixed(2);
    } else {
      level = `level-${Math.floor(intensity)}`;
      text = Math.floor(intensity).toString();
    }
  } else {
    //level = "";
    text = "不明";
    return "";
  }

  return `<span class="intensity-label ${level}">${text}</span>`;
}

// 日本震度ラベル取得関数（小数値か整数値かで分岐）
function getIntersityLabel_j(intensity) {
  if (!intensity) return "";

  let level = "";
  let text = "";

  if (typeof intensity === "string") {
    // ローマ数字対応（例: "III"）
    if (intensity === "I") {
      level = "level-1";
      text = "I";
    } else if (intensity === "II") {
      level = "level-2";
      text = "II";
    } else if (intensity === "III") {
      level = "level-3";
      text = "III";
    } else if (intensity === "IV") {
      level = "level-4";
      text = "IV";
    } else if (intensity === "V") {
      level = "level-5";
      text = "V";
    } else if (intensity === "VI") {
      level = "level-6";
      text = "VI";
    } else if (intensity === "VII") {
      level = "level-7";
      text = "VII";
    } else if (intensity === "VIII") {
      level = "level-8";
      text = "VIII";
    } else if (intensity === "IX") {
      level = "level-9";
      text = "IX";
    } else if (intensity === "X") {
      level = "level-10";
      text = "X";
    }

    // 弱/強に対応
    else if (intensity === "弱") {
      level = "weak";
      text = "弱";
    } else if (intensity === "強") {
      level = "strong";
      text = "強";

      const match = intensity.match(/([1-9]\.?5?)/);
      if (match) return parseFloat(match[1]);
    } else if (typeof intensity === "number") {
      return intensity;
    }

    // 数値（小数含む）に対応
    else if (!isNaN(intensity)) {
      const num = parseFloat(intensity);
      const isDecimal = num % 1 !== 0;

      // 小数値の場合はlevel-5.5などの形式
      if (isDecimal) {
        level = `level-${num}`;
        text = num.toFixed(1); // 例: 5.5 → "5.5"
      } else {
        level = `level-${Math.floor(num)}`;
        text = Math.floor(num).toString(); // 例: 5 → "5"
      }
    } else {
      return "";
    }
  } else if (typeof intensity === "number") {
    const isDecimal = intensity % 1 !== 0;

    // 小数値の場合はlevel-5.5などの形式
    if (isDecimal) {
      level = `level-${intensity.toFixed(1)}`;
      text = intensity.toFixed(1);
    } else {
      level = `level-${Math.floor(intensity)}`;
      text = Math.floor(intensity).toString();
    }
  } else {
  
    return "";
  }

  return `<span class="intensity-label_j ${level}">${text}</span>`;
}

// JMA XMLデータ取得
async function fetchJmaXmlData() {
  try {
    const response = await fetch(
      "https://www.data.jma.go.jp/developer/xml/feed/eqvol.xml "
    );
    const text = await response.text();
    const parser = new DOMParser();
    const xml = parser.parseFromString(text, "text/xml");

    // エントリを抽出
    const entries = xml.querySelectorAll("entry");
    jmaXmlData = [];

    entries.forEach((entry) => {
      const title = entry.querySelector("title")?.textContent || "情報なし";
      const link = entry.querySelector("link")?.getAttribute("href") || "#";
      const published = entry.querySelector("published")?.textContent || "";

      // タイトルから震度情報を抽出（例: "震度3 青森県三沢市" → 震度3）
      const intensityMatch = title.match(/震度([1-7弱強弱中強])/);
      const intensity = intensityMatch ? intensityMatch[1] : "情報なし";

      // 地震情報の構造を統一
      jmaXmlData.push({
        type: "jma_xml",
        Title: title,
        link: link,
        published: published,
        intensity: intensity,
        displayType: "xml",
      });
    });

    jmaXmlLastUpdate = new Date();
    updateCombinedDisplay();
    populateJmaXmlDropdown(); // プルダウンを更新
  } catch (error) {
    console.error("JMA XMLデータ取得エラー:", error);
  }
}

// BMKG地震情報取得（URLの末尾スペースを削除）
async function fetchBmkgData() {
  try {
    const response = await fetch(
      "https://data.bmkg.go.id/DataMKG/TEWS/gempadirasakan.json"
    ); // 修正: URLの末尾スペースを削除
    const data = await response.json();

    // 既存データをクリア
    combinedData.bmkgData = [];

    // 地震情報を抽出
    if (data.Infogempa && Array.isArray(data.Infogempa.gempa)) {
      data.Infogempa.gempa.forEach((item) => {
        if (!item) return;

        // 座標の分割
        const coords = item.Coordinates
          ? item.Coordinates.split(",")
          : ["情報なし", "情報なし"];
        const lat = coords[0] || "情報なし";
        const lon = coords[1] || "情報なし";

        // 震度情報の抽出（ローマ数字を抽出）
        const intensityMatch = item.Dirasakan?.match(
          /([IVX]+|I|II|III|IV|V|VI|VII|VIII|IX|X)\s/g
        );
        const intensity = intensityMatch?.[0]?.trim() || "情報なし";

        const locationMatch = item.Wilayah?.match(
          /Pusat\s*gempa\s*berada\s*di\s*(.*)/iu
        );
        const location = locationMatch?.[1]?.trim() || "情報なし";
        // 地震情報を統一構造に変換
        combinedData.bmkgData.push({
          type: "bmkg",
          Title: "地震情報",
          Tanggal: item.Tanggal,
          Jam: item.Jam,
          time: item.DateTime,
          lat: lat,
          lng: lon,
          magnitude: item.Magnitude,
          depth: item.Kedalaman?.replace(" km", "") || "情報なし",
          location: location,
          intensity: intensity,
          feltDetails: item.Dirasakan,
          displayType: "eq",
          source: "bmkg",
        });
      });
    }

    bmkgLastUpdate = new Date();
    updateCombinedDisplay();
  } catch (error) {
    console.error("BMKGデータ取得エラー:", error);
  }
}

// BMKG M5.0+ 地震情報取得関数
async function fetchBmkg_M5Data() {
  try {
    const response = await fetch(
      "https://data.bmkg.go.id/DataMKG/TEWS/gempaterkini.json"
    ); // 修正: URLの末尾スペースを削除
    const data = await response.json();

    // 既存データをクリア
    combinedData.bmkg_M5Data = [];

    // 地震情報を抽出
    if (data.Infogempa && Array.isArray(data.Infogempa.gempa)) {
      data.Infogempa.gempa.forEach((item) => {
        if (!item) return;

        // 座標の分割
        const coords = item.Coordinates
          ? item.Coordinates.split(",")
          : ["情報なし", "情報なし"];
        const lat = coords[0] || "情報なし";
        const lon = coords[1] || "情報なし";

        // 震度情報の抽出（ローマ数字を抽出）
        const intensityMatch = item.Dirasakan?.match(
          /([IVX]+|I|II|III|IV|V|VI|VII|VIII|IX|X)\s/g
        );
        const intensity = intensityMatch?.[0]?.trim() || "情報なし";

        // 地震情報を統一構造に変換
        combinedData.bmkg_M5Data.push({
          type: "bmkg_m5",
          Title: "M5.0+ 地震情報",
          Tanggal: item.Tanggal,
          Jam: item.Jam,
          time: item.DateTime,
          lat: lat,
          lng: lon,
          magnitude: item.Magnitude,
          depth: item.Kedalaman?.replace(" km", "") || "情報なし",
          location: item.Wilayah,
          tsunamiPotential: item.Potensi, // フィールド名を小文字に統一
          displayType: "eq",
          source: "bmkg_m5",
        });
      });
    }

    bmkg_M5LastUpdate = new Date();
    updateCombinedDisplay(); // 統合表示を更新
  } catch (error) {
    console.error("BMKG M5.0+ データ取得エラー:", error);
  }
}

// 統合地震情報表示更新（最適化版）
function updateCombinedDisplay() {
  // フィルタの取得
  const showJMA = sourceJMA.checked;
  const showSC = sourceSC.checked;
  const showFJ = sourceFJ.checked;
  const showCENC = sourceCENC.checked;
  const showEMSC = sourceEMSC.checked;
  const showJmaXml = sourceJmaXml.checked;
  const showBMKG = sourceBMKG.checked; // 新しいフィルタ
  const showJmaEqList = sourceJmaEqList.checked; // 新しいフィルタ
  const showJmaHypoList = sourceJmaHypo.checked; // 新しいフィルタ
  const showBMKG_M5 = sourceBMKG_M5.checked; // M5.0+ 用フィルタ
  const showCea = sourceCea.checked; // 中国地震局用フィルタ
  const showIcl = sourceIcl.checked; // 成都地震局用フィルタ
  const showUSGS = sourceUSGS?.checked ?? false; // ✅ 新しいチェックボックス
  const showCWA = sourceCWA?.checked; // ✅ 新しいチェックボックス
  const showCWA_Tiny = sourceCWA_tiny?.checked; // ✅ 新しいチェックボックス

  // ソート条件の取得
  const sortCriteria = document.getElementById("sortCriteria").value;
  const sortDirection = document.getElementById("sortDirection").value;

  // すべてのデータを統合
  allData.length = 0;

  // JMA 緊急地震速報
  if (showJMA && combinedData.jmaEew) {
    allData.push(combinedData.jmaEew);
  }

  // 四川地震局 地震警報
  if (showSC && combinedData.scEew) {
    allData.push(combinedData.scEew);
  }

  // 福建地震局 地震警報
  if (showFJ && combinedData.fjEew) {
    allData.push(combinedData.fjEew);
  }
  // 中国地震局（CEA）地震情報 (EEW)
  if (showCea && combinedData.ceaData) {
    // showCea は既存のチェックボックスに対応
    allData.push(combinedData.ceaData);
  }

  // 成都高新防災減災研究所（ICL）地震情報（EEW） (公開ソフトウェアでの使用禁止)
  if (showIcl && combinedData.iclData) {
    // showIcl は既存のチェックボックスに対応
    allData.push(combinedData.iclData);
  }

  // USGS 地震情報
  if (showUSGS && combinedData.usgsData.length > 0) {
    allData.push(...combinedData.usgsData);
  }

  // 中央気象署（台湾）地震情報
  if (showCWA && combinedData.cwaEqList) {
    Object.values(combinedData.cwaEqList).forEach((item) => {
      // typeフィールドを除外
      if (item) {
        allData.push({
          ...item,
          source: "cwa",
          displayType: "eq",
        });
      }
    });
  }

  // 中央気象署（台湾）小区域地震情報
  if (showCWA_Tiny && combinedData.cwaEqList_tiny) {
    Object.values(combinedData.cwaEqList_tiny).forEach((item) => {
      // typeフィールドを除外
      if (item) {
        allData.push({
          ...item,
          source: "cwa_tiny",
          displayType: "eq",
        });
      }
    });
  }
  // JMA 地震情報リスト
  if (showJmaEqList && combinedData.jmaEqList) {
    Object.values(combinedData.jmaEqList).forEach((item) => {
      // typeフィールドを除外
      if (item && item.Title) {
        allData.push({
          ...item,
          source: "jma",
          displayType: "eq",
        });
      }
    });
  }

  // 中国地震台網 地震情報
  if (showCENC && combinedData.cencEqList) {
    Object.values(combinedData.cencEqList).forEach((item) => {
      if (item && item.type !== "reviewed") return;
      allData.push(item);
    });
  }

  // EMSC 地震情報
  if (showEMSC && combinedData.emscEqList) {
    Object.values(combinedData.emscEqList).forEach((item) => {
      // ✅ item が存在し、かつ source が "emsc" のものだけを追加
      if (item && item.source === "emsc") {
        // <-- ここを修正
        allData.push(item);
      }
    });
  }

  // JMA XMLデータ
  if (showJmaXml && jmaXmlData.length > 0) {
    allData.push(...jmaXmlData);
  }

  // BMKG地震情報の追加
  if (showBMKG && combinedData.bmkgData.length > 0) {
    combinedData.bmkgData.forEach((item) => {
      allData.push(item);
    });
  }

  // BMKG地震情報（M5.0+）
  if (showBMKG_M5 && combinedData.bmkg_M5Data.length > 0) {
    combinedData.bmkg_M5Data.forEach((item) => {
      allData.push(item);
    });
  }
  // 気象庁 GeoJSON 地震情報 (Hypo) の追加
  if (showJmaHypoList && combinedData.jmaHypoData) {
    combinedData.jmaHypoData.forEach((item) => {
      // 必要に応じてフィルタリングや変換をここで行う
      // 例: 特定のマグニチュード以上のみ表示 etc.
      // if (item.magnitude >= 3.0) { // 例: M3.0以上のみ
      allData.push(item);
      // }
    });
  }
  // ソート処理
  allData.sort((a, b) => {
    let valueA = null;
    let valueB = null;

    switch (sortCriteria) {
      case "time":
        valueA = new Date(
          a.OriginTime || a.time || a.ReportTime || a.published
        );
        valueB = new Date(
          b.OriginTime || b.time || b.ReportTime || b.published
        );
        break;

      case "magnitude":
        valueA = parseFloat(a.Magunitude || a.magnitude || "0");
        valueB = parseFloat(b.Magunitude || b.magnitude || "0");
        break;

      case "intensity":
        valueA = getIntersityNumber(
          a.MaxIntensity || a.intensity || "情報なし"
        );
        valueB = getIntersityNumber(
          b.MaxIntensity || b.intensity || "情報なし"
        );
        break;

      case "depth":
        valueA = getDepthNumber(a.Depth || a.depth || "情報なし");
        valueB = getDepthNumber(b.Depth || b.depth || "情報なし");
        break;

      default:
        valueA = new Date(
          a.OriginTime || a.time || a.ReportTime || a.published
        );
        valueB = new Date(
          b.OriginTime || b.time || b.ReportTime || b.published
        );
    }

    // ソート方向
    if (sortDirection === "desc") {
      return valueB - valueA;
    } else {
      return valueA - valueB;
    }
  });

  // 表示更新
  combinedEqList.innerHTML = "";
  // 関数を呼び出して地図を表示
  // === 修正箇所 3 (オプション): 地図マーカーの更新条件を確認 ===
  // 関数を呼び出して地図を表示 (地図が初期化されており、かつ tab2 がアクティブな場合のみ)
  const isTab2Active = document
    .getElementById("tab2")
    ?.classList.contains("active");

  if (map && isTab2Active) {
    // ✅ map が存在し、かつ tab2 がアクティブな場合のみ実行
    console.log(
      "updateCombinedDisplay: 地図にマーカーを表示します (tab2 アクティブ)"
    );
    initMapWithMarkers(map, combinedData);
  } else if (map) {
    //console.log(
    //   "updateCombinedDisplay: 地図は初期化されていますが、tab2 は非アクティブです。マーカー更新をスキップします。"
    //);
    // オプション: tab2 が非アクティブな場合でも、地図のデータ（マーカー）だけは更新しておきたい場合
    // （ただし表示はされない）。これはパフォーマンス的に微妙な場合もあるので注意。
    // 例えば、次に tab2 を開いたときに最新のマーカーが表示されるようにしたい場合。
    // その場合は、以下のように条件を緩和できます:
    // initMapWithMarkers(map, combinedData); // map があるなら更新
  } else {
    // map が未初期化 (tab2 がまだ開かれていないなど)
    console.log(
      "updateCombinedDisplay: 地図が初期化されていないため、マーカー表示をスキップします。"
    );
  }
  if (allData.length === 0) {
    combinedEqList.innerHTML = "<p class='no-data'>地震情報がありません</p>";
    combinedStatus.textContent = "最新更新: データがありません";
    return;
  }
  const countElement = document.getElementById("count");

  // アイテム数を表示
  countElement.textContent = allData.length;

  const activeTabId = document.querySelector(".tab-content.active")?.id;
  if (activeTabId === "tab2.1") {
    var preactive = "tab2_1"; // 初期値を設定
  } else if (activeTabId === "tab2.2") {
    var preactive = "tab2_2"; // 初期値を設定
  }

  if (activeTabId === "tab2.1" && preactive !== "tab2_1") {
    preactive = "tab2_1";
    console.log("データ更新: tab2.1 がアクティブのためグラフを更新します");
    updatePlotlyGraph("plotly-graph-2-1"); // ✅ 関数名とIDを一致させる
  } else if (activeTabId === "tab2.2" && preactive !== "tab2_2") {
    preactive = "tab2_2";
    console.log("データ更新: tab2.2 がアクティブのため球面グラフを更新します");
    updatePlotlySphereGraph("plotly-graph-2-2"); // ✅ 関数名とIDを一致させる
  }
  // 各項目を表示
  allData.forEach((item, index) => {
    const container = document.createElement("div");
    container.className = "earthquake-item";

    let html = "";
    html += `<div class ="stat-card">`;
    html += `<div class ="stat-card-${getMagnitudeInteger(item.magnitude)}">`;

    html += `<div class = "no-badge">No. ${index + 1}</div>`;

    // 中央気象署（台湾）(tiny含む)地震情報
    if (
      (item.source === "cwa" || item.source === "cwa_tiny") &&
      item.displayType === "eq"
    ) {
      html += `<h3>M ${item.magnitude} - ${item.location}</h3>`;
      html += `<p class="time">発生時刻: ${item.time}</p>`;
      //html += `<p class="location">震源地: ${item.location}</p>`;
      //html += `<p>マグニチュード: ${item.magnitude}</p>`;
      html += `<p>最大震度: ${getIntersityLabel_j(item.intensity)}</p>`;
      html += `<p>深さ: ${item.depth} km</p>`;
      //html += `<p>緯度: ${item.lat}, 経度: ${item.lng}</p>`;
      html += `<p class="source">情報源: 中央気象署（台湾）</p>`;
    }

    // USGS 地震情報
    if (item.source === "usgs" && item.displayType === "eq") {
      html += `<h3>${item.magtype} ${item.magnitude} - ${item.location}</h3>`;
      //html += `<h3>${item.Title}</h3>`;
      html += `<p class="time">発生時刻: ${item.time}</p>`;
      //html += `<p class="time">最終更新: ${item.updateTime}</p>`;
      //html += `<p class="location">震源地: ${item.location}</p>`;
      //html += `<p>マグニチュード: ${item.magnitude}</p>`;
html += `<p>最大震度: ${getIntersityLabel(item.intensity)}</p>`;
      html += `<p>深さ: ${item.depth} km</p>`;
      // html += `<p>緯度: ${item.lat}, 経度: ${item.lng}</p>`;
      html += `<p class="source">情報源: USGS</p>`;
    }
    // BMKG地震情報
    if (item.source === "bmkg" && item.displayType === "eq") {
      html += `<h3>M ${item.magnitude} - ${item.location}</h3>`;
      html += `<p class="time">発生時刻: ${item.Tanggal} ${item.Jam}</p>`;
      //html += `<p class="location">震源地: ${item.location}</p>`;
      html += `<p>マグニチュード: ${item.magnitude}</p>`;

      // 震度表示
      if (item.intensity && item.intensity !== "情報なし") {
        html += `<p>最大震度: ${getIntersityLabel(item.intensity)}</p>`;
        html += `<p>深さ: ${item.depth} km</p>`;
      }

      // 感じた地域の詳細
      if (item.feltDetails) {
        html += `<h4>影響地域</h4>`;
        html += `<div style="margin-left: 20px;">`;
        html += `<p>${item.feltDetails}</p>`;
        html += `</div>`;
      }

      html += `<p class="source">情報源: インドネシア気象庁（BMKG）</p>`;
    }

    // BMKG M5.0+ 地震情報
    if (item.source === "bmkg_m5" && item.displayType === "eq") {
      html += `<h3>M ${item.magnitude} - ${item.location}</h3>`;
      html += `<p class="time">発生時刻: ${item.Tanggal} ${item.Jam}</p>`;
      //html += `<p class="location">震源地: ${item.location}</p>`;
      //html += `<p>マグニチュード: ${item.magnitude}</p>`;
      html += `<p>深さ: ${item.depth} km</p>`;

      // 津波の可能性（Potensi → tsunamiPotential）
      html += `<p>津波の可能性: ${item.tsunamiPotential}</p>`;
      html += `<p class="source">情報源: インドネシア気象庁（BMKG M5.0+）</p>`;
    }

    // JMA地震情報リスト
    if (item.source === "jma" && item.displayType === "eq") {
      html += `<h3>M ${item.magnitude} - ${item.location}</h3>`;
      html += `<p class="time">発生時刻: ${item.time_full}</p>`;
      //html += `<p class="location">震源地: ${item.location}</p>`;
      //html += `<p>マグニチュード: ${item.magnitude}</p>`;

      if (item.shindo) {
        html += `<p>最大震度: ${getIntersityLabel_j(item.shindo)}</p>`;
      } else if (item.intensity) {
        html += `<p>最大烈度: ${getIntersityLabel(item.intensity)}</p>`;
      }

      html += `<p>深さ: ${item.depth} </p>`;
      //html += `<p>緯度: ${item.latitude}, 経度: ${item.longitude}</p>`;

      html += `<p class="source">情報源: 日本気象庁</p>`;
    }

    // XMLデータ表示
    if (item.displayType === "xml") {
      html += `<h3><a href="${item.link}" target="_blank">${item.Title}</a></h3>`;
      html += `<p class="time">発表時刻: ${formatJmaXmlTime(
        item.published
      )}</p>`;

      // 震度表示（震度情報がある場合）
      if (item.intensity !== "情報なし") {
        html += `<p>最大震度: ${getIntersityLabel_j(item.intensity)}</p>`;
      }

      html += `<p class="source">情報源: 気象庁 XMLフィード</p>`;
    }
    // JMA緊急地震速報表示
    else if (item.type === "jma_eew") {
      if (item.MaxIntensity) {
        html += `<h3>${item.Title}</h3>`;
      } else if (item.intensity) {
        html += `<h3>${item.location}</h3>`;
      }

      html += `<p class="time">発生時刻: ${item.OriginTime}</p>`;
      html += `<p class="time">発表時刻: ${item.AnnouncedTime}</p>`;
      html += `<p class="location">震源地: ${
        item.Hypocenter || item.HypoCenter
      }</p>`;
      html += `<p>マグニチュード: ${item.Magunitude}</p>`;
      // 震度表示
      if (item.MaxIntensity) {
        html += `<p>最大震度: ${getIntersityLabel_j(item.MaxIntensity)}</p>`;
        html += `<p>深さ: ${item.Depth || "情報なし"} km</p>`;
        html += `<p class="source">情報源: 日本気象庁</p>`;
      } else if (item.intensity) {
        html += `<p>最大烈度: ${getIntersityLabel(item.intensity)}</p>`;
        html += `<p>深さ: ${item.depth || "情報なし"} km</p>`;
        html += `<p class="source">情報源: 中国地震台網</p>`;
      }
    }
    // JMA地震情報リスト表示
    else if (item.type === "automatic") {
      if (item.MaxIntensity) {
        html += `<h3>${item.magnitude}${item.location}</h3>`;
      } else if (item.intensity) {
        html += `<h3>M ${item.magnitude} - ${item.location}</h3>`;
      }
      html += `<p class="time">発生時刻: ${item.time_full || item.time}</p>`;
      // html += `<p class="location">震源地: ${item.location}</p>`;
      //html += `<p>マグニチュード: ${item.magnitude}</p>`;

      // 震度表示
      if (item.shindo) {
        html += `<p>最大震度: ${getIntersityLabel_j(item.shindo)}</p>`;
        html += `<p class="source">情報源: 日本気象庁</p>`;
      } else if (item.intensity) {
        html += `<p>最大烈度: ${getIntersityLabel(item.intensity)}</p>`;
        html += `<p>深さ: ${item.depth || "情報なし"} km</p>`;
        html += `<p class="source">情報源: 中国地震台網</p>`;
      }
    }

    // 四川地震局 地震警報表示
    else if (item.type === "sc_eew") {
      html += `<h3>地震警報</h3>`;
      html += `<p class="time">発生時刻: ${item.OriginTime}</p>`;
      html += `<p class="time">発表時刻: ${item.ReportTime}</p>`;
      html += `<p class="location">震源地: ${item.HypoCenter}</p>`;
      html += `<p>マグニチュード: ${item.Magunitude}</p>`;

      // 小数震度を正しく表示
      if (item.MaxIntensity) {
        html += `<p>最大烈度: ${getIntersityLabel(item.MaxIntensity)}</p>`;
      }

      html += `<p class="source">情報源: 四川地震局</p>`;
    }

    // 福建地震局 地震警報
    else if (item.type === "fj_eew") {
      html += `<h3>地震警報</h3>`;
      html += `<p class="time">発生時刻: ${item.OriginTime}</p>`;
      html += `<p class="time">発表時刻: ${item.ReportTime}</p>`;
      html += `<p class="location">震源地: ${item.HypoCenter}</p>`;
      html += `<p>マグニチュード: ${item.Magunitude}</p>`;
      html += `<p class="source">情報源: 福建地震局</p>`;
    }

    // 中国地震局（CEA）地震情報
    if (item.source === "cea" && item.displayType === "eq") {
      html += `<h3>中国地震局（CEA）</h3>`;
      html += `<p class="time">発生時刻: ${item.shockTime}</p>`;
      html += `<p class="location">震源地: ${item.placeName}</p>`;
      html += `<p>マグニチュード: ${item.magnitude}</p>`;

      if (item.epiIntensity > 0) {
        html += `<p>最大烈度: ${getIntersityLabel(item.epiIntensity)}</p>`;
      }

      html += `<p>深さ: ${item.depth} km</p>`;
      html += `<p class="source">情報源: 中国地震局（CEA）</p>`;
    }

    // 成都高新防災減災研究所（ICL）地震情報（公開ソフトウェアでの使用禁止）
    else if (item.source === "icl" && item.displayType === "eq") {
      html += `<h3>成都高新防災減災研究所（ICL）</h3>`;
      html += `<p class="time">発生時刻: ${item.shockTime}</p>`;
      html += `<p class="time">発表時刻: ${item.updateTime}</p>`;
      html += `<p class="location">震源地: ${item.placeName}</p>`;
      html += `<p>マグニチュード: ${item.magnitude}</p>`;

      if (item.epiIntensity > 0) {
        html += `<p>最大烈度: ${getIntersityLabel(item.epiIntensity)}</p>`;
      }

      html += `<p>深さ: ${item.depth} km</p>`;
      html += `<p>ステーション数: ${item.sations}</p>`;
      html += `<p class="source">情報源: 成都高新防災減災研究所（ICL）</p>`;
    }

    // 中国地震台網 地震情報
    else if (item.type === "reviewed") {
      let utcShockTimeObj = null;
let displayShockTimeStr = "日時不明";
if (item && item.time) {
    utcShockTimeObj = parseLocalTimeToUTCDate(item.time, 8); // 中国時間 (UTC+8)
    displayShockTimeStr = utcShockTimeObj ? formatUTCDateToJSTString(utcShockTimeObj) : "日時不明";
}
      if (item.MaxIntensity) {
        html += `<h3>${item.magnitude}${item.location}</h3>`;
      } else if (item.intensity) {
        html += `<h3>M ${item.magnitude} - ${item.location}</h3>`;
      }
      html += `<p class="">発生時刻: ${displayShockTimeStr}</p>`;
      // html += `<p class="location">震源地: ${item.location}</p>`;
      //html += `<p>マグニチュード: ${item.magnitude}</p>`;

      // 震度表示
      if (item.shindo) {
        html += `<p>最大震度: ${getIntersityLabel_j(item.shindo)}</p>`;
        html += `<p class="source">情報源: 日本気象庁</p>`;
      } else if (item.intensity) {
        html += `<p>最大烈度: ${getIntersityLabel(item.intensity)}</p>`;
        html += `<p>深さ: ${item.depth || "情報なし"} km</p>`;
        html += `<p class="source">情報源: 中国地震台網</p>`;
      }
    }

    // EMSC 地震情報リスト
    else if (item.source === "emsc" && item.displayType === "eq") {
      // <-- 新しい条件: source と displayType をチェック
      // updateEmscEqList で変換された統一構造のプロパティを使用
      html += `<h3>${item.magtype} ${item.magnitude} - ${item.location}</h3>`; // <-- item.Title, item.location
      html += `<p class="time">発生時刻: ${item.time || "情報なし"}</p>`; // <-- item.time
      html += `<p>深さ: ${item.depth || "情報なし"} km</p>`; // <-- item.depth
      // 緯度経度を表示したい場合は以下を追加
      // html += `<p>緯度: ${item.lat || "情報なし"}, 経度: ${item.lng || "情報なし"}</p>`; // <-- item.lat, item.lng
      html += `<p class="source">情報源: EMSC (${item.auth || ""})</p>`; // <-- item.source を使うことも可能: `情報源: ${item.source.toUpperCase()}`
    }

    //jmaHypoData
    else if (item.source === "jma_geojson") {
      // html += `<h3>${item.Title}</h3>`;
      html += `<h3>M${item.magtype} ${item.magnitude} - ${item.location}</h3>`;
      html += `<p class="time">発生時刻: ${item.time}</p>`;
      html += `<p>深さ: ${item.depth} km</p>`;
      html += `<p class="source">情報源: 気象庁 GeoJSON</p>`;
      //html += `<p>緯度: ${item.lat || "情報なし"}, 経度: ${item.lng || "情報なし"}</p>`;
    }
    // 取消報表示
    if ((item.isCancel || item.Cancel) && item.type !== "jma_xml") {
      html = `<p class="source">【取消報】</p>${html}`;
    }

    container.innerHTML = html;
    combinedEqList.appendChild(container);
  });

  // 最終更新時刻を更新
  const latestTime = new Date(
    Math.max(...Object.values(lastUpdateTimes).filter((time) => time !== null))
  );
  combinedStatus.textContent = `最新更新: ${formatTimeAgo(latestTime)}`;

  combinedStatus.textContent = `最新更新: ${formatTimeAgo(latestTime)}`;
  checkNewEarthquake(allData); // allData は updateCombinedDisplay 内で作成される統合データ配列
}
// 時刻差フォーマット
function formatTimeAgo(time) {
  if (!time) return "データがありません";

  const now = new Date();
  const diff = Math.floor((now - time) / 1000);

  if (diff < 60) return `${diff} 秒前`;
  if (diff < 3600) return `${Math.floor(diff / 60)} 分前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 時間前`;
  return `${Math.floor(diff / 86400)} 日前`;
}

// JMA XML時間フォーマット
function formatJmaXmlTime(timeStr) {
  if (!timeStr) return "情報なし";

  const date = new Date(timeStr);
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(
    2,
    "0"
  )}/${String(date.getDate()).padStart(2, "0")} ${String(
    date.getHours()
  ).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(
    date.getSeconds()
  ).padStart(2, "0")}`;
}

// JMA XMLデータ取得（初回のみ）
async function initialJmaXmlFetch() {
  await fetchJmaXmlData();
  // 1分後に再取得を試行
  setTimeout(fetchJmaXmlData, 60000);
}

// イベントリスナー

sourceJMA.addEventListener("change", updateCombinedDisplay);
sourceSC.addEventListener("change", updateCombinedDisplay);
sourceFJ.addEventListener("change", updateCombinedDisplay);
sourceCENC.addEventListener("change", updateCombinedDisplay);
sourceEMSC.addEventListener("change", updateCombinedDisplay);
sourceJmaXml.addEventListener("change", updateCombinedDisplay);
sourceBMKG.addEventListener("change", updateCombinedDisplay);
sourceJmaEqList.addEventListener("change", updateCombinedDisplay); // 新しいイベントリスナー
sourceBMKG_M5.addEventListener("change", fetchBmkg_M5Data); // 新しいイベントリスナー
sourceJmaHypo.addEventListener("change", updateCombinedDisplay); // JMA Hypoチェックボックスのイベントリスナー
// イベントリスナー（正しく変数名を使用）

sourceCea.addEventListener("change", () => {
  if (sourceCea.checked) connectCea();
  updateCombinedDisplay();
});

sourceIcl.addEventListener("change", () => {
  if (sourceIcl.checked) connectIcl();
  updateCombinedDisplay();
});

// チェックボックスイベントリスナー（USGS）
sourceUSGS.addEventListener("change", () => {
  if (sourceUSGS.checked) fetchUsgsData(); // ✅ USGSデータを再取得
  updateCombinedDisplay(); // ✅ 統合表示更新
});

// イベントリスナー（CWAチェックボックス）

sourceCWA.addEventListener("change", () => {
  if (sourceCWA.checked) fetchCwaData(); // ✅ CWAデータを再取得
  updateCombinedDisplay(); // ✅ 統合表示更新
});

// イベントリスナー（CWA Tinyチェックボックス）
sourceCWA_tiny.addEventListener("change", () => {
  if (sourceCWA_tiny.checked) fetchCwaTinyData(); // ✅ CWA Tinyデータを再取得
  updateCombinedDisplay(); // ✅ 統合表示更新
});

//jmahypoData
sourceJmaHypo.addEventListener("change", () => {
  if (sourceJmaHypo.checked) fetchJmaHypoData(HypoDate); // JMA Hypoデータを再取得
  updateCombinedDisplay(); // 統合表示更新
});
// 自動取得間隔の変更イベント
intervalInput.addEventListener("change", () => {
  if (autoFetchInterval) {
    startAutoFetch();
  }
});

// ボタンイベントリスナー
startButton.addEventListener("click", startAutoFetch);
stopButton.addEventListener("click", stopAutoFetch);

// チェックボックスイベントリスナー
sourceBMKG_M5.addEventListener("change", () => {
  fetchBmkg_M5Data();
  updateCombinedDisplay();
});
// JMA 緊急地震速報表示更新
function updateJmaEewDisplay(data) {
  if (data.isCancel) {
    combinedData.jmaEew = null;
  } else {
    combinedData.jmaEew = data;
  }
  lastUpdateTimes.jmaEew = new Date();
  updateCombinedDisplay();
}

// 四川地震局 地震警報表示更新
function updateScEewDisplay(data) {
  if (data.Cancel) {
    combinedData.scEew = null;
  } else {
    combinedData.scEew = data;
  }
  lastUpdateTimes.scEew = new Date();
  updateCombinedDisplay();
}

// 福建地震局 地震警報表示更新
function updateFjEewDisplay(data) {
  if (data.isCancel) {
    combinedData.fjEew = null;
  } else {
    combinedData.fjEew = data;
  }
  lastUpdateTimes.fjEew = new Date();
  updateCombinedDisplay();
}

// 中国地震局 地震警報表示更新
function updateCeaEewDisplay(data) {
  const combinedEqlist = document.getElementById("ceaList");
  ceaList.innerHTML = "";

  if (!data) {
    ceaList.innerHTML = "<p>地震情報がありません</p>";
    return;
  }

  // 地震情報を統一構造に変換
  ceaData = {
    type: "cea_eew",
    Title: "中国地震局（CEA）",
    shockTime: data.shockTime,
    updateTime: data.updateTime,
    placeName: data.placeName,
    magnitude: data.magnitude,
    epiIntensity: data.epiIntensity,
    depth: data.depth,
    lat: data.langitude,
    lng: data.latitude,
    displayType: "eq",
    source: "cea",
  };

  combinedData.ceaData = ceaData; // combinedData に格納
  ceaLastUpdate = new Date();
  updateCombinedDisplay(); // 統合表示を更新
}

// 成都地震局 地震警報表示更新
function updateIclEewDisplay(data) {
  const iclList = document.getElementById("iclList");
  iclList.innerHTML = "";

  if (!data) {
    iclList.innerHTML = "<p>地震情報がありません</p>";
    return;
  }

  // 地震情報を統一構造に変換
  iclData = {
    type: "icl_eew",
    Title: "成都高新防災減災研究所（ICL）",
    shockTime: data.shockTime,
    updateTime: data.updateTime,
    placeName: data.placeName,
    magnitude: data.magnitude,
    epiIntensity: data.epiIntensity,
    depth: data.depth,
    sations: data.sations,
    displayType: "eq",
    source: "icl",
  };

  const container = document.createElement("div");
  container.className = "earthquake-item";
  container.innerHTML = `
        <h3>${iclData.Title}</h3>
        <p class="time">発生時刻: ${iclData.shockTime}</p>
        <p class="time">発表時刻: ${iclData.updateTime}</p>
        <p class="location">震源地: ${iclData.placeName}</p>
        <p>マグニチュード: ${iclData.magnitude}</p>
        
        ${
          iclData.epiIntensity > 0
            ? `<p>最大烈度: ${getIntersityLabel(iclData.epiIntensity)}</p>`
            : ""
        }
        
        <p>深さ: ${iclData.depth} km</p>
        <p>ステーション数: ${iclData.sations}</p>
        <p class="source">情報源: 成都高新防災減災研究所（ICL）</p>
    `;
  iclList.appendChild(container);
  iclLastUpdate = new Date();
  updateCombinedDisplay(); // ✅ 統合表示を更新
}

// JMA 地震情報リスト表示更新（typeフィールドを除外）
function updateJmaEqList(data) {
  jmaEqList.innerHTML = "";

  if (!data || typeof data !== "object" || Object.keys(data).length === 0) {
    jmaEqList.innerHTML = "<p>地震情報がありません</p>";
    combinedData.jmaEqList = null;
    return;
  }

  combinedData.jmaEqList = { ...data };
  delete combinedData.jmaEqList.md5;
  delete combinedData.jmaEqList.Pond;
}
// 中国地震台網 地震情報表示更新
function updateCencEqList(data) {
  combinedData.cencEqList = {};

  for (let i = 1; i <= 50; i++) {
    const key = `No${i}`;
    if (data[key] && data[key].type === "reviewed") {
      combinedData.cencEqList[key] = data[key];
    }
  }

  lastUpdateTimes.cencEq = new Date();
  updateCombinedDisplay();
}

function connectBmkg() {
  // BMKGはHTTPで取得するため、WebSocketは不要
  fetchBmkgData();

  // 定期的に取得
  if (autoFetchInterval) {
    clearInterval(autoFetchInterval);
  }

  autoFetchInterval = setInterval(fetchBmkgData, 300000); // 5分ごと
}

// WebSocket接続関数
function connectJmaEew() {
  if (jmaEewWs) jmaEewWs.close();
  jmaEewWs = new WebSocket("wss://ws-api.wolfx.jp/jma_eew");

  jmaEewWs.onopen = () => {
    connections.jmaEew = true;
    jmaEewWs.send("query_jmaeew");
  };

  jmaEewWs.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      console.log("JMA EEWデータ受信:", data);

      if (data.type === "heartbeat") {
        jmaEewWs.send(
          JSON.stringify({ type: "pong", timestamp: data.timestamp })
        );
      } else if (data.type === "jma_eew") {
        updateJmaEewDisplay(data);
      } else if (data.type === "update") {
      }
      updateCombinedDisplay();
    } catch (error) {
      console.error("JMA EEWデータ解析エラー:", error);
    }
  };

  jmaEewWs.onclose = () => {
    connections.jmaEew = false;
    setTimeout(connectJmaEew, 30000); // 30秒後に再接続
  };

  jmaEewWs.onerror = (error) => {
    console.error("JMA EEW WebSocketエラー:", error);
    jmaEewWs.close();
  };
}

function connectScEew() {
  if (scEewWs) scEewWs.close();
  scEewWs = new WebSocket("wss://ws-api.wolfx.jp/sc_eew");

  scEewWs.onopen = () => {
    connections.scEew = true;
    scEewWs.send("query_sceew");
  };

  scEewWs.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      console.log("四川地震局データ受信:", data);

      if (data.type === "heartbeat") {
        scEewWs.send(
          JSON.stringify({ type: "pong", timestamp: data.timestamp })
        );
      } else if (data.type === "sc_eew") {
        updateScEewDisplay(data);
      }
    } catch (error) {
      console.error("四川地震局データ解析エラー:", error);
    }
  };

  scEewWs.onclose = () => {
    connections.scEew = false;
    setTimeout(connectScEew, 30000); // 30秒後に再接続
  };

  scEewWs.onerror = (error) => {
    console.error("四川地震局 WebSocketエラー:", error);
    scEewWs.close();
  };
}

function connectFjEew() {
  if (fjEewWs) fjEewWs.close();
  fjEewWs = new WebSocket("wss://ws-api.wolfx.jp/fj_eew");

  fjEewWs.onopen = () => {
    connections.fjEew = true;
    fjEewWs.send("query_fjeew");
  };

  fjEewWs.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      console.log("福建地震局データ受信:", data);

      if (data.type === "heartbeat") {
        fjEewWs.send(
          JSON.stringify({ type: "pong", timestamp: data.timestamp })
        );
      } else if (data.type === "fj_eew") {
        updateFjEewDisplay(data);
      }
    } catch (error) {
      console.error("福建地震局データ解析エラー:", error);
    }
  };

  fjEewWs.onclose = () => {
    connections.fjEew = false;
    setTimeout(connectFjEew, 30000); // 30秒後に再接続
  };

  fjEewWs.onerror = (error) => {
    console.error("福建地震局 WebSocketエラー:", error);
    fjEewWs.close();
  };
}

// 中国地震局 地震警報接続関数
function connectCeaEew() {
  if (ceaEewWs) ceaEewWs.close();
  ceaEewWs = new WebSocket("wss://ws.fanstudio.tech/cea");

  ceaEewWs.onopen = () => {
    connections.ceaEew = true;
    ceaEewWs.send("query");
  };

  ceaEewWs.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      console.log("中国地震局データ受信:", data);

      if (data.type === "heartbeat") {
        ceaEewWs.send(
          JSON.stringify({ type: "pong", timestamp: data.timestamp })
        );
      } else if (data.type === "ceaEew") {
        updateCeaEewDisplay(data.Data);
      }
    } catch (error) {
      console.error("中国地震局データ解析エラー:", error);
    }
    updateCombinedDisplay();
  };

  ceaEewWs.onclose = () => {
    connections.ceaEew = false;
    setTimeout(connectCeaEew, 30000); // 30秒後に再接続
  };

  ceaEewWs.onerror = (error) => {
    console.error("中国地震局 WebSocketエラー:", error);
    ceaEewWs.close();
  };
}

// 成都地震局 地震警報接続関数
function connectIclEew() {
  if (iclEewWs) iclEewWs.close();
  iclEewWs = new WebSocket("wss://ws.fanstudio.tech/icl");

  iclEewWs.onopen = () => {
    connections.iclEew = true;
    iclEewWs.send("query");
  };

  iclEewWs.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      console.log("成都地震局データ受信:", data);

      if (data.type === "heartbeat") {
        iclEewWs.send(
          JSON.stringify({ type: "pong", timestamp: data.timestamp })
        );
      } else if (data.type === "iclEew") {
        updateIclEewDisplay(data.Data);
      }
    } catch (error) {
      console.error("成都地震局データ解析エラー:", error);
    }
  };

  iclEewWs.onclose = () => {
    connections.iclEew = false;
    setTimeout(connectIclEew, 30000); // 30秒後に再接続
  };

  iclEewWs.onerror = (error) => {
    console.error("成都地震局 WebSocketエラー:", error);
    iclEewWs.close();
  };
}

// JMA 地震情報リスト接続関数
function connectJmaEqList() {
  if (jmaEqList) {
    jmaEqList.close();
  }

  jmaEqList = new WebSocket("wss://ws-api.wolfx.jp/jma_eqlist");

  // WebSocket接続時のステータス表示（オプション）
  jmaEqList.onopen = () => {
    connections.jmaEq = true;
    console.log("JMA地震情報リスト接続済み");

    // WebSocket接続後のみクエリ送信
    if (jmaEqList?.readyState === WebSocket.OPEN) {
      jmaEqList.send("query_jmaeqlist");
    }
  };

  jmaEqList.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      console.log("JMAデータ受信:", data);

      if (data.type === "heartbeat") {
        jmaEqList.send(
          JSON.stringify({ type: "pong", timestamp: data.timestamp })
        );
      } else if (data.type === "jma_eqlist") {
        lastUpdateTimes.jmaEq = new Date();
        updateJmaEqList(data);
      }
    } catch (error) {
      console.error("JMA EQデータ解析エラー:", error);
    }

    updateCombinedDisplay();
  };

  jmaEqList.onclose = () => {
    connections.jmaEq = false;
    console.log("JMA地震情報リスト切断されました");

    // 再接続を試行
    setTimeout(connectJmaEqList, 30000);
  };

  jmaEqList.onerror = (error) => {
    console.error("JMA EQ WebSocketエラー:", error);
    jmaEqList.close();
  };

  combinedData.jmaEqList = []; // 初期化
}

// 中国地震台網 地震情報リスト接続関数
function connectCencEqList() {
  if (cencEqWs) cencEqWs.close();
  cencEqWs = new WebSocket("wss://ws-api.wolfx.jp/cenc_eqlist");

  cencEqWs.onopen = () => {
    connections.cencEq = true;
    cencEqWs.send("query_cenceqlist");
  };

  cencEqWs.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      console.log("CENCデータ受信:", data);
      if (data.type === "heartbeat") {
        cencEqWs.send(
          JSON.stringify({ type: "pong", timestamp: data.timestamp })
        );
      } else if (data.type === "cenc_eqlist") {
        updateCencEqList(data);
      }
    } catch (error) {
      console.error("中国地震台網データ解析エラー:", error);
    }
  };

  cencEqWs.onclose = () => {
    connections.cencEq = false;
    setTimeout(connectCencEqList, 30000); // 30秒後に再接続
  };

  cencEqWs.onerror = (error) => {
    console.error("中国地震台網 WebSocketエラー:", error);
    cencEqWs.close();
  };
}

// EMSC 地震情報リスト接続関数
function connectEmscEqList() {
  if (emscEqWs) emscEqWs.close();
  emscEqWs = new WebSocket(
    "wss://www.seismicportal.eu/standing_order/websocket"
  );

  emscEqWs.onopen = () => {
    connections.emscEq = true;
    console.log("EMSC 接続済み");
    emscEqWs.send("query_emsc_eqlist");
  };

  emscEqWs.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data); // メッセージ全体を message とする
      console.log("EMSCデータ受信:", message); // ログを追加

      // action が "create" または "update" で、message.data が存在し、message.data.type が "Feature" かを確認
      if (
        message &&
        (message.action === "create" || message.action === "update") &&
        message.data &&
        message.data.type === "Feature" &&
        message.data.id
      ) {
        // ID の確認も追加
        console.log(
          "EMSC 'create' or 'update' Feature データを検出。updateEmscEqList を呼び出します。"
        );
        updateEmscEqList(message.data); // ✅ message.data (Feature オブジェクト) を渡す
      } else {
        console.log(
          "EMSC データ受信しましたが、処理対象外のデータです。",
          message
        );
      }
    } catch (error) {
      console.error("EMSCデータ解析エラー:", error);
    }

    updateCombinedDisplay(); // 念のため、毎回統合表示を更新
  };

  emscEqWs.onclose = () => {
    connections.emscEq = false;
    console.log("EMSC 切断されました");
    setTimeout(connectEmscEqList, 30000);
  };

  emscEqWs.onerror = (error) => {
    console.error("EMSC WebSocketエラー:", error);
    emscEqWs.close();
  };
}
// 自動取得間隔
let autoFetchInterval = 30;

// 自動取得開始
function startAutoFetch() {
  const interval = parseInt(intervalInput.value, 10);

  if (isNaN(interval) || interval <= 0) {
    alert("有効な秒数を入力してください（例: 5）");
    return;
  }

  if (autoFetchInterval) {
    clearInterval(autoFetchInterval);
  }

  autoFetchInterval = setInterval(() => {
    if (connections.jmaEew && jmaEewWs?.readyState === WebSocket.OPEN) {
      jmaEewWs.send("query_jmaeew");
    }

    if (connections.scEew && scEewWs?.readyState === WebSocket.OPEN) {
      scEewWs.send("query_sceew");
    }

    if (connections.fjEew && fjEewWs?.readyState === WebSocket.OPEN) {
      fjEewWs.send("query_fjeew");
    }

    if (connections.ceaEew && ceaEewWs?.readyState === WebSocket.OPEN) {
      ceaEewWs.send("query_ceaeew");
    }

    if (connections.iclEew && iclEewWs?.readyState === WebSocket.OPEN) {
      iclEewWs.send("query_icleew");
    }

    // JMA地震情報リスト
    if (connections.jmaEq && jmaEqList?.readyState === WebSocket.OPEN) {
      jmaEqList.send("query_jmaeqlist");
    }
    // 中国地震台網 地震情報リスト
    if (connections.cencEq && cencEqWs?.readyState === WebSocket.OPEN) {
      cencEqWs.send("query_cenceqlist");
    }
    // EMSC地震情報リスト
    if (connections.emscEq && emscEqWs?.readyState === WebSocket.OPEN) {
      emscEqWs.send("query_emsc_eqlist");
    }

    // JMA XMLデータ取得（初回のみ）
    if (!jmaXmlLastUpdate) {
      fetchJmaXmlData();
    }

    fetchBmkgData(); // BMKGデータも定期的に取得
    fetchBmkg_M5Data(); // HTTPで取得

    // 中国地震局（CEA）データ
    if (connections.ceaEew && ceaEewWs?.readyState === WebSocket.OPEN) {
      ceaEewWs.send("query_cea");
    }

    // 成都高新防災減災研究所（ICL）データ（公開ソフトウェアでの使用禁止）
    if (connections.iclEew && iclEewWs?.readyState === WebSocket.OPEN) {
      iclEewWs.send("query_icleew");
    }

    //jmaHypoData
    fetchJmaHypoData(HypoDate); // JMA Hypoデータを定期取得
    // USGSデータ
    fetchUsgsData(); // ✅ USGSデータを定期取得
    // CWA 地震情報
    fetchCwaData(); // ✅ CWAデータを定期取得
    // CWA Tiny 地震情報
    fetchCwaTinyData(); // ✅ CWA Tinyデータを定期取得
  }, interval * 1000);

  // 初回取得（接続済みのデータソースのみ）
  if (connections.jmaEew) jmaEewWs.send("query_jmaeew");
  if (connections.scEew) scEewWs.send("query_sceew");
  if (connections.fjEew) fjEewWs.send("query_fjeew");
  if (connections.jmaEq) jmaEqList.send("query_jmaeqlist");
  if (connections.cencEq) cencEqWs.send("query_cenceqlist");
  if (connections.emscEq) emscEqWs.send("query_emsc_eqlist");
  if (connections.ceaEew) ceaEewWs.send("query_ceaeew");
  if (connections.iclEew) iclEewWs.send("query_icleew");
  if (connections.cwaEq) cwaEqWs.send("query_cwa");
  if (connections.cwaEq_tiny) cwaEqWs_tiny.send("query_cwa_tiny");
  // 初回XML取得
  if (!jmaXmlLastUpdate) {
    fetchJmaXmlData();
  }

  alert(`${interval}秒ごとに自動取得を開始しました`);
}

// JMA XMLプルダウン要素
const jmaXmlSelect = document.getElementById("jmaXmlSelect");
const jmaXmlDetail = document.getElementById("jmaXmlDetail");

// XMLフィードのリンクをプルダウンに追加
function populateJmaXmlDropdown() {
  jmaXmlSelect.innerHTML = '<option value="">選択してください</option>';

  jmaXmlData.forEach((item, index) => {
    const option = document.createElement("option");
    option.value = item.link;
    option.textContent = `${item.Title} `;
    jmaXmlSelect.appendChild(option);
  });
}

// XMLリンク選択時の詳細表示
jmaXmlSelect.addEventListener("change", async () => {
  const selectedLink = jmaXmlSelect.value;
  if (!selectedLink || selectedLink === "") {
    jmaXmlDetail.innerHTML = "<p>地震情報を選択してください。</p>";
    return;
  }

  jmaXmlDetail.innerHTML = "<p>詳細情報を読み込んでいます...</p>";

  try {
    // キャッシュチェック
    if (xmlCache[selectedLink]) {
      jmaXmlDetail.innerHTML = xmlCache[selectedLink];
      return;
    }

    const response = await fetch(selectedLink);
    const text = await response.text();
    const parser = new DOMParser();
    const xml = parser.parseFromString(text, "text/xml");

    // XML内の情報を解析
    const detailHtml = parseJmaXmlDetail(xml);
    xmlCache[selectedLink] = detailHtml; // キャッシュに保存
    jmaXmlDetail.innerHTML = detailHtml;
  } catch (error) {
    console.error("XML詳細取得エラー:", error);
    jmaXmlDetail.innerHTML = `
            <p class="no-data">詳細情報の取得に失敗しました</p>
            <p>エラー: ${error.message}</p>
        `;
  }
});

// XML詳細情報解析関数（最適化版）
function parseJmaXmlDetail(xml) {
  let html = "";

  // タイトル
  const title =
    xml.querySelector("Title")?.textContent ||
    xml.querySelector("title")?.textContent ||
    "情報なし";
  html += `<h3>${title}</h3>`;

  // 発表時刻
  const published =
    xml.querySelector("DateTime")?.textContent ||
    xml.querySelector("datetime")?.textContent ||
    xml.querySelector("published")?.textContent ||
    "";
  html += `<p class="time">発表時刻: ${formatJmaXmlTime(published)}</p>`;

  // 地震情報の抽出
  const earthquake =
    xml.querySelector("Earthquake") || xml.querySelector("earthquake");
  if (earthquake) {
    const originTime =
      earthquake.querySelector("OriginTime")?.textContent ||
      earthquake.querySelector("origintime")?.textContent ||
      "情報なし";
    const hypocenter =
      earthquake.querySelector("Hypocenter > Area > Name")?.textContent ||
      earthquake.querySelector("hypocenter > area > name")?.textContent ||
      "情報なし";
    const coordinate =
      earthquake.querySelector("Hypocenter > Area > Coordinate")?.textContent ||
      earthquake.querySelector("hypocenter > area > coordinate")?.textContent ||
      "情報なし";

    const latLonMatch = coordinate.match(/([+-]?\d+\.\d+)/g);
    const lat = latLonMatch?.[0] || "情報なし";
    const lon = latLonMatch?.[1] || "情報なし";
    const mag =
      earthquake.querySelector("Magnitude")?.textContent ||
      earthquake.querySelector("magnitude")?.textContent ||
      "情報なし";

    html += `<h4>地震詳細情報</h4>`;
    html += `<p>発生時刻: ${originTime}</p>`;
    html += `<p>震源地: ${hypocenter}</p>`;
    //html += `<p>緯度: ${lat}, 経度: ${lon}</p>`;
    html += `<p>マグニチュード: ${mag}</p>`;
  }

  // 各地の震度情報の抽出
  const observation =
    xml.querySelector("Intensity > Observation") ||
    xml.querySelector("intensity > observation") ||
    null;

  if (observation) {
    html += `<h4>各地の震度情報</h4>`;
    html += `<div style="margin-left: 20px;">`;

    // 都道府県レベルの震度
    const prefList = observation.querySelectorAll("Pref") || [];
    prefList.forEach((pref) => {
      const prefName = pref.querySelector("Name")?.textContent || "情報なし";
      const prefMaxInt =
        pref.querySelector("MaxInt")?.textContent ||
        pref.querySelector("maxint")?.textContent ||
        "情報なし";

      html += `<p><strong>${prefName}</strong></p>`;

      // 細分区域の震度
      const areaList = pref.querySelectorAll("Area") || [];
      areaList.forEach((area) => {
        const areaName = area.querySelector("Name")?.textContent || "情報なし";
        const areaMaxInt =
          area.querySelector("MaxInt")?.textContent ||
          area.querySelector("maxint")?.textContent ||
          "情報なし";

        html += `<div style="margin-left: 20px;">`;
        html += `<p>・${areaName}: ${getIntersityLabel_j(areaMaxInt)}</p>`;

        // 市町村の震度
        const cityList = area.querySelectorAll("City") || [];
        cityList.forEach((city) => {
          const cityName =
            city.querySelector("Name")?.textContent || "情報なし";
          const cityMaxInt =
            city.querySelector("MaxInt")?.textContent ||
            city.querySelector("maxint")?.textContent ||
            "情報なし";

          html += `<div style="margin-left: 40px;">`;
          html += `<p>└─ ${cityName}: ${getIntersityLabel_j(cityMaxInt)}</p>`;

          // 観測点の震度
          const stationList = city.querySelectorAll("IntensityStation") || [];
          stationList.forEach((station) => {
            const stationName =
              station.querySelector("Name")?.textContent || "情報なし";
            const stationInt =
              station.querySelector("Int")?.textContent ||
              station.querySelector("int")?.textContent ||
              "情報なし";

            html += `<div style="margin-left: 60px;">`;
            html += `<p>・${stationName}: ${getIntersityLabel_j(
              stationInt
            )}</p>`;
            html += `</div>`;
          });

          html += `</div>`;
        });

        html += `</div>`;
      });
    });

    html += `</div>`;
  }

  // コメントの抽出
  const comments = xml.querySelectorAll(
    "Comments > ForecastComment > Text, comments > forecastcomment > text"
  );
  comments.forEach((comment) => {
    html += `<p class="source">コメント: ${comment.textContent}</p>`;
  });

  return html;
}

// 自動取得停止
function stopAutoFetch() {
  if (autoFetchInterval) {
    clearInterval(autoFetchInterval);
    autoFetchInterval = null;
    alert("自動取得を停止しました");
  } else {
    alert("自動取得は実行されていません");
  }
}

// 初期化
connectJmaEew();
connectScEew();
connectFjEew();
connectCeaEew();
connectIclEew();
connectJmaEqList();
connectCencEqList();
connectEmscEqList();
fetchBmkgData(); // 修正: 初期取得を追加
fetchBmkg_M5Data(); // BMKG M5.0+ 地震情報
fetchUsgsData();
fetchCwaData(); // CWA 地震情報
fetchCwaTinyData(); // CWA Tiny 地震情報
fetchJmaHypoData(HypoDate); // JMA Hypoデータを初期取得
startAutoFetch(); // 自動取得開始

// 初回XMLデータ取得
initialJmaXmlFetch();

let map;
// 地図マーカー設定 (追加)
let mapMarkerSettings = {
  // 各データソースのマーカー表示/非表示設定
  // キー: データ配列の名前 (markers オブジェクトのプロパティ名)
  // 値: true (表示) / false (非表示)
  cwaEqList_tiny: true, // 例: CWA Tiny データ
  cwaEqList: true, // 例: CWA データ
  usgsData: true, // 例: USGS データ
  bmkgData: true, // 例: BMKG データ
  bmkg_M5Data: true, // 例: BMKG M5+ データ
  jmaEqList: false, // 例: JMA データ (デフォルト非表示)
  cencEqList: false, // 例: CENC データ (デフォルト非表示)
  emscEqList: false, // 例: EMSC データ (デフォルト非表示)
  // 必要に応じて他のデータソースも追加
};
// 地図を初期化 (修正箇所 3: 既存の地図があれば削除)
function initMap() {
  // 既存の地図があれば削除
  if (map) {
    map.remove();
    console.log("既存の地図を削除しました");
  }

  console.log("地図を初期化中...");
  map = L.map("map").setView([35.6895, 135], 5); // 初期座標（東京）

  // タイルレイヤーを追加
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap",
  }).addTo(map);
  console.log("タイルレイヤーを追加しました");

   // === 追加: 津波GeoJSONデータの取得 (地図初期化時) ===
    fetchTsunamiAreaGeoJson().then(() => {
         // 津波データ取得後、津波レイヤーを初期化 (まだ警報情報はない)
         if (map) {
             updateTsunamiLayerOnMap(); // 初期状態のレイヤーを追加
         }
    });
    // === 追加 ここまで ===
  // 2. プレート境界をGeoJSONで追加
  fetch(
    "https://raw.githubusercontent.com/fraxen/tectonicplates/master/GeoJSON/PB2002_boundaries.json"
  )
    .then((res) => {
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      return res.json();
    })
    .then((data) => {
      L.geoJSON(data, {
        color: "orange",
        weight: 4,
        opacity: 0.8,
        dashArray: "5,5",
      }).addTo(map);
      console.log("プレート境界を追加しました");
    })
    .catch((error) => {
      // エラーが発生しても地図の表示は継続
      console.error("プレート境界データの読み込みエラー:", error);
    });

  console.log("地図の初期化が完了しました");
  return map;
}

function getIconSize(magnitude) {
  // マグニチュードに応じてアイコンサイズを計算
  const baseSize = 7;
  const scaleFactor = 2;
  const size = baseSize + Math.pow(magnitude, 2);
  return [size, size];
}

function getDepthColor(depth) {
  if (depth === undefined || depth === null || isNaN(depth)) return "black"; // デフォルト（黒色）

  if (depth < 10) return "red"; // 赤（浅い）
  else if (depth < 30) return "orange"; // オレンジ
  else if (depth < 50) return "yellow"; // 黄色
  else if (depth < 80) return "green"; // 緑
  else if (depth < 100) return "cyan"; // シアン
  else if (depth < 200) return "blue"; // 青
  else return "purple"; // 紫
}
function initMapWithMarkers(map, markers) {
  if (!map) {
    console.warn("initMapWithMarkers: 地図が初期化されていません");
    return;
  }

  // 既存のマーカーを削除
  if (markerGroup) {
    map.removeLayer(markerGroup);
    markerGroup = null;
    console.log("既存のマーカーグループを削除しました");
  }

  // 新しいFeatureGroupを作成
  markerGroup = L.featureGroup();

  // マーカー作成関数
  function createMarker(markerData) {
    const magnitude = markerData.magnitude || markerData.Magunitude || 1;
    const iconSize = getIconSize(magnitude);
    const lat = markerData.lat || markerData.latitude;
    const lng = markerData.lng || markerData.longitude;
    const depth = markerData.depth || markerData.Depth;
    // 緯度経度が無効な場合はマーカーを作成しない
    if (lat === undefined || lng === undefined || isNaN(lat) || isNaN(lng)) {
      console.warn("無効な緯度経度のためマーカーを作成しません:", markerData);
      return null;
    }

    const color = getDepthColor(depth);
    const customIcon = L.icon({
      iconUrl: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Ccircle cx='50' cy='50' r='50' fill='${color}' stroke='black' stroke-width='2'/%3E%3C/svg%3E`,
      iconSize: iconSize,
      iconAnchor: [iconSize[0] / 2, iconSize[1] / 2],
      popupAnchor: [0, -iconSize[1]],
    });

    return L.marker([lat, lng], { icon: customIcon }).bindPopup(
      (markerData.time || markerData.OriginTime || "時間不明") +
        "<br>" +
        (markerData.location ||
          markerData.HypoCenter ||
          markerData.Hypocenter ||
          "場所不明") +
        "<br>" +
        `<p>M${magnitude}  深さ: ${
          markerData.depth || markerData.Depth || "不明"
        } km</p>` +
        `<p>情報源: ${markerData.source || "不明"}</p>`
    );
  }

  // すべてのマーカーデータを処理
  const allMarkers = [
    ...(markers.cwaEqList_tiny || []),
    ...(markers.cwaEqList || []),
    ...(markers.usgsData || []),
    // 必要に応じて他のマーカーデータも追加
    // ...(markers.jmaEqList || []), // 例: JMAデータも追加する場合
    ...(markers.bmkgData || []),
    ...(markers.bmkg_M5Data || []),
    ...Object.values(markers.cencEqList || {}),
    ...Object.values(markers.emscEqList || {}),
    ...(markers.jmaHypoData || []),
  ];

  console.log(`処理対象マーカー数: ${allMarkers.length}`);

  allMarkers.forEach((markerData) => {
    try {
      const marker = createMarker(markerData);
      if (marker) {
        // createMarkerがnullを返さない場合のみ追加
        markerGroup.addLayer(marker);
      }
    } catch (e) {
      console.error("マーカー作成中にエラー:", markerData, e);
    }
  });

  map.addLayer(markerGroup);
  console.log(`マーカーを ${allMarkers.length} 個追加しました`);
}

window.addEventListener("load", function () {
  console.log("ページロード完了イベント発火");
  
  // --- 修正箇所 1: tab2 の地図初期化を削除 ---
  // 以下のコードブロックをコメントアウトまたは削除します。
  /*
    try {
        console.log("地図を初期化します...");
        map = initMap(); // 初期化
        console.log("地図初期化完了");

        // invalidateSize を遅延させて実行 (タブ切り替え時と同じ)
        setTimeout(() => {
            if (map) {
                console.log("地図サイズを再計算します");
                map.invalidateSize();
                console.log("地図サイズ再計算完了");
                // 必要に応じて、初期マーカーを表示
                // (updateCombinedDisplayが自動的に呼び出される場合は不要)
                // initMapWithMarkers(map, combinedData);
            }
        }, 200); // 200msの遅延
    } catch (error) {
        console.error("loadイベントでの地図初期化中にエラーが発生しました:", error);
    }
    */
  // --- 修正箇所 1 ここまで ---
});
window.addEventListener('load', async () => {
    await fetchTsunamiAreaGeoJson();
    // ... 他の初期化処理 ...
});
document.addEventListener("DOMContentLoaded", function () {
  console.log("DOMContentLoadedイベント発火");
  const tabButtons = document.querySelectorAll(".tab-btn");
  const tabContents = document.querySelectorAll(".tab-content");
  const tabIndicator = document.querySelector(".tab-indicator");

  const showCwaTinyMarkersInput = document.getElementById("showCwaTinyMarkers");
  const showCwaMarkersInput = document.getElementById("showCwaMarkers");
  const showUsgsMarkersInput = document.getElementById("showUsgsMarkers");
  const showBmkgMarkersInput = document.getElementById("showBmkgMarkers");
  const showBmkgM5MarkersInput = document.getElementById("showBmkgM5Markers");
  const showJmaMarkersInput = document.getElementById("showJmaMarkers"); // 例

  const showCencMarkersInput = document.getElementById("showCencMarkers"); // 例
  const showEmscMarkersInput = document.getElementById("showEmscMarkers"); // 例
  const applyMapSettingsButton = document.getElementById("applyMapSettings");

  const magThresholdInput = document.getElementById("magThreshold");
  if (magThresholdInput) {
    magThresholdInput.value = magThreshold; // 初期値を設定
    magThresholdInput.addEventListener("change", () => {
      const newThreshold = parseFloat(magThresholdInput.value);
      if (!isNaN(newThreshold) && newThreshold >= 0) {
        magThreshold = newThreshold;
        // 必要に応じて設定をローカルストレージなどに保存
      } else {
        alert("有効な数値を入力してください。");
        magThresholdInput.value = magThreshold; // 値を元に戻す
      }
    });
  }
  const savedTheme = localStorage.getItem("theme") || "light";
  if (savedTheme === "dark") {
    document.body.classList.add("dark-mode");
    document.getElementById("themeToggle").textContent = "ライトモード";
  } else {
    document.body.classList.remove("dark-mode");
    document.getElementById("themeToggle").textContent = "ダークモード";
  }

  // --- 通知設定の初期化 ---
  // ここで initNotificationSettings 関数を呼び出す
  initNotificationSettings();
  // -----------------------

  // 一括操作ボタンの要素を取得
  const selectAllButton = document.getElementById("selectAllButton");
  const deselectAllButton = document.getElementById("deselectAllButton");

  // tab3 内のすべての設定可能なトグルスイッチの input 要素のIDリスト
  // 実際の tab3 内のIDに合わせて更新してください
  const allToggleIdsInTab3 = [
    "sourceJMA",
    "sourceSC",
    "sourceFJ",
    "sourceCea",
    "sourceIcl",
    "sourceJmaEqList",
    "sourceCENC",
    "sourceBMKG",
    "sourceBMKG_M5",
    //"sourceJmaXml",
    "sourceJmaHypo",
    "sourceUSGS",
    "sourceCWA",
    "sourceCWA_tiny",
    "sourceEMSC",
    "enableNotification",
    "soundNotification",
    // themeToggle は表示設定なので除外します
    // 地図表示設定のトグルも必要に応じて追加できます
    // 'showCwaTinyMarkers', 'showCwaMarkers', ...
  ];

  // 「すべて表示」ボタンのクリックイベント
  if (selectAllButton) {
    selectAllButton.addEventListener("click", function () {
      allToggleIdsInTab3.forEach(function (id) {
        const checkbox = document.getElementById(id);
        if (checkbox && !checkbox.checked) {
          checkbox.checked = true;
          // チェック状態の変更を反映するために change イベントを発火させる
          checkbox.dispatchEvent(new Event("change"));
        }
      });
      // 必要に応じて、地図表示設定のトグルもここで操作
      // applyMapSettingsIfNecessary(); // 例えば、地図設定もまとめて適用する関数を呼び出す
    });
  }

  // 「すべて非表示」ボタンのクリックイベント
  if (deselectAllButton) {
    deselectAllButton.addEventListener("click", function () {
      allToggleIdsInTab3.forEach(function (id) {
        const checkbox = document.getElementById(id);
        if (checkbox && checkbox.checked) {
          checkbox.checked = false;
          // チェック状態の変更を反映するために change イベントを発火させる
          checkbox.dispatchEvent(new Event("change"));
        }
      });
      // 必要に応いて、地図表示設定のトグルもここで操作
      // applyMapSettingsIfNecessary();
    });
  }

  // ... 他のコード ...

  if (tabButtons.length > 0 && tabContents.length > 0) {
    // 初期インジケーター位置設定
    updateIndicator();

    tabButtons.forEach((button) => {
      button.addEventListener("click", () => {
        // アクティブクラスの切り替え
        tabButtons.forEach((btn) => btn.classList.remove("active"));
        tabContents.forEach((content) => content.classList.remove("active"));

        button.classList.add("active");
        const targetTab = document.getElementById(button.dataset.tab);
        if (targetTab) {
          targetTab.classList.add("active");
        } else {
          console.warn(`タブコンテンツが見つかりません: ${button.dataset.tab}`);
        }

        // インジケーターの更新
        updateIndicator();

        // === 修正箇所 2: タブ切り替え時の処理を追加/修正 ===
        // tab2 (地図) がアクティブになったときの処理
        if (button.dataset.tab === "tab2") {
          console.log("tab2 がアクティブ: 地図の状態を確認します");
          if (!map) {
            console.log("地図が初期化されていません。初期化を開始します...");
            try {
              map = initMap(); // 地図を初期化
              console.log("tab2: 地図初期化完了");
              // invalidateSize を遅延させて実行
              setTimeout(() => {
                if (map) {
                  console.log("tab2: 地図サイズを再計算します");
                  map.invalidateSize();
                  console.log("tab2: 地図サイズ再計算完了");
                  // 地図が初期化された直後は、おそらく updateCombinedDisplay も
                  // 呼び出されるか、手動でマーカーを追加する必要があるかもしれません。
                  // ここでは updateCombinedDisplay が他の場所で呼び出されると仮定します。
                  // 必要に応じて、直後にマーカーを追加:
                  // initMapWithMarkers(map, combinedData); // combinedData が利用可能か確認
                }
              }, 200); // 200msの遅延
            } catch (error) {
              console.error("tab2: 地図初期化中にエラーが発生しました:", error);
            }
          } else {
            console.log(
              "tab2: 地図は既に初期化されています。サイズを再計算します"
              
            );
              // === 追加: tab2 アクティブ時に津波レイヤーを更新 ===
        // 津波情報が既に取得済みの場合、地図レイヤーを更新
        if (latestTsunamiInfo && tsunamiAreaGeoJsonData) {
             updateTsunamiLayerOnMap();
             console.log("tab2: 津波レイヤーを更新しました。");
        }
        // === 追加 ここまで ===
            // 地図が既に存在する場合は、サイズを再計算
            setTimeout(() => {
              if (map) {
                map.invalidateSize();
                console.log("tab2: 地図サイズ再計算完了");
              }
            }, 100); // 少し遅延させて実行
          }
        }
        // tab1_1 がアクティブになったときにデータを取得
        if (button.dataset.tab === "tab1_1") {
          fetchTsunamiData();
        }
        // tab2.1 がアクティブになったときの処理 (変更なし、または必要に応じて調整)
        if (button.dataset.tab === "tab2.1") {
          console.log("tab2.1 がアクティブ: グラフを描画します");
          // updateCombinedDisplay で最新の allData が準備されている前提
          updatePlotlyGraph("plotly-graph-2-1");
        }

        // tab2.2 がアクティブになったときの処理 (変更なし、または必要に応じて調整)
        if (button.dataset.tab === "tab2.2") {
          console.log("tab2.2 がアクティブ: 球面グラフを描画します");
          updatePlotlySphereGraph("plotly-graph-2-2");
        }
        // === 修正箇所 2 ここまで ===
      });
    });

    // --- 地図設定のロード ---
    function loadMapMarkerSettings() {
      const savedSettings = localStorage.getItem("mapMarkerSettings");
      if (savedSettings) {
        try {
          mapMarkerSettings = JSON.parse(savedSettings);
        } catch (e) {
          console.error("保存された地図設定の読み込みに失敗しました:", e);
        }
      }

      // UIに設定を反映 (input要素のcheckedプロパティを設定)
      if (showCwaTinyMarkersInput)
        showCwaTinyMarkersInput.checked =
          mapMarkerSettings.cwaEqList_tiny ?? true;
      if (showCwaMarkersInput)
        showCwaMarkersInput.checked = mapMarkerSettings.cwaEqList ?? true;
      if (showUsgsMarkersInput)
        showUsgsMarkersInput.checked = mapMarkerSettings.usgsData ?? true;
      if (showBmkgMarkersInput)
        showBmkgMarkersInput.checked = mapMarkerSettings.bmkgData ?? true;
      if (showBmkgM5MarkersInput)
        showBmkgM5MarkersInput.checked = mapMarkerSettings.bmkg_M5Data ?? true;
      if (showJmaMarkersInput)
        showJmaMarkersInput.checked = mapMarkerSettings.jmaEqList ?? false; // 例
      if (showCencMarkersInput)
        showCencMarkersInput.checked = mapMarkerSettings.cencEqList ?? false; // 例
      if (showEmscMarkersInput)
        showEmscMarkersInput.checked = mapMarkerSettings.emscEqList ?? false; // 例
    }

    // --- 地図設定の保存 ---
    function saveMapMarkerSettings() {
      localStorage.setItem(
        "mapMarkerSettings",
        JSON.stringify(mapMarkerSettings)
      );
    }

    // --- 地図設定の適用 ---
    function applyMapMarkerSettings() {
      // UIから設定を取得 (input要素のcheckedプロパティから取得)
      if (showCwaTinyMarkersInput)
        mapMarkerSettings.cwaEqList_tiny = showCwaTinyMarkersInput.checked;
      if (showCwaMarkersInput)
        mapMarkerSettings.cwaEqList = showCwaMarkersInput.checked;
      if (showUsgsMarkersInput)
        mapMarkerSettings.usgsData = showUsgsMarkersInput.checked;
      if (showBmkgMarkersInput)
        mapMarkerSettings.bmkgData = showBmkgMarkersInput.checked;
      if (showBmkgM5MarkersInput)
        mapMarkerSettings.bmkg_M5Data = showBmkgM5MarkersInput.checked;
      if (showJmaMarkersInput)
        mapMarkerSettings.jmaEqList = showJmaMarkersInput.checked; // 例
      if (showCencMarkersInput)
        mapMarkerSettings.cencEqList = showCencMarkersInput.checked; // 例
      if (showEmscMarkersInput)
        mapMarkerSettings.emscEqList = showEmscMarkersInput.checked; // 例

      // 設定を保存
      saveMapMarkerSettings();

      // マーカーを再描画
      if (map) {
        console.log("地図設定が変更されたため、マーカーを再描画します");
        initMapWithMarkers(map, combinedData);
        // サイズ再計算も行っておく
        setTimeout(() => map.invalidateSize(), 100);
      } else {
        console.warn(
          "地図が初期化されていないため、マーカーの再描画をスキップします"
        );
      }
    }

    // 初期設定をロード
    loadMapMarkerSettings();

    // 設定適用ボタンのイベントリスナー
    if (applyMapSettingsButton) {
      applyMapSettingsButton.addEventListener("click", applyMapMarkerSettings);
      console.log("地図設定適用ボタンのイベントリスナーを追加しました");
    } else {
      console.warn("地図設定適用ボタン (#applyMapSettings) が見つかりません");
    }
    // トグルスイッチの変更イベントリスナー (オプション: 即時反映)
    // すべてのinput要素に対してイベントリスナーを追加

    function updateIndicator() {
      const activeButton = document.querySelector(".tab-btn.active");
      if (activeButton && tabIndicator) {
        const buttonRect = activeButton.getBoundingClientRect();
        const containerRect =
          activeButton.parentElement.getBoundingClientRect();

        tabIndicator.style.width = `${buttonRect.width}px`;
        tabIndicator.style.left = `${buttonRect.left - containerRect.left}px`;
      }
    }

    // 修正箇所 6: ウィンドウリサイズ時にインジケーターと地図サイズを更新
    window.addEventListener("resize", function () {
      updateIndicator();
      if (map) {
        console.log("ウィンドウリサイズ: 地図サイズを再計算します");
        map.invalidateSize();
        console.log("ウィンドウリサイズ: 地図サイズ再計算完了");
      }
    });
  } else {
    console.log("タブ要素が見つかりませんでした");
  }
});

/**
 * 指定した日数分の気象庁震源データGeoJSON URLを生成します。
 * @param {number} daysBack 取得する日数（例: 0=今日, 1=昨日まで, 7=1週間前まで）
 * @returns {Array<string>} GeoJSONファイルのURLの配列
 */
function generateHypoUrls(daysBack = 7) {
  const urls = [];
  const today = new Date();

  for (let i = 0; i <= daysBack; i++) {
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() - i);

    const year = targetDate.getFullYear();
    const month = String(targetDate.getMonth() + 1).padStart(2, "0");
    const day = String(targetDate.getDate()).padStart(2, "0");

    const filename = `hypo${year}${month}${day}.geojson`;
    const url = `https://www.jma.go.jp/bosai/hypo/data/${year}/${month}/${filename}`;
    urls.push(url);
  }

  return urls;
}

/**
 * 複数のGeoJSON URLから震源データを取得し、統合して combinedData に格納します。
 * @param {number} daysBack 取得する日数（例: 0=今日, 1=昨日まで, 7=1週間前まで）
 */
async function fetchJmaHypoData(daysBack = 7) {
  const urls = generateHypoUrls(daysBack);
  console.log("取得する気象庁GeoJSON URLリスト:", urls);

  const fetchPromises = urls.map((url) =>
    fetch(url)
      .then((response) => {
        if (!response.ok) {
          console.warn(
            `気象庁GeoJSONデータ取得エラー (URL: ${url}, Status: ${response.status})`
          );
          return [];
        }
        return response.json();
      })
      .then((data) => {
        if (data && data.features && Array.isArray(data.features)) {
          return data.features.map((feature) => {
            const props = feature.properties;
            const coords = feature.geometry.coordinates;
            return {
              // 統一されたプロパティ名を使用 (他のデータソースと整合性を持たせる)
              id: props.eid, // ✅ IDを追加
              source: "jma_geojson", // ✅ ソースを明示
              displayType: "eq", // ✅ 表示タイプを明示
              time: props.date, // 発生時刻
              // time_full: props.origin_time, // 必要に応じて追加
              location: props.place || "不明",
              magnitude: props.mag,
              magtype: props.mj || "", // マグニチュードの種類
              depth: props.dep, // kmに変換
              lat: coords[1],
              lng: coords[0],
              intensity: props.intensity || "なし", // 最大震度 (あれば)
              // 必要に応じて他のプロパティも追加
              // title: props.ttl || `M${props.magnitude} 地震`, // タイトル
              // json: props.json, // 詳細JSONパス
              // ... propsの他のフィールド
            };
          });
        }
        return [];
      })
      .catch((error) => {
        console.error(
          `気象庁GeoJSONデータ取得中に例外が発生しました (URL: ${url}):`,
          error
        );
        return [];
      })
  );

  try {
    const results = await Promise.all(fetchPromises);
    const allEarthquakeData = results.flat();

    combinedData.jmaHypoData = allEarthquakeData;
    lastUpdateTimes.jmaHypo = new Date(); // 最終更新日時を記録
    console.log(
      `気象庁GeoJSONデータを取得・更新しました。総数: ${allEarthquakeData.length}`
    );

    // 統合表示を更新
    updateCombinedDisplay();
  } catch (error) {
    console.error(
      "気象庁GeoJSONデータの取得または統合中にエラーが発生しました:",
      error
    );
  }
}

// 直交座標 3D 散布図
function updatePlotlyGraph(containerId = "plotly-graph-2-1") {
  (async () => {
    try {
      // updateCombinedDisplay 内のデータ準備ロジックを一部再利用
      // ただし、allData はグローバル変数または updateCombinedDisplay から渡される必要があります
      // ここでは updateCombinedDisplay が allData をグローバルに設定していると仮定します
      // より良い方法は、allData を引数として渡すことです。

      if (!Array.isArray(allData)) {
        // ✅ typeof 比較を簡略化
        console.warn("グラフ描画: allData が配列ではありません。");
        document.getElementById(containerId).innerHTML =
          "<p>表示するデータがありません (データ形式エラー)。</p>";
        return;
      }
      if (allData.length === 0) {
        // ✅ データが空の場合もチェック
        console.warn("グラフ描画: allData が空です。");
        document.getElementById(containerId).innerHTML =
          "<p>表示する地震データがありません。</p>";
        return;
      }

      // 1. データを準備
      const lats = []; // 緯度
      const lons = []; // 経度
      const depths = []; // 深さ (km)
      const magnitudes = []; // マグニチュード
      const hoverTexts = []; // ホバーテキスト
      const sourceInfo = []; // 情報源

      // allData から必要な情報を抽出 (データ構造に応じて調整)
      allData.forEach((item) => {
        let lat, lon, depth, mag, location, source;

        // USGS GeoJSON 形式 (例)
        if (item.geometry && item.properties) {
          lat = item.geometry.coordinates[1];
          lon = item.geometry.coordinates[0];
          depth = item.geometry.coordinates[2];
          mag = item.properties.mag;
          location = item.properties.place || "不明";
          source = "USGS";
        }
        // JMA GeoJSON 形式 (例) - Pasted_Text_1753587131703.txt に基づくプロパティ名
        else if (item.lat !== undefined && item.lng !== undefined) {
          lat = parseFloat(item.lat);
          lon = parseFloat(item.lng);
          depth = parseFloat(item.depth);
          mag = parseFloat(item.magnitude);
          location = item.location || item.Title || "不明";
          source = item.source || "不明";
        }
        // EMSC 形式 (例) - Pasted_Text_1753587131703.txt に基づくプロパティ名
        else if (item.type === "Feature" && item.geometry && item.properties) {
          const coords = item.geometry.coordinates;
          if (coords && coords.length >= 3) {
            lon = parseFloat(coords[0]);
            lat = parseFloat(coords[1]);
            depth = parseFloat(coords[2]);
            mag = parseFloat(item.properties.mag);
            location =
              item.properties.place || item.properties.flynn_region || "不明";
            source = "EMSC";
          }
        }
        // 他の形式 (例: CENC, BMKG, CWA 等) もここに追加
        // ... (他の条件分岐) ...

        // 必須データが存在し、数値に変換可能な場合のみ追加
        if (!isNaN(lat) && !isNaN(lon) && !isNaN(depth) && !isNaN(mag)) {
          lats.push(lat);
          lons.push(lon);
          depths.push(-depth); // Plotly では深さを負の値で表現するのが一般的 (奥がマイナス)
          magnitudes.push(mag);
          hoverTexts.push(
            `場所: ${location}<br>緯度: ${lat.toFixed(
              4
            )}<br>経度: ${lon.toFixed(4)}<br>深さ: ${depth.toFixed(
              1
            )} km<br>マグニチュード: ${mag.toFixed(1)}<br>情報源: ${source}`
          );
          sourceInfo.push(source); // 情報源を分類に使用
        }
      });

      if (lats.length === 0) {
        console.warn("グラフ描画: 有効な地震データがありません。");
        document.getElementById(containerId).innerHTML =
          "<p>有効な地震データがありません。</p>";
        return;
      }
      // === 新規: Datamaps World.json データの取得と処理 (直交3D用) ===
      let worldMapTraceOrtho = null; // 直交3D用の世界地図トレース変数
      try {
        // ✅ 球面3Dと同じ geo.json ファイルを使用
        const WORLD_MAP_URL = "custom.geohigh.json";
        console.log(
          "世界地図データ (Datamaps/直交3D) を取得します...",
          WORLD_MAP_URL
        );
        const response = await fetch(WORLD_MAP_URL);
        if (!response.ok) {
          throw new Error(
            `世界地図データ取得エラー: HTTP status ${response.status}`
          );
        }
        const worldData = await response.json();
        console.log("世界地図データ (Datamaps/直交3D) を取得しました。");

        const worldLons = []; // 経度
        const worldLats = []; // 緯度
        const worldDepth = []; // 深度 (直交プロットでは通常 0 に固定するか、特定の深度レベルに置く)

        // 固定の Z (深さ) 値を設定 (例: 0 km, -100 km など)
        // 地表に近い深さ (例えば -50 km) に置くと見やすいかもしれません。
        const FIXED_WORLD_DEPTH = 0; // km (負の値で地表下を意味する場合が多いです)

        worldData.features.forEach((feature) => {
          // Polygon と MultiPolygon の両方を処理
          let coordinatesList = [];
          if (feature.geometry.type === "Polygon") {
            coordinatesList = feature.geometry.coordinates; // [ [ [lng, lat], ... ], ... ]
          } else if (feature.geometry.type === "MultiPolygon") {
            // MultiPolygon は Polygon の配列 [ [ [ [lng, lat], ... ], ... ], ... ]
            // すべての Polygon をフラット化して処理
            feature.geometry.coordinates.forEach((polygon) =>
              coordinatesList.push(...polygon)
            );
          }
          // 他の geometry type (Point, LineString) は無視

          coordinatesList.forEach((ring) => {
            // 各リングを処理
            ring.forEach((coord) => {
              const lon = coord[0];
              const lat = coord[1];
              if (isNaN(lat) || isNaN(lon)) return;
              worldLons.push(lon);
              worldLats.push(lat);
              worldDepth.push(FIXED_WORLD_DEPTH); // 固定深さ
            });
            // 各リングの終端に NaN を挿入 (線が繋がりすぎないようにする)
            worldLons.push(NaN);
            worldLats.push(NaN);
            worldDepth.push(NaN);
          });
          // Feature 間の区切りにも NaN を挿入 (オプション)
          worldLons.push(NaN);
          worldLats.push(NaN);
          worldDepth.push(NaN);
        });

        if (worldLons.length > 0) {
          worldMapTraceOrtho = {
            type: "scatter3d",
            mode: "lines", // 線で境界を描画
            x: worldLons, // X軸: 経度
            y: worldLats, // Y軸: 緯度
            z: worldDepth, // Z軸: 固定深さ
            line: {
              color: "lightblue", // 色を指定 (球面版と区別するために変更)
              width: 2.5, // 線の太さを指定 (細く)
            },
            name: "世界地図境界 (直交)",
            hoverinfo: "skip", // ホバー情報を非表示
          };
          console.log("世界地図 (Datamaps/直交3D) トレースを作成しました。");
        } else {
          console.warn(
            "世界地図データ (Datamaps/直交3D) から有効なポイントが生成されませんでした。"
          );
        }
      } catch (error) {
        console.error(
          "世界地図データ (Datamaps/直交3D) の取得または処理中にエラーが発生しました:",
          error
        );
        console.warn(
          "世界地図データ (直交3D) の読み込みに失敗しましたが、他の要素は表示されます。"
        );
      }
      // === 新規: Datamaps World.json データの取得と処理 (直交3D用) ここまで ===
      // 2. データトレースの定義
      const uniqueSources = [...new Set(sourceInfo)];
      // worldMapTraceOrtho を最初に追加し、その後に地震データトレースを追加
      const traces = [
        ...(worldMapTraceOrtho ? [worldMapTraceOrtho] : []), // 世界地図境界を最初に描画
        ...uniqueSources.map((src) => {
          const indices = sourceInfo
            .map((s, i) => (s === src ? i : null))
            .filter((i) => i !== null);
          return {
            type: "scatter3d",
            mode: "markers",
            x: indices.map((i) => lons[i]), // X軸: 経度
            y: indices.map((i) => lats[i]), // Y軸: 緯度
            z: indices.map((i) => depths[i]), // Z軸: 深さ (負の値)
            name: src, // 凡例に表示される名前
            text: indices.map((i) => hoverTexts[i]), // ホバーテキスト
            hoverinfo: "text",
            marker: {
              size: indices.map((i) => Math.max(2, (5 + Math.pow(magnitudes[i], 1.7)))), // 最小サイズを設定
              sizemode: "diameter",
              // color: indices.map(i => depths[i]), // 色を深さに応じて変える場合
              // colorscale: 'Viridis',
              // colorbar: { title: 'Depth (km)' },
              opacity: 0.7,
            },
          };
        }),
      ];

      // 3. レイアウトの定義
      const layout = {
        title: "地震データ 3D プロット (緯度/経度/深さ)",
        font: { color: "white" },
        paper_bgcolor: "black", // グラフ全体の背景色
        plot_bgcolor: "white", // プロット領域の背景色
        scene: {
          aspectmode: "manual", // <--- 手動でアスペクト比を設定
          aspectratio: { x: 16, y: 9, z: 2 }, // <--- 例: X軸をY軸、Z軸の2倍の長さにする

          xaxis: { title: "経度 (Longitude)" },
          yaxis: { title: "緯度 (Latitude)" },
          zaxis: { title: "深さ (Depth km)" },
        },
        margin: { l: 0, r: 0, b: 0, t: 50 },
      };

      // 4. グラフを描画
      Plotly.react(containerId, traces, layout);
    } catch (error) {
      console.error("Plotly グラフ描画エラー:", error);
      document.getElementById(containerId).innerHTML =
        "<p>グラフの描画中にエラーが発生しました。</p>";
    }
  })();
}
// 球面 3D 散布図
function updatePlotlySphereGraph(containerId = "plotly-graph-2-2") {
  // 非同期関数として定義
  (async () => {
    try {
        // --- 津波トレース生成のためのコード追加開始 ---
            let tsunamiTraces = []; // 津波関連のトレースを格納する配列
            if (latestTsunamiInfo && latestTsunamiInfo.areas && latestTsunamiInfo.areas.length > 0 && !latestTsunamiInfo.cancelled &&
                tsunamiAreaGeoJson && tsunamiAreaGeoJson.features) {

                const EARTH_RADIUS_KM = 6371;
                const TSUNAMI_SPHERE_RADIUS_KM = EARTH_RADIUS_KM - 5; // 地球より少し内側にプロット

                // 1. 警報状況データをマップ化 (区域名 -> {grade, immediate})
                const tsunamiStatusMap = new Map();
                latestTsunamiInfo.areas.forEach(area => {
                    if (area.regions && area.regions.length > 0) {
                        area.regions.forEach(region => {
                             // APIの区域名をキーとして状態を保存
                             tsunamiStatusMap.set(region.name, {
                                 grade: region.grade,
                                 immediate: region.immediate
                             });
                        });
                    }
                });

                // 2. GeoJSONのポリゴンをループし、警報が出てるものだけを描画
                const tsunamiX = [];
                const tsunamiY = [];
                const tsunamiZ = [];
                const tsunamiColors = [];
                const tsunamiTexts = [];
                const tsunamiIndices = []; // i, j, k 形式のインデックスを格納

                let vertexIndex = 0; // mesh3d 用の頂点インデックス
                tsunamiAreaGeoJson.features.forEach((feature, featureIndex) => {
                    const regionName = feature.properties.name; // GeoJSONの区域名
                    const status = tsunamiStatusMap.get(regionName); // 警報状況を取得

                    if (status) { // 警報/注意報が発表されている場合
                        const coordinates = feature.geometry.coordinates;
                        const grade = status.grade;
                        const immediate = status.immediate;

                        // Polygon (穴がないと仮定)
                        if (feature.geometry.type === "Polygon" && coordinates.length > 0) {
                            const outerRing = coordinates[0]; // 外側のリング

                            const ringX = [];
                            const ringY = [];
                            const ringZ = [];

                            // 座標を球面3Dに変換
                            outerRing.forEach(coord => {
                                const lon = coord[0];
                                const lat = coord[1];
                                const lonRad = lon * Math.PI / 180;
                                const latRad = lat * Math.PI / 180;

                                const x = TSUNAMI_SPHERE_RADIUS_KM * Math.cos(latRad) * Math.cos(lonRad);
                                const y = TSUNAMI_SPHERE_RADIUS_KM * Math.cos(latRad) * Math.sin(lonRad);
                                const z = TSUNAMI_SPHERE_RADIUS_KM * Math.sin(latRad);

                                // Plotly の軸定義に合わせる (X=経度, Y=緯度, Z=奥行き)
                                tsunamiX.push(x);
                                tsunamiY.push(y);
                                tsunamiZ.push(z);
                                ringX.push(x);
                                ringY.push(y);
                                ringZ.push(z);
                            });

                            // 頂点数を取得
                            const numVertices = ringX.length;

                            // i, j, k インデックスを生成 (簡単な方法: 扇状に三角形分割)
                            // 注意: これは単純な近似です。複雑なポリゴンには delaunay triangulation などが適します。
                            if (numVertices >= 3) {
                                for (let i = 1; i < numVertices - 1; i++) {
                                    tsunamiIndices.push(vertexIndex);       // i
                                    tsunamiIndices.push(vertexIndex + i);   // j
                                    tsunamiIndices.push(vertexIndex + i + 1); // k
                                }
                            }

                            // 色とテキストを各頂点に割り当て
                            const color = grade === "Warning" ? 'red' : grade === "Watch" ? 'orange' : 'yellow';
                            const text = `${regionName}<br>警報等級: ${grade}${immediate ? ' (直ちに来襲)' : ''}`;
                            for (let i = 0; i < numVertices; i++) {
                                 tsunamiColors.push(color);
                                 tsunamiTexts.push(text);
                            }

                            // 頂点インデックスを更新
                            vertexIndex += numVertices;
                        }
                        // MultiPolygon など他のタイプも必要に応じて処理
                    }
                });

                // 津波ポリゴントレースを作成 (mesh3d を使用)
                if (tsunamiIndices.length > 0 && tsunamiX.length > 0) {
                    // i, j, k を分離
                    const i_indices = [];
                    const j_indices = [];
                    const k_indices = [];
                    for (let idx = 0; idx < tsunamiIndices.length; idx += 3) {
                        i_indices.push(tsunamiIndices[idx]);
                        j_indices.push(tsunamiIndices[idx + 1]);
                        k_indices.push(tsunamiIndices[idx + 2]);
                    }

                    tsunamiTraces.push({
                        type: 'mesh3d',
                        x: tsunamiX,
                        y: tsunamiY,
                        z: tsunamiZ,
                        i: i_indices,
                        j: j_indices,
                        k: k_indices,
                        name: '津波警報/注意報区域',
                        text: tsunamiTexts, // 各頂点のテキスト
                        hoverinfo: 'text',
                        color: tsunamiColors, // 各面の色 (一部のPlotlyバージョンでは facecolor が必要)
                        opacity: 0.4, // 半透明にして下の地図を見せる
                        showscale: false, // 色スケールバーを非表示
                        // facecolor を使用する場合 (頂点色から面色を設定)
                        // facecolor: tsunamiColors.slice(0, i_indices.length), // 各面の色を指定する方法も検討
                    });
                    console.log(`津波情報ポリゴントレースを作成しました。面数: ${i_indices.length}`);
                } else {
                     console.log("表示する津波区域ポリゴンデータがありません。");
                }
            } else {
                 console.log("津波情報または区域GeoJSONデータがありません。");
            }
            // --- 津波トレース生成のためのコード追加終了 ---

      // --- allData のチェック (変更なし) ---
      if (!Array.isArray(allData)) {
        console.warn("球面グラフ描画: allData が配列ではありません。");
        document.getElementById(containerId).innerHTML =
          "<p>表示するデータがありません (データ形式エラー)。</p>";
        return;
      }
      if (allData.length === 0) {
        console.warn("球面グラフ描画: allData が空です。");
        document.getElementById(containerId).innerHTML =
          "<p>表示する地震データがありません。</p>";
        return;
      }
      // --- allData のチェック ここまで ---

      // 1. データを準備
      const lats = [];
      const lons = [];
      const depths = []; // km
      const magnitudes = [];
      const hoverTexts = [];
      const sourceInfo = [];

      const x_coords = [];
      const y_coords = [];
      const z_coords = [];

      // --- 地球内部境界の定義 (追加開始) ---
      const EARTH_RADIUS_KM = 6371; // 平均地球半径を使用
      // 表示したい内部境界を定義 (深度km, 表示名, 色)
      const DISCONTINUITIES = [
        // { name: "地表", depth: 0, color: "blue", opacity: 0.1 }, // 地表は既存のearthSphereTraceで描画
        // { name: "核・マントル境界 (CMB)", depth: 2891, color: "green", opacity: 0.6 },
        {
          name: "660 km 不連続面",
          depth: 660,
          color: "darkblue",
          opacity: 0.8,
        },
        //{ name: "410 km 不連続面", depth: 410, color: "yellow", opacity: 0.2 },

        // 必要に応じて他の境界を追加
        // { name: "岩石圏底", depth: 100, color: "green", opacity: 0.15 },
        // { name: "外核・内核境界 (ICB)", depth: 5150, color: "purple", opacity: 0.25 },
      ];

      // 半径に変換 (中心からの距離)
      const internalSpheres = DISCONTINUITIES.map((d) => ({
        ...d,
        radius: EARTH_RADIUS_KM - d.depth,
      }));
      // --- 地球内部境界の定義 (追加終了) ---

      allData.forEach((item) => {
        let lat, lon, depth, mag, location, source;

        if (item.geometry && item.properties) {
          // USGS
          lat = parseFloat(item.geometry.coordinates[1]);
          lon = parseFloat(item.geometry.coordinates[0]);
          depth = parseFloat(item.geometry.coordinates[2]);
          mag = parseFloat(item.properties.mag);
          location = item.properties.place || "不明";
          source = "USGS";
        } else if (item.lat !== undefined && item.lng !== undefined) {
          // JMA
          lat = parseFloat(item.lat);
          lon = parseFloat(item.lng);
          depth = parseFloat(item.depth);
          mag = parseFloat(item.magnitude);
          location = item.location || item.Title || "不明";
          source = item.source || "不明";
        } else if (
          item.type === "Feature" &&
          item.geometry &&
          item.properties
        ) {
          // EMSC
          const coords = item.geometry.coordinates;
          if (coords && coords.length >= 3) {
            lon = parseFloat(coords[0]);
            lat = parseFloat(coords[1]);
            depth = parseFloat(coords[2]);
            mag = parseFloat(item.properties.mag);
            location =
              item.properties.place || item.properties.flynn_region || "不明";
            source = "EMSC";
          }
        }
        // ... 他の形式 ...

        if (!isNaN(lat) && !isNaN(lon) && !isNaN(depth) && !isNaN(mag)) {
          lats.push(lat);
          lons.push(lon);
          depths.push(depth);
          magnitudes.push(mag);
          hoverTexts.push(
            `場所: ${location}<br>緯度: ${lat.toFixed(
              4
            )}<br>経度: ${lon.toFixed(4)}<br>深さ: ${depth.toFixed(
              1
            )} km<br>マグニチュード: ${mag.toFixed(1)}<br>情報源: ${source}`
          );
          sourceInfo.push(source);

          // === 球面座標変換 ===
          const EARTH_RADIUS_KM = 6370.137; // 地球の半径 (km)

          const adjustedRadius = Math.max(0.1, EARTH_RADIUS_KM - depth);

          const phi = (90 - lat) * (Math.PI / 180); // colatitude
          const theta = (lon + 180) * (Math.PI / 180); // longitude 0-360

          const x = adjustedRadius * Math.sin(phi) * Math.cos(theta);
          const y = adjustedRadius * Math.sin(phi) * Math.sin(theta);
          const z = adjustedRadius * Math.cos(phi);

          x_coords.push(x);
          y_coords.push(y);
          z_coords.push(z);
        }
      });

      if (x_coords.length === 0) {
        console.warn("球面グラフ描画: 有効な地震データがありません。");
        document.getElementById(containerId).innerHTML =
          "<p>有効な地震データがありません。</p>";
        return;
      }
      // --- 内部境界球面の生成とトレース作成 (追加開始) ---
      const internalSphereTraces = [];

      // 各内部境界に対して球面データを生成し、トレースを作成
      internalSpheres.forEach((internalSphere) => {
        const { radius, name, color, opacity } = internalSphere;
        const sphere_x = [];
        const sphere_y = [];
        const sphere_z = [];

        // 球面データ生成 (earthSphereTrace と同様のロジック)
        const u = Array.from({ length: 30 }, (_, i) => (i / 29) * 2 * Math.PI); // 精度を若干落とす
        const v = Array.from({ length: 30 }, (_, i) => (i / 29) * Math.PI);

        for (let i = 0; i < u.length; i++) {
          const theta = u[i]; // 経度 (0 to 2π)
          const row_x = [];
          const row_y = [];
          const row_z = [];
          for (let j = 0; j < v.length; j++) {
            const phi = v[j]; // 余緯 (0 to π)
            const x = radius * Math.sin(phi) * Math.cos(theta);
            const y = radius * Math.sin(phi) * Math.sin(theta);
            const z = radius * Math.cos(phi);
            row_x.push(x);
            row_y.push(y);
            row_z.push(z);
          }
          sphere_x.push(row_x);
          sphere_y.push(row_y);
          sphere_z.push(row_z);
        }

        // 内部境界球面のトレース定義
        internalSphereTraces.push({
          type: "surface",
          x: sphere_x,
          y: sphere_y,
          z: sphere_z,
          name: name,
          opacity: opacity,
          showscale: false,
          hoverinfo: "name", // ホバーで名前を表示
          colorscale: [
            [0, color],
            [1, color],
          ], // 単色
          showsurface: true,
          surfacecolor: sphere_z.map((row) => row.map(() => 0)), // 単色表示のためのダミーデータ
        });
      });
      // --- 内部境界球面の生成とトレース作成 (追加終了) ---
      // 2. 地球球体を描画

      const u = Array.from({ length: 50 }, (_, i) => (i / 49) * 2 * Math.PI);
      const v = Array.from({ length: 50 }, (_, i) => (i / 49) * Math.PI);

      const sphere_x = [];
      const sphere_y = [];
      const sphere_z = [];

      for (let i = 0; i < v.length; i++) {
        const row_x = [];
        const row_y = [];
        const row_z = [];
        for (let j = 0; j < u.length; j++) {
          const phi = v[i];
          const theta = u[j];
          const x = EARTH_RADIUS_KM * Math.sin(phi) * Math.cos(theta);
          const y = EARTH_RADIUS_KM * Math.sin(phi) * Math.sin(theta);
          const z = EARTH_RADIUS_KM * Math.cos(phi);
          row_x.push(x);
          row_y.push(y);
          row_z.push(z);
        }
        sphere_x.push(row_x);
        sphere_y.push(row_y);
        sphere_z.push(row_z);
      }

      // 3. トレース定義
      const uniqueSources = [...new Set(sourceInfo)];
      const earthquakeTraces = uniqueSources.map((src) => {
        const indices = sourceInfo
          .map((s, i) => (s === src ? i : null))
          .filter((i) => i !== null);
        return {
          type: "scatter3d",
          mode: "markers",
          x: indices.map((i) => x_coords[i]),
          y: indices.map((i) => y_coords[i]),
          z: indices.map((i) => z_coords[i]),
          name: src,
          text: indices.map((i) => hoverTexts[i]),
          hoverinfo: "text",
          marker: {
            size: indices.map((i) => Math.max(2, (5 + Math.pow(magnitudes[i], 1.7)))),
            sizemode: "diameter",
            opacity: 0.8,
          },
        };
      });

      const earthSphereTrace = {
        type: "surface",
        x: sphere_x,
        y: sphere_y,
        z: sphere_z,
        opacity: 0,
        showscale: false,
        hoverinfo: "none",
        colorscale: [
          [0, "darkgray"],
          [1, "darkgray"],
        ],
        name: "地球",
      };

      // === 新規: プレート境界線データの取得と処理 ===
      let plateBoundariesTrace = null; // 初期化
      try {
        console.log("プレート境界データを取得します...");
        const response = await fetch(
          "https://raw.githubusercontent.com/fraxen/tectonicplates/master/GeoJSON/PB2002_boundaries.json"
        );
        if (!response.ok) {
          throw new Error(
            `プレート境界データ取得エラー: HTTP status ${response.status}`
          );
        }
        const plateData = await response.json();
        console.log("プレート境界データを取得しました。");

        // 境界線の座標を格納する配列
        const plateX = [];
        const plateY = [];
        const plateZ = [];

        // 各 Feature (境界線セグメント) を処理
        plateData.features.forEach((feature) => {
          if (feature.geometry.type === "LineString") {
            const coordinates = feature.geometry.coordinates; // [ [lng, lat], [lng, lat], ... ]
            coordinates.forEach((coord) => {
              const lon = coord[0];
              const lat = coord[1];
              // NaN チェック
              if (isNaN(lat) || isNaN(lon)) return;

              // 球面座標変換 (深さ 0 km として地球表面にプロット)
              const adjustedRadius = EARTH_RADIUS_KM; // 表面にプロット

              const phi = (90 - lat) * (Math.PI / 180); // colatitude
              const theta = (lon + 180) * (Math.PI / 180); // longitude 0-360

              const x = adjustedRadius * Math.sin(phi) * Math.cos(theta);
              const y = adjustedRadius * Math.sin(phi) * Math.sin(theta);
              const z = adjustedRadius * Math.cos(phi);

              plateX.push(x);
              plateY.push(y);
              plateZ.push(z);
            });
            // 各 LineString の終端に NaN を挿入して、線が繋がりすぎないようにする
            plateX.push(NaN);
            plateY.push(NaN);
            plateZ.push(NaN);
          }
          // MultiLineString など他の geometry type にも対応可能だが、ここでは LineString のみ処理
        });

        // 境界線トレースを作成
        if (plateX.length > 0) {
          plateBoundariesTrace = {
            type: "scatter3d",
            mode: "lines", // 線で描画
            x: plateX,
            y: plateY,
            z: plateZ,
            line: {
              color: "orange", // 線の色
              width: 2.5, // 線の太さ
            },
            name: "プレート境界",
            hoverinfo: "skip", // ホバー情報を非表示
          };
          console.log("プレート境界線トレースを作成しました。");
        } else {
          console.warn(
            "プレート境界線データから有効なポイントが生成されませんでした。"
          );
        }
      } catch (error) {
        console.error(
          "プレート境界データの取得または処理中にエラーが発生しました:",
          error
        );
        // エラーが発生してもグラフの描画は継続
      }
      // === 新規: Datamaps World.json データの取得と処理 ===
      let worldMapTrace = null;
      try {
        // ✅ 修正: Datamaps の world.json を使用
        const WORLD_MAP_URL = "custom.geohigh.json";
        console.log("世界地図データ (Datamaps) を取得します...", WORLD_MAP_URL);
        const response = await fetch(WORLD_MAP_URL);
        if (!response.ok) {
          throw new Error(
            `世界地図データ取得エラー: HTTP status ${response.status}`
          );
        }
        const worldData = await response.json();
        console.log("世界地図データ (Datamaps) を取得しました。");

        const worldX = [];
        const worldY = [];
        const worldZ = [];

        worldData.features.forEach((feature) => {
          // Polygon と MultiPolygon の両方を処理
          if (feature.geometry.type === "Polygon") {
            // Polygon はリングの配列 [ [ [lng, lat], ... ], [ [lng, lat], ... (穴) ] ]
            feature.geometry.coordinates.forEach((ring) => {
              // 各リングを処理
              ring.forEach((coord) => {
                const lon = coord[0];
                const lat = coord[1];
                if (isNaN(lat) || isNaN(lon)) return;

                // 球面座標変換 (地球表面にプロット)
                const adjustedRadius = EARTH_RADIUS_KM;
                const phi = (90 - lat) * (Math.PI / 180);
                const theta = (lon + 180) * (Math.PI / 180);

                const x = adjustedRadius * Math.sin(phi) * Math.cos(theta);
                const y = adjustedRadius * Math.sin(phi) * Math.sin(theta);
                const z = adjustedRadius * Math.cos(phi);

                worldX.push(x);
                worldY.push(y);
                worldZ.push(z);
              });
              // 各リングの終端に NaN を挿入
              worldX.push(NaN);
              worldY.push(NaN);
              worldZ.push(NaN);
            });
            // Polygon 全体の終端にも NaN を挿入 (オプション、Feature間の区切り)
            worldX.push(NaN);
            worldY.push(NaN);
            worldZ.push(NaN);
          } else if (feature.geometry.type === "MultiPolygon") {
            // MultiPolygon は Polygon の配列 [ [ [ [lng, lat], ... ], ... ], [ [ [lng, lat], ... ], ... ] ]
            feature.geometry.coordinates.forEach((polygonCoords) => {
              // 各 Polygon を処理
              polygonCoords.forEach((ring) => {
                // 各リングを処理
                ring.forEach((coord) => {
                  const lon = coord[0];
                  const lat = coord[1];
                  if (isNaN(lat) || isNaN(lon)) return;

                  const adjustedRadius = EARTH_RADIUS_KM;
                  const phi = (90 - lat) * (Math.PI / 180);
                  const theta = (lon + 180) * (Math.PI / 180);

                  const x = adjustedRadius * Math.sin(phi) * Math.cos(theta);
                  const y = adjustedRadius * Math.sin(phi) * Math.sin(theta);
                  const z = adjustedRadius * Math.cos(phi);

                  worldX.push(x);
                  worldY.push(y);
                  worldZ.push(z);
                });
                // 各リングの終端に NaN を挿入
                worldX.push(NaN);
                worldY.push(NaN);
                worldZ.push(NaN);
              });
              // 各 Polygon の終端にも NaN を挿入 (オプション)
              worldX.push(NaN);
              worldY.push(NaN);
              worldZ.push(NaN);
            });
            // MultiPolygon 全体の終端にも NaN を挿入 (オプション)
            worldX.push(NaN);
            worldY.push(NaN);
            worldZ.push(NaN);
          }
          // 他の geometry type (例: Point, LineString) はここでは無視
        });

        if (worldX.length > 0) {
          worldMapTrace = {
            type: "scatter3d",
            mode: "lines", // 線で境界を描画
            x: worldX,
            y: worldY,
            z: worldZ,
            line: {
              color: "white", // 色を指定 (例: 白)
              width: 4.8, // 線の太さを指定 (細く)
            },
            name: "世界地図境界",
            hoverinfo: "skip", // 国名などの情報はここでは非表示
          };
          console.log("世界地図 (Datamaps) トレースを作成しました。");
        } else {
          console.warn(
            "世界地図データ (Datamaps) から有効なポイントが生成されませんでした。"
          );
        }
      } catch (error) {
        console.error(
          "世界地図データ (Datamaps) の取得または処理中にエラーが発生しました:",
          error
        );
        console.warn(
          "世界地図データの読み込みに失敗しましたが、他の要素は表示されます。"
        );
      }
      // === 新規: Datamaps World.json データの取得と処理 ここまで ===

      // 4. すべてのトレースを結合 (worldMapTrace を追加)
      // 描画順序: 球体 -> 世界地図 -> プレート境界 -> 地震データ
      const allTraces = [
        ...internalSphereTraces, // 内部境界 (中心に近い順に定義されている想定)
        // 地表
        ...(worldMapTrace ? [worldMapTrace] : []),
        ...(plateBoundariesTrace ? [plateBoundariesTrace] : []),
        ...earthquakeTraces, // 地震データ
                        ...tsunamiTraces // <-- 追加: 津波トレース

      ];

      // 5. レイアウト (タイトル変更)
      const layout = {
        title: "地震データ 3D 球面プロット (世界地図/プレート境界/津波情報)",
        font: { color: "white" },
        paper_bgcolor: "black", // グラフ全体の背景色
        plot_bgcolor: "black", // プロット領域の背景色

        scene: {
          aspectmode: "data",
        },
        margin: { l: 0, r: 0, b: 0, t: 50 },
      };

      // 6. 描画 (Plotly.react を使用して視点を維持)
      // Plotly.newPlot(containerId, allTraces, layout); // 変更前
      Plotly.react(containerId, allTraces, layout); // ✅ react を使用
    } catch (error) {
      console.error("Plotly 球面グラフ描画エラー:", error);
      document.getElementById(containerId).innerHTML =
        "<p>球面グラフの描画中にエラーが発生しました。</p>";
    }
  })();
}
initNotificationSettings();

// --- 津波情報取得機能 ---
const tsunamiDataContainer = document.getElementById("tsunamiData");
const tsunamiStatusElement = document.getElementById("tsunamiStatus");
const refreshBtn = document.getElementById("refreshTsunamiBtn");
const autoRefreshCheckbox = document.getElementById("autoRefreshTsunami");

let autoRefreshInterval = null;

// 最終更新時刻をフォーマットする関数
function formatUpdateTime(date) {
  const now = new Date();
  const diffMs = now - date;
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) {
    return `${diffSecs}秒前`;
  } else if (diffMins < 60) {
    return `${diffMins}分前`;
  } else if (diffHours < 24) {
    return `${diffHours}時間前`;
  } else {
    return `${diffDays}日前`;
  }
}

// 津波情報を取得して表示する関数
async function fetchTsunamiData() {
  tsunamiDataContainer.innerHTML =
    '<div class="loading">津波情報を読み込んでいます...</div>';
  tsunamiStatusElement.textContent = "更新中...";

  try {
    const response = await fetch("https://api.p2pquake.net/v2/jma/tsunami");
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();

    // 最終更新時刻を表示
    const lastUpdate = new Date();
    tsunamiStatusElement.textContent = `最終更新: ${formatUpdateTime(
      lastUpdate
    )} (${lastUpdate.toLocaleString("ja-JP")})`;

    if (!data || data.length === 0) {
      tsunamiDataContainer.innerHTML =
        '<div class="no-data">津波情報がありません。</div>';
      return;
    }

    // APIは配列を返すが、通常最新の1件のみ表示
    const latestTsunamiInfo = data[0]; // 最新の情報を取得

    if (latestTsunamiInfo.cancelled) {
      tsunamiDataContainer.innerHTML = `
                            <div class="tsunami-item">
                                <p class="no-tsunami-warning">津波警報・注意報はすべて解除されました。</p>
                                <p class="tsunami-time">発表時刻: ${new Date(
                                  latestTsunamiInfo.time
                                ).toLocaleString("ja-JP")}</p>
                            </div>
                        `;
      return;
    }

    if (!latestTsunamiInfo.areas || latestTsunamiInfo.areas.length === 0) {
      tsunamiDataContainer.innerHTML = `
                            <div class="tsunami-item">
                                <p class="no-tsunami-warning">津波警報・注意報は発表されていません。</p>
                                <p class="tsunami-time">発表時刻: ${new Date(
                                  latestTsunamiInfo.time
                                ).toLocaleString("ja-JP")}</p>
                            </div>
                        `;
      return;
    }

    // 津波情報を表示
    let htmlContent = `<h3>発表時刻: ${new Date(
      latestTsunamiInfo.time
    ).toLocaleString("ja-JP")}</h3>`;
    latestTsunamiInfo.areas.forEach((area) => {
      const gradeText =
        area.grade === "Warning"
          ? "【警報】"
          : area.grade === "Watch"
          ? "【注意報】"
          : area.grade;
      const gradeClass =
        area.grade === "Warning"
          ? "tsunami-grade-warning"
          : area.grade === "Watch"
          ? "tsunami-grade-watch"
          : "";
      const gradeitem =
        area.grade === "Warning"
          ? "tsunami-item-Warning"
          : area.grade === "Watch"
          ? "tsunami-item-Watch"
          : area.grade;
      const immediateText = area.immediate ? " (すぐ来る)" : "";
      const firstHeightCondition = area.firstHeight?.condition || "情報なし";
      const firstHeightTime = area.firstHeight?.arrivalTime
        ? ` (${new Date(area.firstHeight.arrivalTime).toLocaleTimeString(
            "ja-JP",
            { hour: "2-digit", minute: "2-digit" }
          )})`
        : "";
      const maxHeightDescription = area.maxHeight?.description || "情報なし";

      htmlContent += `
                            <div class="${gradeitem}">
                                <div class="tsunami-area-name">${area.name}</div>
                                <p class="tsunami-grade ${gradeClass}">${gradeText}${immediateText}</p>
                                <p class="tsunami-height">第1波到達予測: ${firstHeightCondition}${firstHeightTime}</p>
                                <p class="tsunami-height">予想最大波高: ${maxHeightDescription}</p>
                            </div>
                        `;
    });

    tsunamiDataContainer.innerHTML = htmlContent;
  } catch (error) {
    console.error("津波情報の取得中にエラーが発生しました:", error);
    tsunamiDataContainer.innerHTML = `<div class="error">津波情報の取得に失敗しました: ${error.message}</div>`;
    tsunamiStatusElement.textContent = "更新失敗";
  }
}

// 手動更新ボタン
refreshBtn.addEventListener("click", fetchTsunamiData);
// --- 新規関数: 津波区域GeoJSONデータを取得 ---
async function fetchTsunamiAreaGeoJson() {
    try {
        const response = await fetch("https://www.jma.go.jp/bosai/common/const/geojson/tsunami.json");
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        tsunamiAreaGeoJsonData = await response.json();
        console.log("津波区域GeoJSONデータを取得しました。");
    } catch (error) {
        console.error("津波区域GeoJSONデータの取得エラー:", error);
        tsunamiAreaGeoJsonData = null; // エラー時は null に設定
    }
}
// --- 新規関数: 地図上に津波レイヤーを追加/更新 ---
function updateTsunamiLayerOnMap() {
    // 既存の津波レイヤーがあれば削除
    if (tsunamiLayer && map.hasLayer(tsunamiLayer)) {
        map.removeLayer(tsunamiLayer);
        tsunamiLayer = null;
        console.log("既存の津波レイヤーを削除しました。");
    }

    // データが揃っているかチェック
    if (!tsunamiAreaGeoJsonData || !latestTsunamiInfo || latestTsunamiInfo.cancelled || !latestTsunamiInfo.areas) {
        console.log("津波レイヤーを表示するデータがありません。");
        return;
    }

    // 1. 警報状況データをマップ化 (区域名 -> {grade, immediate})
    const tsunamiStatusMap = new Map();
    latestTsunamiInfo.areas.forEach(area => {
        if (area.regions && area.regions.length > 0) {
            area.regions.forEach(region => {
                 // APIの区域名をキーとして状態を保存
                 tsunamiStatusMap.set(region.name, {
                     grade: region.grade,
                     immediate: region.immediate
                 });
            });
        }
    });

    // 2. GeoJSONデータを元に、スタイル付きのLeaflet GeoJSONレイヤーを作成
    try {
        tsunamiLayer = L.geoJSON(tsunamiAreaGeoJsonData, {
            style: function(feature) {
                const regionName = feature.properties.name; // GeoJSONの区域名
                const status = tsunamiStatusMap.get(regionName); // 警報状況を取得

                if (status) {
                    // 警報/注意報が発表されている区域
                    let fillColor = 'gray'; // デフォルト色
                    let opacity = 0.0; // デフォルトは非表示
                    if (status.grade === "Warning") {
                        fillColor = 'red';
                        opacity = 0.5;
                    } else if (status.grade === "Watch") {
                        fillColor = 'orange';
                        opacity = 0.5;
                    } else {
                        // その他の状態 (例: "Forecast", "None" など)
                        fillColor = 'yellow';
                        opacity = 0.3;
                    }
                    return {
                        fillColor: fillColor,
                        color: "black", // 境界線の色
                        weight: 1, // 境界線の太さ
                        opacity: 0.7, // 境界線の透明度
                        fillOpacity: opacity // 塗りつぶしの透明度
                    };
                } else {
                    // 警報が出ていない区域は非表示または薄く表示
                    return {
                        fillColor: 'gray',
                        color: "black",
                        weight: 0.5,
                        opacity: 0.2,
                        fillOpacity: 0.0 // 完全に透明
                    };
                }
            },
            onEachFeature: function(feature, layer) {
                const regionName = feature.properties.name;
                const status = tsunamiStatusMap.get(regionName);
                if (status) {
                    // ポップアップやツールチップを追加 (オプション)
                    let popupContent = `<b>${regionName}</b><br>警報等級: ${status.grade}`;
                    if (status.immediate) {
                       popupContent += "<br><b>直ちに来襲</b>";
                    }
                    layer.bindPopup(popupContent);
                    // layer.bindTooltip(regionName); // ツールチップも可能
                }
            }
        });

        // 3. 地図にレイヤーを追加
        if (tsunamiLayer) {
            tsunamiLayer.addTo(map);
            console.log("津波レイヤーを地図に追加しました。");
        }

    } catch (error) {
        console.error("津波GeoJSONレイヤーの作成または追加中にエラーが発生しました:", error);
    }
}
// 自動更新機能
function startAutoRefresh() {
  if (autoRefreshInterval) clearInterval(autoRefreshInterval);
  autoRefreshInterval = setInterval(() => {
    // タブがアクティブな時のみ更新
    if (document.getElementById("tab1_1").classList.contains("active")) {
      fetchTsunamiData();
    }
  }, 30000); // 30秒ごと
}

function stopAutoRefresh() {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
    autoRefreshInterval = null;
  }
}

autoRefreshCheckbox.addEventListener("change", (e) => {
  if (e.target.checked) {
    startAutoRefresh();
  } else {
    stopAutoRefresh();
  }
});

// 初期状態で自動更新を開始
startAutoRefresh();

// ページ読み込み時またはタブ切り替え時にデータを取得
// DOMContentLoaded内で tab1_1 が最初からアクティブなら取得
// ここではタブ切り替えイベントで処理するので、初期は不要
// fetchTsunamiData(); // 最初から tab1_1 を表示する場合は有効化
function parseLocalTimeToUTCDate(dateTimeStr, offsetHours = 8) {
    // 入力チェック
    if (!dateTimeStr || typeof dateTimeStr !== 'string') {
        console.warn("parseLocalTimeToUTCDate: 無効な日時文字列です:", dateTimeStr);
        return null;
    }

    // 文字列を年、月、日、時、分、秒に分割 (例: "2025-04-05 14:30:00")
    const parts = dateTimeStr.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/);
    if (!parts) {
         // パターンが一致しない場合、ISO形式や他の形式を試すことも可能
         // ここでは簡略化のため、失敗として扱う
         console.warn("parseLocalTimeToUTCDate: 日時文字列の形式が正しくありません:", dateTimeStr);
         return null;
    }

    // Dateコンストラクタは月が0始まりなので、1引く
    // Date.UTC は引数がUTC時刻を表す値を期待するため、オフセットを引いて調整
    const utcDate = new Date(Date.UTC(
        parseInt(parts[1], 10), // year
        parseInt(parts[2], 10) - 1, // month (0-11)
        parseInt(parts[3], 10), // day
        parseInt(parts[4], 10) - offsetHours, // hour (UTCに変換)
        parseInt(parts[5], 10), // minute
        parseInt(parts[6], 10)  // second
    ));

    // 結果が有効な日付かチェック
    if (isNaN(utcDate.getTime())) {
         console.warn("parseLocalTimeToUTCDate: Dateオブジェクトの生成に失敗しました:", dateTimeStr);
         return null;
    }

    return utcDate;
}
function formatUTCDateToJSTString(utcDate) {
    if (!utcDate || isNaN(utcDate.getTime())) {
         console.warn("formatUTCDateToJSTString: 無効なDateオブジェクトです:", utcDate);
         return "日時不明";
    }
    // toLocaleString にタイムゾーンを明示的に指定
    return utcDate.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
    // もしくは、カスタムフォーマットを使用したい場合は formatJmaXmlTime のような関数を流用・修正
    // return `${utcDate.getUTCFullYear()}/${String(utcDate.getUTCMonth() + 1).padStart(2, "0")}/${String(utcDate.getUTCDate()).padStart(2, "0")} ${String(utcDate.getUTCHours() + 9).padStart(2, "0")}:${String(utcDate.getUTCMinutes()).padStart(2, "0")}:${String(utcDate.getUTCSeconds()).padStart(2, "0")}`;
}
function parseBmkgWibTimeToUTCDate(wibDateTimeStr) {
    if (!wibDateTimeStr || typeof wibDateTimeStr !== 'string') {
        console.warn("parseBmkgWibTimeToUTCDate: 無効な日時文字列です:", wibDateTimeStr);
        return null;
    }

    // 月名のマッピング (インドネシア語 -> 英語)
    const monthMap = {
        "Jan": 0, "Feb": 1, "Mar": 2, "Apr": 3, "Mei": 4, "Jun": 5,
        "Jul": 6, "Agu": 7, "Sep": 8, "Okt": 9, "Nov": 10, "Des": 11
    };

    // 正規表現で日時文字列を分解
    // 例: "01 Agu 2025 11:11:15"
    const parts = wibDateTimeStr.match(/^(\d{2})\s+(\w{3})\s+(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
    if (!parts) {
        console.warn("parseBmkgWibTimeToUTCDate: 日時文字列の形式が正しくありません:", wibDateTimeStr);
        return null;
    }

    const day = parseInt(parts[1], 10);
    const monthAbbr = parts[2];
    const year = parseInt(parts[3], 10);
    const hours = parseInt(parts[4], 10);
    const minutes = parseInt(parts[5], 10);
    const seconds = parseInt(parts[6], 10);

    const monthIndex = monthMap[monthAbbr];
    if (monthIndex === undefined) {
        console.warn("parseBmkgWibTimeToUTCDate: 無効な月の略称です:", monthAbbr);
        return null;
    }

    // WIB (UTC+7) を考慮してUTC Dateオブジェクトを作成
    // Date.UTC は引数がUTC時刻を表す値を期待するため、WIB時刻から7時間を引く
    const utcDate = new Date(Date.UTC(year, monthIndex, day, hours - 7, minutes, seconds));

    if (isNaN(utcDate.getTime())) {
        console.warn("parseBmkgWibTimeToUTCDate: Dateオブジェクトの生成に失敗しました:", wibDateTimeStr);
        return null;
    }

    return utcDate;
}