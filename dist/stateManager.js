// stateManager.js

/**
 * アプリケーションの状態を一元管理するクラス
 * 提供されたコードのグローバル変数に基づいて設計
 */
class StateManager {
  constructor() {
    // --- 1. 状態の初期定義 ---
    this.state = {
      // --- データ関連 ---
      // 統合表示用データオブジェクト
      combinedData: {
        jmaEew: null,
        scEew: null,
        fjEew: null,
        jmaEqList: [], // Array
        jmaHypoData: [], // Array
        cencEqList: {}, // Object (キー: ID)
        emscEqList: {}, // Object (キー: ID)
        cwaEqList: [], // Array
        cwaEqList_tiny: [], // Array
        usgsData: [], // Array
        bmkgData: [], // Array
        bmkg_M5Data: [], // Array
        saData: [], // Array
        // ICL, CEA, FJ などのWebSocketデータもここに追加可能
        // 例: iclData: null, ceaData: null
      },
      // 統合されたリスト表示用データ配列 (allData)
      allData: [],
      // 津波関連データ
      latestTsunamiInfo: null,
      tsunamiAreaGeoJson: null, // 津波区域GeoJSON生データ
      tsunamiAreaGeoJsonData: null, // 処理された津波区域データ (用途不明確なため暫定)
      tsunamiLayer: null, // Leafletレイヤーオブジェクト (状態としては微妙だが...)

      // --- 接続状態関連 ---
      connections: {
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
        sa: false, // ShakeAlert
        // 必要に応じて追加
      },

      // --- 最終更新時刻関連 ---
      lastUpdateTimes: {
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
        // 必要に応じて追加
      },

      // --- 設定関連 ---
      settings: {
        // 通知設定
        enableNotification: true,
        soundNotification: true,
        magThreshold: 1.0,
        // 地図マーカー設定 (mapMarkerSettings)
        mapMarkers: {
          cwaEqList_tiny: true,
          cwaEqList: true,
          usgsData: true,
          bmkgData: true,
          bmkg_M5Data: true,
          jmaEqList: false, // 例: JMA データ (デフォルト非表示)
          cencEqList: false, // 例: CENC データ (デフォルト非表示)
          emscEqList: false, // 例: EMSC データ (デフォルト非表示)
          // 必要に応じて他のデータソースも追加
        },
        // その他の設定...
        // autoRefresh: true, // 例
        // theme: 'light', // 例
      },

      // --- 通知関連 (状態として保持) ---
      lastNotificationId: null, // 通知重複防止用
      processedIds: new Set(), // 通知済みID記録用 (SetはJSON化できないので注意)
    };

    // --- 2. イベントリスナー管理 ---
    this.listeners = {};
  }

  /**
   * 現在の状態全体を取得
   * @returns {Object} 状態オブジェクト
   */
  getState() {
    return this.state;
  }

  /**
   * 状態の特定の部分を取得
   * @param {string} path - ドット区切りのパス (例: 'combinedData.usgsData')
   * @returns {*} 状態の値
   */
  getStateAtPath(path) {
    return path.split(".").reduce((obj, key) => obj?.[key], this.state);
  }

  // --- 3. 状態更新メソッド ---

  /**
   * combinedData の特定ソースを更新
   * @param {string} source - データソース名 (例: 'usgsData', 'jmaEqList')
   * @param {*} newData - 新しいデータ
   */
  updateCombinedData(source, newData) {
    if (this.state.combinedData.hasOwnProperty(source)) {
      this.state.combinedData[source] = newData;
      this.notify("combinedDataUpdated", { source, newData });
    } else {
      console.warn(`StateManager: Unknown combinedData source '${source}'`);
    }
  }

  /**
   * allData (統合リスト表示用配列) を更新
   * @param {Array} newData - 新しい統合データ配列
   */
  updateAllData(newData) {
    if (Array.isArray(newData)) {
      this.state.allData = newData;
      this.notify("allDataUpdated", { newData });
    } else {
      console.error("StateManager: updateAllData requires an array.");
    }
  }

  /**
   * 津波関連データを更新
   * @param {string} tsunamiDataType - データタイプ ('latestTsunamiInfo', 'tsunamiAreaGeoJson', 'tsunamiAreaGeoJsonData')
   * @param {*} newData - 新しいデータ
   */
  updateTsunamiData(tsunamiDataType, newData) {
    if (this.state.hasOwnProperty(tsunamiDataType)) {
      this.state[tsunamiDataType] = newData;
      this.notify("tsunamiDataUpdated", { type: tsunamiDataType, newData });
    } else {
      console.warn(
        `StateManager: Unknown tsunami data type '${tsunamiDataType}'`
      );
    }
  }

  /**
   * WebSocketなどの接続状態を更新
   * @param {string} source - 接続ソース名 (例: 'jmaEew', 'scEew')
   * @param {boolean} isConnected - 接続状態
   */
  setConnectionStatus(source, isConnected) {
    if (this.state.connections.hasOwnProperty(source)) {
      const previousStatus = this.state.connections[source];
      this.state.connections[source] = isConnected;
      // 状態が変化した場合のみ通知
      if (previousStatus !== isConnected) {
        this.notify("connectionStatusChanged", { source, isConnected });
      }
    } else {
      console.warn(`StateManager: Unknown connection source '${source}'`);
    }
  }

  /**
   * データソースの最終更新時刻を更新
   * @param {string} source - データソース名 (例: 'jmaEew', 'jmaXml')
   * @param {Date|string|null} updateTime - 更新時刻
   */
  setLastUpdateTime(source, updateTime) {
    if (this.state.lastUpdateTimes.hasOwnProperty(source)) {
      this.state.lastUpdateTimes[source] = updateTime;
      this.notify("lastUpdateTimeChanged", { source, updateTime });
    } else {
      console.warn(`StateManager: Unknown last update time source '${source}'`);
    }
  }

  /**
   * 設定値を更新
   * @param {string} key - 設定キー (例: 'enableNotification', 'magThreshold')
   * @param {*} value - 新しい値
   */
  updateSetting(key, value) {
    // settings オブジェクト内か、ルートレベルかを判断
    if (this.state.settings.hasOwnProperty(key)) {
      const previousValue = this.state.settings[key];
      this.state.settings[key] = value;
      if (previousValue !== value) {
        this.notify("settingChanged", { key, value, category: "settings" });
      }
    } else if (this.state.hasOwnProperty(key)) {
      // ルートレベルの設定 (例: lastNotificationId)
      const previousValue = this.state[key];
      this.state[key] = value;
      if (previousValue !== value) {
        this.notify("settingChanged", { key, value, category: "root" });
      }
    } else {
      console.warn(`StateManager: Unknown setting key '${key}'`);
    }
  }

  /**
   * mapMarkers 設定を一括または個別に更新
   * @param {string|Object} keyOrObject - 設定キー文字列 または {key: value, ...} のオブジェクト
   * @param {*} [value] - `keyOrObject` が文字列の場合の新しい値
   */
  updateMapMarkerSetting(keyOrObject, value) {
    if (typeof keyOrObject === "string") {
      const key = keyOrObject;
      if (this.state.settings.mapMarkers.hasOwnProperty(key)) {
        const previousValue = this.state.settings.mapMarkers[key];
        this.state.settings.mapMarkers[key] = value;
        if (previousValue !== value) {
          this.notify("mapMarkerSettingChanged", { key, value });
        }
      } else {
        console.warn(`StateManager: Unknown map marker setting key '${key}'`);
      }
    } else if (typeof keyOrObject === "object" && keyOrObject !== null) {
      const updates = keyOrObject;
      let hasChanged = false;
      const changedKeys = [];
      for (const [key, newValue] of Object.entries(updates)) {
        if (this.state.settings.mapMarkers.hasOwnProperty(key)) {
          const previousValue = this.state.settings.mapMarkers[key];
          if (previousValue !== newValue) {
            this.state.settings.mapMarkers[key] = newValue;
            hasChanged = true;
            changedKeys.push({ key, newValue });
          }
        } else {
          console.warn(
            `StateManager: Unknown map marker setting key '${key}' in batch update`
          );
        }
      }
      if (hasChanged) {
        this.notify("mapMarkerSettingsBatchChanged", { changes: changedKeys });
      }
    } else {
      console.error(
        "StateManager: updateMapMarkerSetting requires a string key or an object."
      );
    }
  }

  /**
   * 通知済みIDを記録 (processedIds の更新)
   * @param {string} id - 通知済みのアイテムID
   */
  addProcessedId(id) {
    // Set は直接変更されるため、notify 呼び出し後に変更が反映される
    const wasAdded = !this.state.processedIds.has(id); // 変更前チェック
    this.state.processedIds.add(id);
    if (wasAdded) {
      this.notify("processedIdAdded", { id });
    }
  }

  /**
   * 最後に通知したIDを更新
   * @param {string} id - 通知ID
   */
  setLastNotificationId(id) {
    const previousId = this.state.lastNotificationId;
    this.state.lastNotificationId = id;
    if (previousId !== id) {
      this.notify("lastNotificationIdChanged", { id });
    }
  }

  // --- 4. イベントシステム ---

  /**
   * イベントリスナーを登録
   * @param {string} event - イベント名
   * @param {Function} callback - コールバック関数
   */
  subscribe(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }

  /**
   * イベントリスナーを解除
   * @param {string} event - イベント名
   * @param {Function} callback - 解除するコールバック関数
   */
  unsubscribe(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(
        (listener) => listener !== callback
      );
    }
  }

  /**
   * イベントを通知
   * @param {string} event - イベント名
   * @param {*} data - 通知するデータ
   */
  notify(event, data) {
    console.log(`StateManager: Notifying '${event}' with data:`, data); // デバッグ用
    if (this.listeners[event]) {
      this.listeners[event].forEach((callback) => {
        try {
          callback(data);
        } catch (error) {
          console.error(
            `StateManager: Error in listener for '${event}':`,
            error
          );
        }
      });
    }
  }

  // --- 5. ユーティリティ ---

  /**
   * 状態をコンソールにログ出力 (デバッグ用)
   */
  logState() {
    console.log(
      "Current State:",
      JSON.parse(
        JSON.stringify(this.state, (key, value) =>
          // Set や Function などのシリアライズ不可オブジェクトの処理
          value instanceof Set
            ? [...value]
            : typeof value === "function"
            ? "[Function]"
            : value
        )
      )
    );
  }

  /**
   * 状態をローカルストレージに保存 (一部の設定のみ)
   * processedIds (Set) などは保存できないので注意
   */
  saveToLocalStorage() {
    try {
      const stateToSave = {
        settings: this.state.settings,
        lastNotificationId: this.state.lastNotificationId,
        // processedIds は Set なので保存できない。必要なら配列に変換。
        // lastUpdateTimes は Date オブジェクトを含む可能性があるので注意。
        // connections は実行時状態なので通常保存しない。
        // combinedData, allData は通常巨大なので保存しない。
      };
      localStorage.setItem("appState", JSON.stringify(stateToSave));
      console.log("StateManager: State saved to localStorage.");
    } catch (error) {
      console.error(
        "StateManager: Failed to save state to localStorage.",
        error
      );
    }
  }

  /**
   * ローカルストレージから状態を読み込み
   */
  loadFromLocalStorage() {
    try {
      const savedStateJson = localStorage.getItem("appState");
      if (savedStateJson) {
        const savedState = JSON.parse(savedStateJson);
        // 設定のマージ (深いマージは別途ライブラリが必要)
        if (savedState.settings) {
          Object.assign(this.state.settings, savedState.settings);
          // mapMarkers のようなネストされたオブジェクトもマージしたい場合は注意
          if (savedState.settings.mapMarkers) {
            Object.assign(
              this.state.settings.mapMarkers,
              savedState.settings.mapMarkers
            );
          }
        }
        if (savedState.lastNotificationId !== undefined) {
          this.state.lastNotificationId = savedState.lastNotificationId;
        }
        // processedIds は localStorage に保存されていない想定
        this.notify("stateLoadedFromStorage", { loadedState: savedState });
        console.log("StateManager: State loaded from localStorage.");
      }
    } catch (error) {
      console.error(
        "StateManager: Failed to load state from localStorage.",
        error
      );
    }
  }
}

// --- 6. グローバルインスタンスの作成 ---
// アプリケーション全体で使用するための単一の StateManager インスタンス
const stateManager = new StateManager();

// 他のスクリプトから参照できるようにする
// (モジュールシステムを使っている場合は export default stateManager;)
window.stateManager = stateManager;

console.log("StateManager initialized.");
