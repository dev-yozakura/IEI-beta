// main.js

/**
 * Earthquake Monitor Application Main Entry Point
 * This script orchestrates the initialization and interaction between
 * StateManager, DataProcessor, UIRenderer, and EventHandlers.
 */

// --- 1. グローバル変数の再エクスポート (既存コードとの互換性維持) ---
// 既存コードがこれらの変数に直接アクセスしている可能性があるため、
// StateManager の状態を参照するようにします。
// ただし、直接代入は避けて、StateManager経由で操作するようにリファクタリング推奨です。
window.combinedData = new Proxy(
  {},
  {
    get: function (target, prop) {
      console.warn(
        `Deprecated: Direct access to global 'combinedData.${prop}'. Use stateManager.getState().combinedData.${prop} instead.`
      );
      return window.stateManager.getState().combinedData[prop];
    },
    set: function (target, prop, value) {
      console.warn(
        `Deprecated: Direct modification of global 'combinedData.${prop}'. Use stateManager.updateCombinedData('${prop}', value) instead.`
      );
      window.stateManager.updateCombinedData(prop, value);
      return true; // Indicates success
    },
  }
);

window.allData = new Proxy([], {
  get: function (target, prop) {
    if (prop === "length" || !isNaN(prop)) {
      // Array-like access
      console.warn(
        `Deprecated: Direct access to global 'allData[${prop}]'. Use stateManager.getState().allData[${prop}] instead.`
      );
    } else {
      console.warn(
        `Deprecated: Accessing property '${prop}' on global 'allData'. Use stateManager.getState().allData instead.`
      );
    }
    return window.stateManager.getState().allData[prop];
  },
  set: function (target, prop, value) {
    if (prop === "length") {
      console.warn(
        `Deprecated: Direct modification of global 'allData.length'. Use stateManager.updateAllData([]) to clear or push items individually.`
      );
      // For simplicity, we allow length setting, but it's not ideal.
      // A better approach is to manage the array through stateManager methods.
    } else if (!isNaN(prop)) {
      console.warn(
        `Deprecated: Direct modification of global 'allData[${prop}]'. Manage the array through stateManager.updateAllData().`
      );
      // This is complex to proxy correctly for array modifications.
      // It's better to use stateManager methods.
    } else {
      console.warn(
        `Deprecated: Setting property '${prop}' on global 'allData'.`
      );
    }
    window.stateManager.getState().allData[prop] = value; // Direct modification on state
    // Trigger UI update if needed? Better to use stateManager events.
    return true;
  },
});

// 他の重要なグローバル変数も同様にプロキシでラップするか、
// または、既存コードがアクセスする可能性のあるものだけをエクスポート
// (この例では主要なもののみ)
window.latestTsunamiInfo = new Proxy(
  {},
  {
    get: function (target, prop) {
      return window.stateManager.getState().latestTsunamiInfo?.[prop];
    },
    set: function (target, prop, value) {
      console.warn(
        `Deprecated: Direct modification of global 'latestTsunamiInfo.${prop}'. Use stateManager.updateTsunamiData('latestTsunamiInfo', {...}) instead.`
      );
      const currentState =
        window.stateManager.getState().latestTsunamiInfo || {};
      window.stateManager.updateTsunamiData("latestTsunamiInfo", {
        ...currentState,
        [prop]: value,
      });
      return true;
    },
  }
);

// 接続状態なども必要に応じてプロキシ化
// ただし、多くの場合は StateManager のイベントを通じてUIが更新されるべき

// --- 2. グローバル関数の再定義/エクスポート ---
// 既存コードがこれらの関数を直接呼び出している可能性があるため、
// 新しいモジュールの関数をラップしてエクスポートします。

// データ取得関数 (EventHandlers に移動済みのものをラップ)
window.fetchTsunamiData = () => window.eventHandlers.fetchTsunamiData();
window.initMap = () => window.eventHandlers.initMap();
// 他の fetch***Data 関数は、グローバルに残っている想定 (例: fetchUsgsData)
// それらも EventHandlers から呼び出すようにリファクタリング推奨
// ここでは例として、fetchUsgsData がグローバルに存在すると仮定し、それを呼び出すハンドラーを設定
window.handleFetchUsgsData = () => window.eventHandlers.handleFetchData("usgs");
window.handleFetchBmkgData = () => window.eventHandlers.handleFetchData("bmkg");
window.handleFetchBmkg_M5Data = () =>
  window.eventHandlers.handleFetchData("bmkg_M5");

// WebSocket接続/切断関数 (EventHandlers に移動済みのものをラップ)
window.handleConnectJmaEew = () =>
  window.eventHandlers.handleWebSocketToggle("jmaEew", true);
window.handleDisconnectJmaEew = () =>
  window.eventHandlers.handleWebSocketToggle("jmaEew", false);
// 他の WebSocket 用関数も同様に

// --- 3. アプリケーション初期化関数 ---
async function initializeApp() {
  console.log("Main: アプリケーション初期化開始");

  try {
    // a. テーマ設定の読み込みと適用
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "dark") {
      document.body.classList.add("dark-mode");
      const themeToggleBtn = document.getElementById("themeToggle");
      if (themeToggleBtn) {
        themeToggleBtn.textContent = "ライトモード";
      }
    }

    // b. StateManager から設定を読み込み
    window.stateManager.loadFromLocalStorage();
    console.log("Main: StateManager 設定読み込み完了");

    // c. UIに設定を反映 (通知設定など)
    // これは eventHandlers.js の setupEventListeners で行われるが、
    // 必要に応じてここで初期値を設定することも可能
    // 例:
    // const state = window.stateManager.getState();
    // document.getElementById("enableNotification").checked = state.settings.enableNotification;

    // d. 初期データ取得
    console.log("Main: 初期データ取得開始");
    // 必要なデータを並列または逐次取得
    // 例: USGS, BMKG, JMA XML (初回)
    const initialFetchPromises = [];
    // USGSは設定変更時にも取得するので、初期化時も取得
    if (typeof window.fetchUsgsData === "function") {
      initialFetchPromises.push(
        window
          .fetchUsgsData()
          .catch((err) => console.error("初期USGSデータ取得エラー:", err))
      );
    }
    // BMKG
    if (typeof window.fetchBmkgData === "function") {
      initialFetchPromises.push(
        window
          .fetchBmkgData()
          .catch((err) => console.error("初期BMKGデータ取得エラー:", err))
      );
    }
    // BMKG M5
    if (typeof window.fetchBmkg_M5Data === "function") {
      initialFetchPromises.push(
        window
          .fetchBmkg_M5Data()
          .catch((err) => console.error("初期BMKG M5データ取得エラー:", err))
      );
    }
    // JMA XML (タイマーではなく、ここで一度取得)
    if (typeof window.initialJmaXmlFetch === "function") {
      // initialJmaXmlFetch はタイマーも設定するので、await する必要があるか確認
      // ここでは単純に呼び出し
      window
        .initialJmaXmlFetch()
        .catch((err) => console.error("初期JMA XMLデータ取得エラー:", err));
    }

    // 並列取得を待つ
    await Promise.all(initialFetchPromises);
    console.log("Main: 初期データ取得完了");

    // e. WebSocket接続 (設定に基づく)
    // 例: JMA EEW のチェックボックスがチェックされていれば接続
    const sourceJMAElement = document.getElementById("sourceJMA");
    if (sourceJMAElement && sourceJMAElement.checked) {
      window.handleConnectJmaEew(); // EventHandlers経由で接続
    }
    // 他のWebSocket接続も同様に

    // f. タイマー設定 (自動更新など)
    // 例: JMA XML の定期取得タイマー (initialJmaXmlFetch内で設定済み?)
    // 例: その他の自動取得タイマー
    // EventHandlers で handleStartAutoRefresh がタイマーを管理する想定

    // g. デフォルトタブの表示 (例: tab1_1)
    // EventHandlers で handleTabChange を呼び出す
    window.eventHandlers.handleTabChange("tab1_1"); // 津波情報タブをデフォルト表示

    console.log("Main: アプリケーション初期化完了");
  } catch (error) {
    console.error(
      "Main: アプリケーション初期化中にエラーが発生しました:",
      error
    );
    // エラーUIの表示など
    const combinedEqList = document.getElementById("combinedEqList");
    if (combinedEqList) {
      combinedEqList.innerHTML =
        "<p class='no-data'>アプリケーションの初期化中にエラーが発生しました。</p>";
    }
  }
}

// --- 4. DOMContentLoaded イベントリスナー ---
// このイベントは、HTMLドキュメントの初期読み込みと解析が完了したときに発生します。
// DOM操作を行うJavaScriptコードは、このイベントが発生するまで待機するべきです。
document.addEventListener("DOMContentLoaded", function () {
  console.log("Main: DOMContentLoaded イベント発火");

  // a. アプリケーションのコアロジックを初期化
  initializeApp();

  // b. EventHandlers の初期化 (既に initEventHandlers が呼ばれているか確認)
  // eventHandlers.js で window.eventHandlers.initEventHandlers() が呼ばれる想定
  // それが呼ばれていない場合や、追加の設定が必要な場合はここで行う
  // 例: 特定の要素にイベントリスナーを追加するなど
  // (多くのイベントリスナーは eventHandlers.js で設定済み)

  // c. タブインジケーターの初期位置設定 (提供されたコードから流用)
  function updateIndicator() {
    const activeButton = document.querySelector(".tab-btn.active");
    const tabIndicator = document.querySelector(".tab-indicator");
    if (activeButton && tabIndicator) {
      const activeButtonRect = activeButton.getBoundingClientRect();
      const containerRect = activeButton.parentElement.getBoundingClientRect();
      tabIndicator.style.width = `${activeButtonRect.width}px`;
      tabIndicator.style.left = `${
        activeButtonRect.left - containerRect.left
      }px`;
    }
  }
  updateIndicator(); // 初期位置設定

  // d. ウィンドウリサイズ時のタブインジケーター更新 (提供されたコードから流用)
  window.addEventListener("resize", updateIndicator);

  // e. ページ読み込み時のチェックボックス状態同期 (通知設定など)
  // これは eventHandlers.js の setupEventListeners で行われるが、
  // 必要に応じてここで追加の同期を行うことも可能
  // 例:
  // const state = window.stateManager.getState();
  // document.getElementById("enableNotification").checked = state.settings.enableNotification;

  console.log("Main: DOMContentLoaded イベント処理完了");
});

// --- 5. Window Load イベントリスナー (オプション) ---
// このイベントは、DOMだけでなく、すべてのリソース（画像など）の読み込みが完了したときに発生します。
// 地図の初期化など、すべてのリソースが揃ってから行いたい処理に適しています。
window.addEventListener("load", function () {
  console.log("Main: Window Load イベント発火");
  // 例: 地図の最終調整、パフォーマンス測定の開始など
  // 地図の初期化はタブ切り替え時やDOMContentLoaded時に行われることが多いです。
  console.log("Main: Window Load イベント処理完了");
});

// --- 6. ページアンロード時イベントリスナー (オプション) ---
// ページが閉じられる前に状態を保存するなどに使用します。
window.addEventListener("beforeunload", function (event) {
  console.log("Main: BeforeUnload イベント発火");
  // a. StateManager の状態を localStorage に保存
  window.stateManager.saveToLocalStorage();
  console.log("Main: 状態を localStorage に保存しました。");
  // b. その他のクリーンアップ処理 (WebSocket切断など)
  // 各WebSocket接続の close メソッドを呼び出す
  // 例:
  // if (window.jmaEewWs) window.jmaEewWs.close();
  // if (window.emscWs) window.emscWs.close();
  // ... 他のWebSocket接続 ...
  console.log("Main: BeforeUnload イベント処理完了");
});

// --- 7. 既存コードとの互換性維持のためのグローバル関数/変数 (必要に応じて) ---
// 提供されたコードに特有の、新しいモジュールに移動していない関数や変数は、
// ここでグローバルに定義するか、または既存のスクリプトファイルに残します。
// 例: formatTimeAgo, getDepthColor, getDepthNumber, getMagnitudeInteger など
// これらが dataProcessor に移動済みであれば、以下のようにアクセスできます。
// window.formatTimeAgo = window.dataProcessor.formatTimeAgo; // 例

// --- 8. デバッグ用 (オプション) ---
// 開発中に状態を確認するためのグローバル関数
window.logAppState = () => window.stateManager.logState();

console.log("Main.js モジュール読み込み完了。");
