// eventHandlers.js

/**
 * イベントハンドラーを管理・初期化するモジュール
 * StateManager, DataProcessor, UIRenderer と連携
 */

// --- 内部変数 ---
let autoFetchIntervalId = null; // 自動取得用タイマーID
let autoRefreshTsunamiIntervalId = null; // 津波自動更新用タイマーID
let preactiveTab = null; // 前回アクティブだったタブID (グラフ更新用)
let mapInitialized = false; // 地図が初期化されたかのフラグ

// --- イベントハンドラー関数群 ---

/**
 * タブ変更イベントハンドラー
 * @param {string} tabId - 選択されたタブのID
 */
function handleTabChange(tabId) {
    console.log(`イベントハンドラー: タブ変更 - ${tabId}`);
    const tabContents = document.querySelectorAll(".tab-content");
    const tabButtons = document.querySelectorAll(".tab-btn");

    // 1. タブのUI状態を更新
    tabButtons.forEach(btn => btn.classList.remove("active"));
    tabContents.forEach(content => content.classList.remove("active"));

    const activeButton = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
    const activeContent = document.getElementById(tabId);

    if (activeButton && activeContent) {
        activeButton.classList.add("active");
        activeContent.classList.add("active");
        // タブインジケーターの位置更新 (提供されたコードから流用)
        const tabIndicator = document.querySelector(".tab-indicator");
        if (tabIndicator) {
            const activeButtonRect = activeButton.getBoundingClientRect();
            const containerRect = activeButton.parentElement.getBoundingClientRect();
            tabIndicator.style.width = `${activeButtonRect.width}px`;
            tabIndicator.style.left = `${activeButtonRect.left - containerRect.left}px`;
        }
    }

    // 2. タブ変更に応じた処理
    if (tabId === "tab1_1") {
        // 津波情報タブ: データ取得
        eventHandlers.fetchTsunamiData();
    } else if (tabId === "tab2") {
        // 地図タブ: 地図初期化・マーカー更新
        if (!mapInitialized) {
            window.map = eventHandlers.initMap(); // 地図初期化関数をエクスポートしている前提
            mapInitialized = true;
        }
        if (window.map) {
            // 地図サイズ更新
            setTimeout(() => window.map.invalidateSize(), 100);
            // マーカー更新 (状態マネージャーから最新データを取得して描画)
            const state = window.stateManager.getState();
            window.uiRenderer.renderMapMarkers(window.map, state.combinedData, state.settings.mapMarkers);
            // 津波レイヤーも更新
            window.uiRenderer.renderTsunamiLayer(window.map, state.tsunamiAreaGeoJsonData, state.latestTsunamiInfo);
        } else {
            console.warn("イベントハンドラー: タブ変更 - 地図が初期化されていません。");
        }
    } else if (tabId === "tab2.1") {
        // 3D散布図タブ: グラフ描画
        if (preactiveTab !== "tab2_1") {
            preactiveTab = "tab2_1";
            const state = window.stateManager.getState();
            window.uiRenderer.renderLineGraph(state.allData, "plotly-graph-2-1");
        }
    } else if (tabId === "tab2.2") {
        // 球面3D散布図タブ: グラフ描画
        if (preactiveTab !== "tab2_2") {
            preactiveTab = "tab2_2";
            const state = window.stateManager.getState();
            window.uiRenderer.renderSphereGraph(state.allData, "plotly-graph-2-2", state.tsunamiAreaGeoJsonData, state.latestTsunamiInfo);
        }
    } else if (tabId === "tab3") {
        // 設定タブ: 特に追加の処理は不要 (UI表示のみ)
    }
    // 他のタブも必要に応じて追加
}

/**
 * 通知設定変更イベントハンドラー (通知有効/無効)
 * @param {Event} event - チェックボックス変更イベント
 */
function handleEnableNotificationChange(event) {
    const isChecked = event.target.checked;
    console.log(`イベントハンドラー: 通知設定変更 - 有効: ${isChecked}`);
    window.stateManager.updateSetting('enableNotification', isChecked);

    if (isChecked && Notification.permission !== "granted") {
        Notification.requestPermission().then((permission) => {
            if (permission === "granted") {
                console.log("イベントハンドラー: 通知の許可が得られました。");
            } else {
                console.warn("イベントハンドラー: 通知の許可がありません。設定を無効に戻します。");
                window.stateManager.updateSetting('enableNotification', false);
                event.target.checked = false; // UIも同期
            }
        }).catch((error) => {
            console.error("イベントハンドラー: 通知許可リクエスト中にエラー:", error);
            window.stateManager.updateSetting('enableNotification', false);
            event.target.checked = false; // UIも同期
        });
    }
}

/**
 * 音声通知設定変更イベントハンドラー
 * @param {Event} event - チェックボックス変更イベント
 */
function handleSoundNotificationChange(event) {
    const isChecked = event.target.checked;
    console.log(`イベントハンドラー: 音声通知設定変更 - 有効: ${isChecked}`);
    window.stateManager.updateSetting('soundNotification', isChecked);
    // 音声通知のロジックは、通知送信時に stateManager から設定を取得して判定する
}

/**
 * マグニチュード閾値設定変更イベントハンドラー
 * @param {Event} event - 入力フィールド変更イベント
 */
function handleMagThresholdChange(event) {
    const newThreshold = parseFloat(event.target.value);
    if (!isNaN(newThreshold) && newThreshold >= 0) {
        console.log(`イベントハンドラー: マグニチュード閾値変更 - ${newThreshold}`);
        window.stateManager.updateSetting('magThreshold', newThreshold);
        // 閾値変更に応じたUI更新は、状態変更イベントリスナーで行う
    } else {
        console.warn("イベントハンドラー: マグニチュード閾値が無効です。", newThreshold);
        // UIを前回の有効な値に戻すなどの処理も可能
    }
}

/**
 * 地図マーカー表示設定変更イベントハンドラー (個別チェックボックス)
 * @param {string} sourceKey - 設定キー (例: 'cwaEqList_tiny')
 * @param {boolean} isChecked - チェック状態
 */
function handleMapMarkerSettingChange(sourceKey, isChecked) {
    console.log(`イベントハンドラー: 地図マーカー設定変更 - ${sourceKey}: ${isChecked}`);
    window.stateManager.updateMapMarkerSetting(sourceKey, isChecked);
    // マーカー設定変更に応じた地図更新は、状態変更イベントリスナーで行う
}

/**
 * 地図マーカー設定適用ボタンクリックイベントハンドラー
 * (複数のチェックボックスを一度に処理する場合)
 */
function handleApplyMapSettingsClick() {
    console.log("イベントハンドラー: 地図設定適用ボタンクリック");
    // 現在のUI状態から設定を収集し、一括更新
    const newSettings = {};
    const checkboxes = document.querySelectorAll("#tab3 input[type='checkbox'][id^='show']"); // IDがshowで始まるチェックボックスを想定
    checkboxes.forEach(checkbox => {
        // IDから設定キーを抽出 (例: 'showCwaTinyMarkers' -> 'cwaEqList_tiny')
        // このマッピングはHTMLと一致させる必要がある
        const mapping = {
            'showCwaTinyMarkers': 'cwaEqList_tiny',
            'showCwaMarkers': 'cwaEqList',
            'showUsgsMarkers': 'usgsData',
            'showBmkgMarkers': 'bmkgData',
            'showBmkgM5Markers': 'bmkg_M5Data',
            'showJmaMarkers': 'jmaEqList', // 例
            'showCencMarkers': 'cencEqList', // 例
            'showEmscMarkers': 'emscEqList', // 例
            // 必要に応じて他のマッピングを追加
        };
        const key = mapping[checkbox.id];
        if (key) {
            newSettings[key] = checkbox.checked;
        }
    });
    window.stateManager.updateMapMarkerSetting(newSettings);
}

/**
 * WebSocket接続/切断トグルイベントハンドラー (例: JMA EEW)
 * @param {string} source - データソース名 (例: 'jmaEew')
 * @param {boolean} connect - 接続するか切断するか
 */
function handleWebSocketToggle(source, connect) {
    console.log(`イベントハンドラー: WebSocket トグル - ${source}, 接続: ${connect}`);
    // 実際の接続/切断ロジックは、グローバル関数 (例: connectJmaEew, disconnectJmaEew) を呼び出す
    // または、WebSocketインスタンスを管理するオブジェクトのメソッドを呼び出す
    // ここでは、グローバル関数が存在すると仮定して呼び出し
    if (connect) {
        if (typeof window[`connect${source.charAt(0).toUpperCase() + source.slice(1)}`] === 'function') {
             window[`connect${source.charAt(0).toUpperCase() + source.slice(1)}`]();
        } else {
            console.warn(`イベントハンドラー: 接続関数 connect${source.charAt(0).toUpperCase() + source.slice(1)} が見つかりません。`);
        }
    } else {
        if (typeof window[`disconnect${source.charAt(0).toUpperCase() + source.slice(1)}`] === 'function') {
             window[`disconnect${source.charAt(0).toUpperCase() + source.slice(1)}`]();
        } else {
            console.warn(`イベントハンドラー: 切断関数 disconnect${source.charAt(0).toUpperCase() + source.slice(1)} が見つかりません。`);
        }
    }
    // 接続状態のUI更新は、WebSocketの onopen/onclose コールバックで stateManager を通じて行う
}

/**
 * APIデータ取得イベントハンドラー (例: USGS, BMKG)
 * @param {string} source - データソース名 (例: 'usgs', 'bmkg_M5')
 */
function handleFetchData(source) {
    console.log(`イベントハンドラー: データ取得 - ${source}`);
    // 実際のデータ取得ロジックは、グローバル関数 (例: fetchUsgsData) を呼び出す
    // または、データ取得モジュールの関数を呼び出す
    if (typeof window[`fetch${source.charAt(0).toUpperCase() + source.slice(1)}Data`] === 'function') {
         window[`fetch${source.charAt(0).toUpperCase() + source.slice(1)}Data`]();
    } else {
        console.warn(`イベントハンドラー: データ取得関数 fetch${source.charAt(0).toUpperCase() + source.slice(1)}Data が見つかりません。`);
    }
    // データ取得後の処理とUI更新は、fetch関数内で stateManager を通じて行われる
}

/**
 * 自動更新開始イベントハンドラー
 */
function handleStartAutoRefresh() {
    console.log("イベントハンドラー: 自動更新開始");
    stopAutoRefresh(); // 既に動いていれば停止
    const intervalInput = document.getElementById("intervalInput");
    let intervalSeconds = 300; // デフォルト5分
    if (intervalInput) {
        intervalSeconds = parseInt(intervalInput.value, 10) || intervalSeconds;
    }
    autoFetchIntervalId = setInterval(() => {
        console.log("イベントハンドラー: 自動更新タイマー発火");
        // 定期的に取得するデータソースを指定
        // handleFetchData('usgs'); // 例: USGSは設定変更時にも取得するのでここでは省略
        handleFetchData('bmkg');
        handleFetchData('bmkg_M5');
        // JMA XMLは別途タイマーがあるのでここでは省略
        // WebSocketは常時接続なのでここでは省略
    }, intervalSeconds * 1000);
    console.log(`イベントハンドラー: 自動更新タイマーを ${intervalSeconds} 秒間隔で開始しました。`);
}

/**
 * 自動更新停止イベントハンドラー
 */
function handleStopAutoRefresh() {
    console.log("イベントハンドラー: 自動更新停止");
    if (autoFetchIntervalId) {
        clearInterval(autoFetchIntervalId);
        autoFetchIntervalId = null;
        console.log("イベントハンドラー: 自動更新タイマーを停止しました。");
    }
}

/**
 * 津波情報自動更新チェックボックス変更イベントハンドラー
 * @param {Event} event - チェックボックス変更イベント
 */
function handleTsunamiAutoRefreshChange(event) {
    const isChecked = event.target.checked;
    console.log(`イベントハンドラー: 津波自動更新設定変更 - 有効: ${isChecked}`);
    if (isChecked) {
        // 一定間隔で津波情報を再取得 (例: 5分)
        autoRefreshTsunamiIntervalId = setInterval(() => {
            eventHandlers.fetchTsunamiData(); // 自身を呼び出す
        }, 5 * 60 * 1000);
    } else {
        if (autoRefreshTsunamiIntervalId) {
            clearInterval(autoRefreshTsunamiIntervalId);
            autoRefreshTsunamiIntervalId = null;
        }
    }
}

/**
 * 津波情報手動更新ボタンクリックイベントハンドラー
 */
function handleRefreshTsunamiClick() {
    console.log("イベントハンドラー: 津波情報手動更新");
    eventHandlers.fetchTsunamiData(); // 自身の関数を呼び出す
}

/**
 * テーマ切替ボタンクリックイベントハンドラー
 */
function handleThemeToggleClick() {
    console.log("イベントハンドラー: テーマ切替");
    document.body.classList.toggle("dark-mode");
    const isDarkMode = document.body.classList.contains("dark-mode");
    localStorage.setItem("theme", isDarkMode ? "dark" : "light");
    const themeToggleBtn = document.getElementById("themeToggle");
    if (themeToggleBtn) {
        themeToggleBtn.textContent = isDarkMode ? "ライトモード" : "ダークモード";
    }
}

/**
 * JMA XML 詳細情報プルダウン変更イベントハンドラー
 * @param {Event} event - セレクト変更イベント
 */
function handleJmaXmlDropdownChange(event) {
    const selectedLink = event.target.value;
    console.log(`イベントハンドラー: JMA XML プルダウン変更 - ${selectedLink}`);
    const jmaXmlDetailElement = document.getElementById("jmaXmlDetail");
    if (jmaXmlDetailElement) {
        if (selectedLink) {
            // 選択されたリンクからXMLを取得し、UIレンダラーで描画
            fetch(selectedLink)
                .then(response => {
                    if (!response.ok) { throw new Error(`HTTP error! status: ${response.status}`); }
                    return response.text();
                })
                .then(xmlText => {
                    window.uiRenderer.renderJmaXmlDetail(xmlText, jmaXmlDetailElement);
                })
                .catch(error => {
                    console.error('イベントハンドラー: XML詳細取得エラー:', error);
                    jmaXmlDetailElement.innerHTML = `<p class="no-data">詳細情報の取得に失敗しました</p><p>エラー: ${error.message}</p>`;
                });
        } else {
            jmaXmlDetailElement.innerHTML = `<p class="no-data">表示する詳細情報がありません</p>`;
        }
    }
}

/**
 * 「すべて選択」/「すべて解除」ボタンクリックイベントハンドラー (設定タブ用)
 * @param {string} action - 'select' または 'deselect'
 */
function handleSelectAllToggles(action) {
    console.log(`イベントハンドラー: すべて${action === 'select' ? '選択' : '解除'}`);
    // 設定タブ内のすべてのトグルIDを定義 (提供されたコードから一部流用)
    const allToggleIdsInTab3 = [
        'showCwaTinyMarkers', 'showCwaMarkers', 'showUsgsMarkers',
        'showBmkgMarkers', 'showBmkgM5Markers',
        'showJmaMarkers', 'showCencMarkers', 'showEmscMarkers', // 例
        'sourceJMA', 'sourceSC', 'sourceFJ', 'sourceCENC', 'sourceEMSC',
        'sourceCWA', 'sourceCWA_tiny', 'sourceUSGS', 'sourceBMKG', 'sourceBMKG_M5',
        'sourceJmaEqList', 'sourceJmaHypo', 'sourceJmaXml', 'sourceSA',
        'sourceCea', 'sourceIcl' // 例
        // 必要に応じて追加
    ];

    allToggleIdsInTab3.forEach(id => {
        const checkbox = document.getElementById(id);
        if (checkbox) {
            if (action === 'select' && !checkbox.checked) {
                checkbox.checked = true;
                // changeイベントを発火させて、関連するロジックをトリガー
                checkbox.dispatchEvent(new Event('change'));
            } else if (action === 'deselect' && checkbox.checked) {
                checkbox.checked = false;
                checkbox.dispatchEvent(new Event('change'));
            }
        }
    });
}


// --- グローバルに公開する必要がある関数 (既存ロジックとの連携用) ---

/**
 * 津波情報と区域GeoJSONを取得する関数 (既存ロジックの再実装例)
 */
async function fetchTsunamiData() {
    try {
        // 1. 津波警報情報を取得
        const infoResponse = await fetch('https://www.jma.go.jp/bosai/tsunami/data/list.json');
        if (!infoResponse.ok) throw new Error(`津波情報取得エラー: ${infoResponse.status}`);
        const infoList = await infoResponse.json();
        if (infoList.length === 0) {
             window.stateManager.updateTsunamiData('latestTsunamiInfo', { cancelled: true });
             return;
        }
        const latestInfoUrl = `https://www.jma.go.jp/bosai/tsunami/data/${infoList[0].file}`;
        const dataResponse = await fetch(latestInfoUrl);
        if (!dataResponse.ok) throw new Error(`津波詳細情報取得エラー: ${dataResponse.status}`);
        const latestTsunamiInfo = await dataResponse.json();

        // 2. 津波区域GeoJSONを取得 (初回のみ)
        if (!window.stateManager.getState().tsunamiAreaGeoJson) {
             const geoResponse = await fetch('https://www.jma.go.jp/bosai/common/map/bosai/tsunami_area.geojson');
             if (!geoResponse.ok) throw new Error(`津波区域GeoJSON取得エラー: ${geoResponse.status}`);
             const tsunamiAreaGeoJson = await geoResponse.json();
             window.stateManager.updateTsunamiData('tsunamiAreaGeoJson', tsunamiAreaGeoJson);
             // 処理済みGeoJSONデータも作成・保存 (例: uiRenderer 内のロジックをここに移動しても良い)
             // ここでは簡略化のため、生データのみ更新
        }

        // 3. StateManagerを更新
        window.stateManager.updateTsunamiData('latestTsunamiInfo', latestTsunamiInfo);

        console.log("イベントハンドラー: 津波情報取得完了");
    } catch (error) {
        console.error("イベントハンドラー: 津波情報取得中にエラー:", error);
        // エラー状態も更新可能
        // window.stateManager.updateTsunamiData('latestTsunamiInfo', null);
    }
}

/**
 * 地図を初期化する関数 (既存ロジックの再実装例)
 */
function initMap() {
    if (window.map) {
        window.map.remove();
        console.log("イベントハンドラー: 既存の地図を削除しました");
    }
    console.log("イベントハンドラー: 地図を初期化中...");
    const newMap = L.map("map").setView([35.6895, 135], 5);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
    }).addTo(newMap);
    console.log("イベントハンドラー: 地図初期化完了");
    return newMap;
}


// --- 初期化関数 ---

/**
 * イベントリスナーを設定する初期化関数
 */
function initEventHandlers() {
    console.log("EventHandlers: 初期化開始");

    // --- DOMContentLoaded後のイベントリスナー設定 ---
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupEventListeners);
    } else {
        // DOMが既に読み込まれている場合
        setupEventListeners();
    }

    // --- StateManagerイベントリスナー設定 ---
    setupStateManagerListeners();

    console.log("EventHandlers: 初期化完了");
}

/**
 * DOM要素へのイベントリスナーを設定
 */
function setupEventListeners() {
    // タブボタン
    document.querySelectorAll(".tab-btn").forEach(button => {
        button.addEventListener("click", () => handleTabChange(button.dataset.tab));
    });

    // 通知設定チェックボックス
    const enableNotificationCheckbox = document.getElementById("enableNotification");
    if (enableNotificationCheckbox) {
        enableNotificationCheckbox.addEventListener("change", handleEnableNotificationChange);
    }

    // 音声通知チェックボックス
    const soundNotificationCheckbox = document.getElementById("soundNotification");
    if (soundNotificationCheckbox) {
        soundNotificationCheckbox.addEventListener("change", handleSoundNotificationChange);
    }

    // マグニチュード閾値入力
    const magThresholdInput = document.getElementById("magThreshold");
    if (magThresholdInput) {
        magThresholdInput.addEventListener("change", handleMagThresholdChange);
    }

    // 地図マーカー設定チェックボックス (個別)
    // IDが特定のパターンを持つチェックボックスにイベントリスナーを設定
    const markerCheckboxes = document.querySelectorAll("#tab3 input[type='checkbox'][id^='show']");
    markerCheckboxes.forEach(checkbox => {
        checkbox.addEventListener("change", (e) => {
            // IDから設定キーを逆引き (handleApplyMapSettingsClick と同様のロジック)
            const mapping = {
                'showCwaTinyMarkers': 'cwaEqList_tiny',
                'showCwaMarkers': 'cwaEqList',
                'showUsgsMarkers': 'usgsData',
                'showBmkgMarkers': 'bmkgData',
                'showBmkgM5Markers': 'bmkg_M5Data',
                'showJmaMarkers': 'jmaEqList',
                'showCencMarkers': 'cencEqList',
                'showEmscMarkers': 'emscEqList',
                 // 必要に応じて追加
            };
            const key = mapping[e.target.id];
            if (key !== undefined) {
                handleMapMarkerSettingChange(key, e.target.checked);
            }
        });
    });

    // 地図設定適用ボタン
    const applyMapSettingsButton = document.getElementById("applyMapSettings");
    if (applyMapSettingsButton) {
        applyMapSettingsButton.addEventListener("click", handleApplyMapSettingsClick);
    }

    // WebSocket/API トグルスイッチ (例: JMA EEW)
    const sourceJMA = document.getElementById("sourceJMA");
    if (sourceJMA) {
        sourceJMA.addEventListener("change", (e) => {
            handleWebSocketToggle('jmaEew', e.target.checked);
        });
    }
    // 他のWebSocket/APIトグルも同様に設定
    const sourceUSGS = document.getElementById("sourceUSGS");
    if (sourceUSGS) {
        sourceUSGS.addEventListener("change", (e) => {
            if (e.target.checked) handleFetchData('usgs');
        });
    }
    const sourceBMKG = document.getElementById("sourceBMKG");
    if (sourceBMKG) {
        sourceBMKG.addEventListener("change", (e) => {
            if (e.target.checked) handleFetchData('bmkg');
        });
    }
    const sourceBMKG_M5 = document.getElementById("sourceBMKG_M5");
    if (sourceBMKG_M5) {
        sourceBMKG_M5.addEventListener("change", (e) => {
            if (e.target.checked) handleFetchData('bmkg_M5');
        });
    }
    // 必要に応じて他のソースも追加

    // 自動更新関連
    const startButton = document.getElementById("startButton");
    const stopButton = document.getElementById("stopButton");
    const intervalInput = document.getElementById("intervalInput");
    if (startButton) startButton.addEventListener("click", handleStartAutoRefresh);
    if (stopButton) stopButton.addEventListener("click", handleStopAutoRefresh);
    if (intervalInput) intervalInput.addEventListener("change", handleStartAutoRefresh); // 間隔変更時に再スタート

    // 津波情報更新関連
    const refreshBtn = document.getElementById("refreshTsunamiBtn");
    const autoRefreshCheckbox = document.getElementById("autoRefreshTsunami");
    if (refreshBtn) refreshBtn.addEventListener("click", handleRefreshTsunamiClick);
    if (autoRefreshCheckbox) autoRefreshCheckbox.addEventListener("change", handleTsunamiAutoRefreshChange);

    // テーマ切替ボタン
    const themeToggleBtn = document.getElementById("themeToggle");
    if (themeToggleBtn) themeToggleBtn.addEventListener("click", handleThemeToggleClick);

    // JMA XML プルダウン
    const jmaXmlDropdown = document.getElementById("jmaXmlDropdown");
    if (jmaXmlDropdown) jmaXmlDropdown.addEventListener("change", handleJmaXmlDropdownChange);

    // 「すべて選択」/「すべて解除」ボタン
    const selectAllButton = document.querySelector("#tab3 button.selectAll");
    const deselectAllButton = document.querySelector("#tab3 button.deselectAll");
    if (selectAllButton) selectAllButton.addEventListener("click", () => handleSelectAllToggles('select'));
    if (deselectAllButton) deselectAllButton.addEventListener("click", () => handleSelectAllToggles('deselect'));

    // ページ読み込み時のチェックボックス状態同期 (提供されたコードから流用)
    if (enableNotificationCheckbox) enableNotificationCheckbox.checked = window.stateManager.getState().settings.enableNotification;
    if (soundNotificationCheckbox) soundNotificationCheckbox.checked = window.stateManager.getState().settings.soundNotification;
    if (magThresholdInput) magThresholdInput.value = window.stateManager.getState().settings.magThreshold;
    // マーカー設定の同期は、UIRendererで行うか、別途関数を用意する

    console.log("EventHandlers: DOMイベントリスナー設定完了");
}

/**
 * StateManagerのイベントリスナーを設定
 */
function setupStateManagerListeners() {
    // combinedDataが更新されたとき -> 地図マーカー更新
    window.stateManager.subscribe('combinedDataUpdated', () => {
        console.log("EventHandlers: StateManagerイベント - combinedDataUpdated");
        if (window.map) {
            const state = window.stateManager.getState();
            window.uiRenderer.renderMapMarkers(window.map, state.combinedData, state.settings.mapMarkers);
        }
    });

    // allDataが更新されたとき -> リスト表示、グラフ更新
    window.stateManager.subscribe('allDataUpdated', (dataInfo) => {
        console.log("EventHandlers: StateManagerイベント - allDataUpdated");
        const listContainer = document.getElementById("combinedEqList");
        if (listContainer) {
            window.uiRenderer.renderEarthquakeList(dataInfo.newData, listContainer);
        }

        // アクティブなグラフタブに応じて更新
        const activeTabId = document.querySelector(".tab-content.active")?.id;
        if (activeTabId === "tab2.1") {
            window.uiRenderer.renderLineGraph(dataInfo.newData, "plotly-graph-2-1");
        } else if (activeTabId === "tab2.2") {
            const state = window.stateManager.getState();
            window.uiRenderer.renderSphereGraph(dataInfo.newData, "plotly-graph-2-2", state.tsunamiAreaGeoJsonData, state.latestTsunamiInfo);
        }
    });

    // 津波データが更新されたとき -> 津波レイヤー更新
    window.stateManager.subscribe('tsunamiDataUpdated', () => {
        console.log("EventHandlers: StateManagerイベント - tsunamiDataUpdated");
        if (window.map) {
            const state = window.stateManager.getState();
            window.uiRenderer.renderTsunamiLayer(window.map, state.tsunamiAreaGeoJsonData, state.latestTsunamiInfo);
        }
    });

    // 接続状態/最終更新時刻が変更されたとき -> ステータス表示更新
    window.stateManager.subscribe('connectionStatusChanged', () => {
        console.log("EventHandlers: StateManagerイベント - connectionStatusChanged");
        const state = window.stateManager.getState();
        // window.uiRenderer.renderStatusInfo(state.connections, state.lastUpdateTimes);
        // renderStatusInfo が uiRenderer にあるか確認し、呼び出す
        // または、このモジュール内で直接DOMを更新するロジックを書く
        updateStatusDisplay(state.connections, state.lastUpdateTimes);
    });
    window.stateManager.subscribe('lastUpdateTimeChanged', () => {
        console.log("EventHandlers: StateManagerイベント - lastUpdateTimeChanged");
        const state = window.stateManager.getState();
        // window.uiRenderer.renderStatusInfo(state.connections, state.lastUpdateTimes);
        updateStatusDisplay(state.connections, state.lastUpdateTimes);
    });

    // 設定が変更されたとき
    window.stateManager.subscribe('settingChanged', (settingInfo) => {
        console.log("EventHandlers: StateManagerイベント - settingChanged", settingInfo);
        // 通知設定変更などに応じた処理
        if (settingInfo.key === 'enableNotification' || settingInfo.key === 'magThreshold') {
            // 特に追加の処理は不要かもしれない。通知ロジック内でstateManagerから取得するので。
        }
        // マーカー設定変更 -> 地図更新
        if (settingInfo.key.startsWith('mapMarkers')) { // これは updateMapMarkerSetting が個別/一括で呼ばれるので注意
             // 個別のキー変更の場合、key は 'mapMarkers.***' のような形式かもしれない
             // 一括変更の場合、category が 'mapMarkerSettingsBatchChanged' になる
             if (window.map) {
                 const state = window.stateManager.getState();
                 window.uiRenderer.renderMapMarkers(window.map, state.combinedData, state.settings.mapMarkers);
             }
        }
    });
    window.stateManager.subscribe('mapMarkerSettingChanged', () => {
         console.log("EventHandlers: StateManagerイベント - mapMarkerSettingChanged");
         if (window.map) {
             const state = window.stateManager.getState();
             window.uiRenderer.renderMapMarkers(window.map, state.combinedData, state.settings.mapMarkers);
         }
    });
    window.stateManager.subscribe('mapMarkerSettingsBatchChanged', () => {
         console.log("EventHandlers: StateManagerイベント - mapMarkerSettingsBatchChanged");
         if (window.map) {
             const state = window.stateManager.getState();
             window.uiRenderer.renderMapMarkers(window.map, state.combinedData, state.settings.mapMarkers);
         }
    });

    console.log("EventHandlers: StateManagerイベントリスナー設定完了");
}

/**
 * ステータス表示を更新する内部関数 (uiRenderer.renderStatusInfo の代替または補完)
 * @param {Object} connections - 接続状態
 * @param {Object} lastUpdateTimes - 最終更新時刻
 */
function updateStatusDisplay(connections, lastUpdateTimes) {
     // uiRenderer.renderStatusInfo が存在すればそれを呼び出す
     // ここでは簡略化のため、直接DOMを操作する例を示す
     const connectionElements = {
        'jmaEew': document.getElementById('jmaEewStatus'),
        'jmaEq': document.getElementById('jmaEqStatus'),
        // ... 他の接続要素 ...
     };
     const updateTimeElements = {
        'jmaEew': document.getElementById('jmaEewLastUpdate'),
        // ... 他の更新時刻要素 ...
     };

     for (const [source, element] of Object.entries(connectionElements)) {
        if (element) {
            const isConnected = connections[source];
            element.textContent = isConnected ? '接続中' : '未接続';
            element.className = `status ${isConnected ? 'connected' : 'disconnected'}`;
        }
     }

     for (const [source, element] of Object.entries(updateTimeElements)) {
        if (element) {
            const updateTime = lastUpdateTimes[source];
            if (updateTime) {
                // formatTimeAgo が dataProcessor にあるか確認
                element.textContent = window.dataProcessor?.formatTimeAgo ?
                    window.dataProcessor.formatTimeAgo(updateTime) :
                    new Date(updateTime).toLocaleString();
            } else {
                element.textContent = '未更新';
            }
        }
     }
}


// --- モジュールエクスポート ---
// 他のスクリプトからこれらの関数を使用できるようにします。
// (モジュールシステムを使っている場合は export { ... };)
// または、グローバル変数として (現状のコード構造に合わせる場合)
window.eventHandlers = {
    // イベントハンドラー関数
    handleTabChange,
    handleEnableNotificationChange,
    handleSoundNotificationChange,
    handleMagThresholdChange,
    handleMapMarkerSettingChange,
    handleApplyMapSettingsClick,
    handleWebSocketToggle,
    handleFetchData,
    handleStartAutoRefresh,
    handleStopAutoRefresh,
    handleTsunamiAutoRefreshChange,
    handleRefreshTsunamiClick,
    handleThemeToggleClick,
    handleJmaXmlDropdownChange,
    handleSelectAllToggles,

    // グローバル公開関数 (既存ロジック連携用)
    fetchTsunamiData,
    initMap,

    // 初期化関数
    initEventHandlers,

    // 内部関数はエクスポートしない
};

// 初期化を実行
window.eventHandlers.initEventHandlers();

console.log("EventHandlers module initialized.");
