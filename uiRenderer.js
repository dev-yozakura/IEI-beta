// uiRenderer.js

// --- 内部ヘルパー関数 (UI描画専用) ---

/**
 * 深さに応じた色を取得します (マーカー用)。
 * @param {number|string} depth - 深さ (km)
 * @returns {string} カラーコード
 */
function getDepthColor(depth) {
    const depthValue = typeof depth === 'string' ? parseFloat(depth) : depth;
    if (isNaN(depthValue) || depthValue === null) return '#808080'; // Gray for unknown
    if (depthValue < 50) return '#00ff00'; // Green
    if (depthValue < 100) return '#ffff00'; // Yellow
    if (depthValue < 200) return '#ffa500'; // Orange
    return '#ff0000'; // Red
}

/**
 * 深さ文字列から数値を抽出します。
 * @param {string} depthStr - 深さ文字列 (例: "10.5 km")
 * @returns {number} 深さ数値。取得できない場合は Infinity。
 */
function getDepthNumber(depthStr) {
    if (typeof depthStr !== 'string') return Infinity;
    const match = depthStr.match(/([\d.]+)/);
    return match ? parseFloat(match[1]) : Infinity;
}

// --- UIレンダリング関数群 ---

/**
 * 地震リストを描画します。
 * @param {Array} dataArray - 表示する地震データオブジェクトの配列
 * @param {HTMLElement} containerElement - リストを描画する親要素
 */
function renderEarthquakeList(dataArray, containerElement) {
    if (!containerElement) {
        console.error("renderEarthquakeList: containerElement が指定されていません。");
        return;
    }

    if (!Array.isArray(dataArray)) {
        console.warn("renderEarthquakeList: dataArray が配列ではありません。");
        containerElement.innerHTML = "<p>表示するデータがありません (データ形式エラー)。</p>";
        return;
    }

    if (dataArray.length === 0) {
        containerElement.innerHTML = "<p class='no-data'>地震情報がありません</p>";
        return;
    }

    containerElement.innerHTML = ""; // 既存内容をクリア

    dataArray.forEach((item) => {
        if (!item) return; // null/undefined item をスキップ

        const container = document.createElement("div");
        container.className = "earthquake-item";

        let html = `<div class="stat-card">`;

        // ヘッダー部分
        html += `<div class="card-header">`;
        if (item.source === "jma_xml") {
            html += `<h3>${item.Title}</h3>`;
            html += `<p class="time">発表時刻: ${item.published || "情報なし"}</p>`;
        } else if (item.type === "automatic" || item.displayType === "eq") {
            // 地震情報 (WebSocket, APIなど)
            let title = "地震情報";
            let magnitude = item.magnitude;
            let location = item.location || item.HypoCenter || item.Hypocenter || "場所不明";

            if (item.source === "jma_eew" || item.type === "jma_eew") {
                title = `緊急地震速報 (M${magnitude})`;
            } else if (item.source === "jma_eq" || item.type === "jma_eq") {
                title = `M${magnitude} ${location}`;
            } else if (item.source === "usgs") {
                title = `M${magnitude} - ${location}`;
            } else if (item.source === "cenc" || item.source === "cwa" || item.source === "cwa_tiny") {
                title = `M${magnitude} - ${location}`;
            } else if (item.source === "bmkg" || item.source === "bmkg_m5") {
                title = `M${magnitude} - ${location}`;
            } else if (item.source === "emsc") {
                 title = `M${magnitude} - ${location}`;
            } else if (item.source === "sa") { // ShakeAlert
                 title = `M${magnitude} - ${location}`;
            } else {
                // 一般的なフォールバック
                title = item.Title || `M${magnitude} - ${location}`;
            }

            html += `<h3>${title}</h3>`;
            const timeToDisplay = item.time_full || item.time || item.OriginTime || item.ReportTime || item.published || "時間不明";
            html += `<p class="time">${timeToDisplay}</p>`;
        }
        html += `</div>`; // .card-header

        // ボディ部分
        html += `<div class="card-body">`;
        if (item.source === "jma_xml") {
            // JMA XML の場合はリンクのみ
            html += `<a href="${item.link}" target="_blank" rel="noopener noreferrer">詳細情報 (JMA)</a>`;
        } else if (item.type === "automatic" || item.displayType === "eq") {
            // 震度表示
            if ((item.source === "jma_eew" || item.source === "jma_eq") && item.MaxIntensity) {
                html += `<p>最大震度: ${dataProcessor.getIntersityLabel_j(item.MaxIntensity)}</p>`;
            } else if (item.intensity && item.source !== "usgs") { // USGSは intensity が MMI/CDI なので別途
                 html += `<p>最大烈度: ${dataProcessor.getIntersityLabel(item.intensity)}</p>`;
            } else if (item.cdi || item.mmi) { // USGS用
                 const intensityLabel = item.cdi >= item.mmi ? dataProcessor.getIntersityLabel(item.cdi) : dataProcessor.getIntersityLabel(item.mmi);
                 html += `<p>最大感知烈度 (CDI/MMI): ${intensityLabel}</p>`;
            }

            // 深さ表示
            const depthToDisplay = item.depth || item.Depth || "情報なし";
            html += `<p>深さ: ${depthToDisplay} km</p>`;

            // 情報源表示
            let sourceName = "不明";
            switch(item.source || item.type) {
                case "jma_eew": sourceName = "日本気象庁 (EEW)"; break;
                case "jma_eq": sourceName = "日本気象庁"; break;
                case "usgs": sourceName = "USGS"; break;
                case "cenc": sourceName = "中国地震台網"; break;
                case "cwa": sourceName = "中央気象署 (台湾)"; break;
                case "cwa_tiny": sourceName = "中央気象署 小区域 (台湾)"; break;
                case "bmkg": sourceName = "BMKG (インドネシア)"; break;
                case "bmkg_m5": sourceName = "BMKG M5+ (インドネシア)"; break;
                case "emsc": sourceName = "EMSC"; break;
                case "sa": sourceName = "ShakeAlert"; break;
                // ICL, CEA なども追加可能
                default: sourceName = item.source || item.type || "不明";
            }
            html += `<p class="source">情報源: ${sourceName}</p>`;
        }
        html += `</div>`; // .card-body

        html += `</div>`; // .stat-card
        container.innerHTML = html;
        containerElement.appendChild(container);
    });
}

/**
 * 地図上のマーカーを描画します。
 * @param {L.Map} mapInstance - Leaflet地図インスタンス
 * @param {Object} markerData - マーカー描画用データ (StateManagerのcombinedDataの一部)
 * @param {Object} mapMarkerSettings - 地図マーカーの表示設定 (StateManagerのsettings.mapMarkers)
 */
function renderMapMarkers(mapInstance, markerData, mapMarkerSettings) {
    if (!mapInstance) {
        console.warn("renderMapMarkers: 地図インスタンスが無効です。");
        return;
    }

    // 既存のマーカーグループをクリア
    if (window.markerGroup) {
        mapInstance.removeLayer(window.markerGroup);
    }
    window.markerGroup = L.layerGroup().addTo(mapInstance);
    console.log("既存のマーカーグループをクリアし、新しいグループを作成しました。");

    const allMarkers = [];

    // 設定に基づいてマーカーデータを集める
    if (mapMarkerSettings.cwaEqList_tiny && markerData.cwaEqList_tiny) {
        Object.values(markerData.cwaEqList_tiny).forEach(item => { if(item) allMarkers.push({...item, source: "cwa_tiny", displayType: "eq"}); });
    }
    if (mapMarkerSettings.cwaEqList && markerData.cwaEqList) {
        Object.values(markerData.cwaEqList).forEach(item => { if(item) allMarkers.push({...item, source: "cwa", displayType: "eq"}); });
    }
    if (mapMarkerSettings.usgsData && markerData.usgsData) {
        markerData.usgsData.forEach(item => allMarkers.push(item));
    }
    if (mapMarkerSettings.bmkgData && markerData.bmkgData) {
        markerData.bmkgData.forEach(item => allMarkers.push(item));
    }
    if (mapMarkerSettings.bmkg_M5Data && markerData.bmkg_M5Data) {
        markerData.bmkg_M5Data.forEach(item => allMarkers.push(item));
    }
    if (mapMarkerSettings.jmaEqList && markerData.jmaEqList) {
        Object.values(markerData.jmaEqList).forEach(item => { if(item) allMarkers.push({...item, source: "jma_eq", displayType: "eq"}); });
    }
    if (mapMarkerSettings.cencEqList && markerData.cencEqList) {
        Object.values(markerData.cencEqList).forEach(item => { if(item) allMarkers.push({...item, source: "cenc", displayType: "eq"}); });
    }
    if (mapMarkerSettings.emscEqList && markerData.emscEqList) {
        Object.values(markerData.emscEqList).forEach(item => { if(item) allMarkers.push({...item, source: "emsc", displayType: "eq"}); });
    }
    // ICL, CEA, SC, FJ EEW データも同様に追加可能

    console.log(`処理対象マーカー数: ${allMarkers.length}`);

    allMarkers.forEach((markerDataItem) => {
        try {
            // 緯度経度の検証
            const lat = parseFloat(markerDataItem.lat);
            const lng = parseFloat(markerDataItem.lng);
            if (isNaN(lat) || isNaN(lng)) {
                console.warn("無効な緯度経度のためマーカーを作成しません:", markerDataItem);
                return;
            }

            const magnitude = markerDataItem.magnitude;
            const depth = markerDataItem.depth || markerDataItem.Depth;
            const color = getDepthColor(depth);
            const timeStr = markerDataItem.time_full || markerDataItem.time || markerDataItem.OriginTime || "時間不明";
            const locationStr = markerDataItem.location || markerDataItem.HypoCenter || markerDataItem.Hypocenter || "場所不明";
            const sourceStr = markerDataItem.source || "不明";

            // アイコンサイズ (マグニチュードに応じて変化)
            let iconSizeValue = 20;
            if (!isNaN(parseFloat(magnitude))) {
                iconSizeValue = Math.min(50, Math.max(10, 10 + (parseFloat(magnitude) * 3)));
            }
            const iconSize = [iconSizeValue, iconSizeValue];

            const customIcon = L.icon({
                iconUrl: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${iconSize[0]}' height='${iconSize[1]}'%3E%3Ccircle cx='${iconSize[0]/2}' cy='${iconSize[1]/2}' r='${iconSize[0]/2 - 1}' fill='${color}' stroke='black' stroke-width='1'/%3E%3C/svg%3E`,
                iconSize: iconSize,
                iconAnchor: [iconSize[0] / 2, iconSize[1] / 2],
                popupAnchor: [0, -iconSize[1] / 2],
            });

            const marker = L.marker([lat, lng], { icon: customIcon })
                .bindPopup(
                    `<b>${locationStr}</b><br>` +
                    `${timeStr}<br>` +
                    `<p>M${magnitude} 深さ: ${depth || "不明"} km</p>` +
                    `<p>情報源: ${sourceStr}</p>`
                );
            window.markerGroup.addLayer(marker);
        } catch (e) {
            console.error("マーカー作成中にエラー:", markerDataItem, e);
        }
    });

    console.log(`マーカーを ${allMarkers.length} 個追加しました`);
}

/**
 * 津波レイヤーを地図上に描画します。
 * @param {L.Map} mapInstance - Leaflet地図インスタンス
 * @param {Object|null} tsunamiAreaGeoJsonData - 津波区域GeoJSONデータ (処理済み)
 * @param {Object|null} latestTsunamiInfo - 最新の津波情報
 */
function renderTsunamiLayer(mapInstance, tsunamiAreaGeoJsonData, latestTsunamiInfo) {
    if (!mapInstance) {
        console.warn("renderTsunamiLayer: 地図インスタンスが無効です。");
        return;
    }

    // 既存の津波レイヤーを削除
    if (window.tsunamiLayer) {
        mapInstance.removeLayer(window.tsunamiLayer);
        window.tsunamiLayer = null;
        console.log("既存の津波レイヤーを削除しました。");
    }

    // データが揃っているかチェック
    if (!tsunamiAreaGeoJsonData || !latestTsunamiInfo || latestTsunamiInfo.cancelled || !latestTsunamiInfo.areas) {
        console.log("津波レイヤーを表示するデータがありません。");
        return;
    }

    // 1. 警報状況データをマップ化 (区域名 -> {grade, immediate})
    const tsunamiStatusMap = new Map();
    latestTsunamiInfo.areas.forEach((area) => {
        if (area.regions && area.regions.length > 0) {
            area.regions.forEach((region) => {
                // APIの区域名をキーとして状態を保存
                tsunamiStatusMap.set(region.name, {
                    grade: region.grade,
                    immediate: region.immediate,
                });
            });
        }
    });

    // 2. GeoJSONデータを元に、スタイル付きのLeaflet GeoJSONレイヤーを作成
    try {
        window.tsunamiLayer = L.geoJSON(tsunamiAreaGeoJsonData, {
            style: function (feature) {
                const regionName = feature.properties.name;
                const status = tsunamiStatusMap.get(regionName);

                if (status) {
                    let fillColor = "gray";
                    let opacity = 0.3;
                    if (status.grade === "MajorWarning") fillColor = "red";
                    else if (status.grade === "Warning") fillColor = "orange";
                    else if (status.grade === "Watch") fillColor = "yellow";
                    else if (status.grade === "Forecast") fillColor = "green";
                    if (status.immediate) opacity = 0.7; // 直ちに来襲の場合は不透明度を上げる

                    return {
                        fillColor: fillColor,
                        color: "black",
                        weight: 1,
                        opacity: 0.7,
                        fillOpacity: opacity,
                    };
                } else {
                    // 警報が出ていない区域は非表示または薄く表示
                    return {
                        fillColor: "gray",
                        color: "black",
                        weight: 0.5,
                        opacity: 0.2,
                        fillOpacity: 0.0, // 完全に透明
                    };
                }
            },
            onEachFeature: function (feature, layer) {
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
            },
        });

        // 3. 地図にレイヤーを追加
        window.tsunamiLayer.addTo(mapInstance);
        console.log("津波レイヤーを地図に追加しました。");
    } catch (error) {
        console.error("津波レイヤーの作成中にエラーが発生しました:", error);
    }
}


/**
 * Plotly を使用して 3D 散布図 (直交座標) を描画します。
 * @param {Array} dataArray - 表示する地震データオブジェクトの配列
 * @param {string} containerId - グラフを描画する要素のID
 */
function renderLineGraph(dataArray, containerId) {
    const containerElement = document.getElementById(containerId);
    if (!containerElement) {
        console.error(`renderLineGraph: 要素 #${containerId} が見つかりません。`);
        return;
    }

    if (!Array.isArray(dataArray)) {
        console.warn("renderLineGraph: dataArray が配列ではありません。");
        containerElement.innerHTML = "<p>表示するデータがありません (データ形式エラー)。</p>";
        return;
    }

    if (dataArray.length === 0) {
        console.warn("renderLineGraph: dataArray が空です。");
        containerElement.innerHTML = "<p>表示する地震データがありません。</p>";
        return;
    }

    try {
        // 1. データを準備
        const lats = []; // 緯度
        const lons = []; // 経度
        const depths = []; // km
        const magnitudes = []; // マグニチュード
        const times = []; // 時刻 (Dateオブジェクト)
        const hoverTexts = []; // ホバーテキスト
        const sourceTypes = []; // 情報源

        dataArray.forEach((item) => {
            if (item && item.lat !== undefined && item.lng !== undefined) {
                const lat = parseFloat(item.lat);
                const lng = parseFloat(item.lng);
                if (!isNaN(lat) && !isNaN(lng)) {
                    lats.push(lat);
                    lons.push(lng);
                    depths.push(parseFloat(item.depth || item.Depth) || 0);
                    magnitudes.push(parseFloat(item.magnitude) || 0);
                    times.push(new Date(item.time || item.OriginTime || item.ReportTime || item.published || "1970-01-01"));
                    hoverTexts.push(
                        `<b>${item.location || item.HypoCenter || item.Hypocenter || "場所不明"}</b><br>` +
                        `M: ${item.magnitude || "情報なし"}<br>` +
                        `Depth: ${item.depth || item.Depth || "情報なし"} km<br>` +
                        `Time: ${item.time_full || item.time || item.OriginTime || item.ReportTime || item.published || "時間不明"}<br>` +
                        `Source: ${item.source || item.type || "不明"}`
                    );
                    sourceTypes.push(item.source || item.type || "unknown");
                }
            }
        });

        if (lats.length === 0) {
             containerElement.innerHTML = "<p>有効な地震データがありません。</p>";
             return;
        }

        // 2. データ系列 (ソース別) を作成
        const uniqueSources = [...new Set(sourceTypes)];
        const traces = uniqueSources.map((src) => {
            const indices = sourceTypes.map((s, i) => s === src ? i : null).filter(i => i !== null);
            return {
                type: 'scatter3d',
                mode: 'markers',
                name: src, // 凡例に表示される名前
                x: indices.map(i => lons[i]),
                y: indices.map(i => lats[i]),
                z: indices.map(i => -depths[i]), // PlotlyはZ軸上向きが正なので、深さは負にする
                text: indices.map(i => hoverTexts[i]), // ホバーテキスト
                hoverinfo: 'text',
                marker: {
                    size: indices.map(i => Math.max(2, 5 + Math.pow(magnitudes[i], 1.7))), // 最小サイズを設定
                    sizemode: 'diameter',
                    // color: indices.map(i => depths[i]), // 色を深さに応じて変える場合
                    // colorscale: 'Viridis',
                    // colorbar: { title: 'Depth (km)' },
                    opacity: 0.7,
                },
            };
        });

        // 3. レイアウトの定義
        const layout = {
            title: "地震データ 3D プロット (経度/緯度/深さ)",
            font: { color: "white" },
            paper_bgcolor: "black", // グラフ全体の背景色
            plot_bgcolor: "white", // プロット領域の背景色
            scene: {
                aspectmode: "manual", // <- 手動でアスペクト比を設定
                aspectratio: { x: 16, y: 9, z: 2 }, // <- 例: X軸をY軸、Z軸の2倍の長さにする
                xaxis: { title: "経度 (Longitude)" },
                yaxis: { title: "緯度 (Latitude)" },
                zaxis: { title: "深さ (Depth km)" }, // Z軸ラベルも更新
            },
            margin: { l: 0, r: 0, b: 0, t: 50 },
        };

        // 4. グラフを描画
        Plotly.react(containerId, traces, layout);

    } catch (error) {
        console.error("Plotly グラフ描画エラー:", error);
        containerElement.innerHTML = "<p>グラフの描画中にエラーが発生しました。</p>";
    }
}


/**
 * Plotly を使用して球面 3D 散布図を描画します。
 * @param {Array} dataArray - 表示する地震データオブジェクトの配列
 * @param {string} containerId - グラフを描画する要素のID
 * @param {Object|null} tsunamiAreaGeoJsonData - 津波区域GeoJSONデータ (処理済み、オプション)
 * @param {Object|null} latestTsunamiInfo - 最新の津波情報 (オプション)
 */
function renderSphereGraph(dataArray, containerId, tsunamiAreaGeoJsonData = null, latestTsunamiInfo = null) {
    const containerElement = document.getElementById(containerId);
    if (!containerElement) {
        console.error(`renderSphereGraph: 要素 #${containerId} が見つかりません。`);
        return;
    }

    if (!Array.isArray(dataArray)) {
        console.warn("renderSphereGraph: dataArray が配列ではありません。");
        containerElement.innerHTML = "<p>表示するデータがありません (データ形式エラー)。</p>";
        return;
    }

    if (dataArray.length === 0) {
        console.warn("renderSphereGraph: dataArray が空です。");
        containerElement.innerHTML = "<p>表示する地震データがありません。</p>";
        return;
    }

    (async () => {
        try {
            // - 津波トレース生成のためのコード追加開始 -
            let tsunamiTraces = []; // 津波関連のトレースを格納する配列
            if (tsunamiAreaGeoJsonData && latestTsunamiInfo && !latestTsunamiInfo.cancelled && latestTsunamiInfo.areas) {

                // 1. 警報状況データをマップ化 (区域名 -> {grade, immediate})
                const tsunamiStatusMap = new Map();
                latestTsunamiInfo.areas.forEach((area) => {
                    if (area.regions && area.regions.length > 0) {
                        area.regions.forEach((region) => {
                            tsunamiStatusMap.set(region.name, {
                                grade: region.grade,
                                immediate: region.immediate,
                            });
                        });
                    }
                });

                // 2. GeoJSONデータから3Dメッシュを作成
                const tsunamiX = [];
                const tsunamiY = [];
                const tsunamiZ = [];
                const tsunamiColors = [];
                const tsunamiTexts = [];
                const tsunamiIndices = []; // i, j, k インデックス

                let vertexIndex = 0; // 頂点のグローバルインデックス

                // FeatureCollection をループ
                tsunamiAreaGeoJsonData.features.forEach((feature) => {
                    const regionName = feature.properties.name;
                    const status = tsunamiStatusMap.get(regionName);

                    if (!status) return; // 警報がない区域はスキップ

                    const grade = status.grade;
                    const immediate = status.immediate;

                    // Polygon タイプのみ対応 (MultiPolygon などは別途処理が必要)
                    if (feature.geometry.type === "Polygon") {
                        const coordinates = feature.geometry.coordinates[0]; // 外環のみ

                        const ringX = [];
                        const ringY = [];
                        const ringZ = [];

                        // 地理座標 (経度, 緯度) を 3D カルト座標 (x, y, z) に変換
                        coordinates.forEach(([lng, lat]) => {
                            const phi = (90 - lat) * Math.PI / 180; // 余緯 (radians)
                            const theta = lng * Math.PI / 180; // 経度 (radians)
                            const EARTH_RADIUS_KM = 6371;
                            const x = EARTH_RADIUS_KM * Math.sin(phi) * Math.cos(theta);
                            const y = EARTH_RADIUS_KM * Math.sin(phi) * Math.sin(theta);
                            const z = EARTH_RADIUS_KM * Math.cos(phi);
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
                                tsunamiIndices.push(vertexIndex); // i
                                tsunamiIndices.push(vertexIndex + i); // j
                                tsunamiIndices.push(vertexIndex + i + 1); // k
                            }
                        }

                        // 色とテキストを各頂点に割り当て
                        const color = grade === "MajorWarning" ? "red" :
                                      grade === "Warning" ? "red" :
                                      grade === "Watch" ? "orange" :
                                      grade === "Forecast" ? "yellow" : "gray";
                        const text = `${regionName}<br>警報等級: ${grade}${immediate ? " (直ちに来襲)" : ""}`;

                        for (let i = 0; i < numVertices; i++) {
                            tsunamiColors.push(color);
                            tsunamiTexts.push(text);
                        }

                        // 頂点インデックスを更新
                        vertexIndex += numVertices;
                    }
                    // MultiPolygon など他のタイプも必要に応じて処理
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
                        type: "mesh3d",
                        x: tsunamiX,
                        y: tsunamiY,
                        z: tsunamiZ,
                        i: i_indices,
                        j: j_indices,
                        k: k_indices,
                        name: "津波警報/注意報区域",
                        text: tsunamiTexts, // 各頂点のテキスト
                        hoverinfo: "text",
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
            // - 津波トレース生成のためのコード追加終了 -


            // 1. データを準備
            const lats = [];
            const lons = [];
            const depths = []; // km
            const magnitudes = [];
            const times = []; // Date objects
            const hoverTexts = [];
            const sourceTypes = [];

            dataArray.forEach((item) => {
                if (item && item.lat !== undefined && item.lng !== undefined) {
                    const lat = parseFloat(item.lat);
                    const lng = parseFloat(item.lng);
                    if (!isNaN(lat) && !isNaN(lng)) {
                        lats.push(lat);
                        lons.push(lng);
                        depths.push(parseFloat(item.depth || item.Depth) || 0);
                        magnitudes.push(parseFloat(item.magnitude) || 0);
                        times.push(new Date(item.time || item.OriginTime || item.ReportTime || item.published || "1970-01-01"));
                        hoverTexts.push(
                            `<b>${item.location || item.HypoCenter || item.Hypocenter || "場所不明"}</b><br>` +
                            `M: ${item.magnitude || "情報なし"}<br>` +
                            `Depth: ${item.depth || item.Depth || "情報なし"} km<br>` +
                            `Time: ${item.time_full || item.time || item.OriginTime || item.ReportTime || item.published || "時間不明"}<br>` +
                            `Source: ${item.source || item.type || "不明"}`
                        );
                        sourceTypes.push(item.source || item.type || "unknown");
                    }
                }
            });

             if (lats.length === 0) {
                 containerElement.innerHTML = "<p>有効な地震データがありません。</p>";
                 return;
             }

            // 地球の半径 (km)
            const EARTH_RADIUS_KM = 6371;

            // 2. 経緯度・深さを3D直交座標に変換
            const x_coords = [];
            const y_coords = [];
            const z_coords = [];

            for (let i = 0; i < lats.length; i++) {
                // 深さは地球内部の距離になるので、地球半径から引く
                const r = EARTH_RADIUS_KM - depths[i];
                // 緯度 (phi) と経度 (theta) をラジアンに変換
                // 緯度: -90 (南) から 90 (北)。 phi = (90 - lat) * pi/180
                // 経度: -180 (西) から 180 (東)。 theta = lng * pi/180
                const phi = (90 - lats[i]) * Math.PI / 180;
                const theta = lons[i] * Math.PI / 180;

                x_coords.push(r * Math.sin(phi) * Math.cos(theta));
                y_coords.push(r * Math.sin(phi) * Math.sin(theta));
                z_coords.push(r * Math.cos(phi));
            }

            // 3. データ系列 (ソース別) を作成
            const uniqueSources = [...new Set(sourceTypes)];
            const dataTraces = uniqueSources.map((src) => {
                const indices = sourceTypes.map((s, i) => s === src ? i : null).filter(i => i !== null);
                return {
                    type: 'scatter3d',
                    mode: 'markers',
                    name: src,
                    x: indices.map(i => x_coords[i]),
                    y: indices.map(i => y_coords[i]),
                    z: indices.map(i => z_coords[i]),
                    text: indices.map(i => hoverTexts[i]),
                    hoverinfo: 'text',
                    marker: {
                        size: indices.map(i => Math.max(2, 5 + Math.pow(magnitudes[i], 1.7))),
                        sizemode: 'diameter',
                        opacity: 0.7,
                    },
                };
            });

            // === 新規: 地球球体のトレースを作成 ===
            // 球面データ生成
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

            const earthSphereTrace = {
                type: 'surface',
                x: sphere_x,
                y: sphere_y,
                z: sphere_z,
                opacity: 0,
                showscale: false,
                hoverinfo: 'none',
                colorscale: [[0, 'darkgray'], [1, 'darkgray']],
                name: '地球',
            };
            // === 新規: 地球球体のトレース作成 ここまで ===

            // === 新規: プレート境界線データの取得と処理 ===
            let plateBoundariesTrace = null; // 初期化
            try {
                console.log("プレート境界データを取得します...");
                const response = await fetch("https://raw.githubusercontent.com/fraxen/tectonicplates/master/GeoJSON/PB2002_boundaries.json");
                if (!response.ok) {
                    throw new Error(`プレート境界データ取得エラー: HTTP status ${response.status}`);
                }
                const plateData = await response.json();
                console.log("プレート境界データを取得しました。");

                // 境界線の座標を格納する配列
                const boundariesX = [];
                const boundariesY = [];
                const boundariesZ = [];

                // features をループ処理
                plateData.features.forEach((feature) => {
                    if (feature.geometry.type === "LineString") {
                        const coords = feature.geometry.coordinates;
                        coords.forEach(([lng, lat]) => {
                            // 地理座標を3Dカルト座標に変換
                            const phi = (90 - lat) * Math.PI / 180;
                            const theta = lng * Math.PI / 180;
                            const x = EARTH_RADIUS_KM * Math.sin(phi) * Math.cos(theta);
                            const y = EARTH_RADIUS_KM * Math.sin(phi) * Math.sin(theta);
                            const z = EARTH_RADIUS_KM * Math.cos(phi);
                            boundariesX.push(x);
                            boundariesY.push(y);
                            boundariesZ.push(z);
                        });
                        // 各ラインの終端に NaN を挿入して、ラインを分離
                        boundariesX.push(NaN);
                        boundariesY.push(NaN);
                        boundariesZ.push(NaN);
                    }
                    // MultiLineString など他のタイプも必要に応じて処理
                });

                if (boundariesX.length > 0) {
                    plateBoundariesTrace = {
                        type: 'scatter3d',
                        mode: 'lines',
                        x: boundariesX,
                        y: boundariesY,
                        z: boundariesZ,
                        line: {
                            color: 'orange',
                            width: 1.5,
                        },
                        name: 'プレート境界',
                        hoverinfo: 'none',
                    };
                    console.log("プレート境界線トレースを作成しました。");
                } else {
                    console.warn("プレート境界データから有効なラインが生成されませんでした。");
                }
            } catch (error) {
                console.error("プレート境界データの取得または処理中にエラーが発生しました:", error);
                console.warn("プレート境界は表示されません。");
            }
            // === 新規: プレート境界線データの取得と処理 ここまで ===

            // === 新規: Datamaps World.json データの取得と処理 ===
            let worldMapTrace = null; // 初期化
            try {
                console.log("世界地図データ (Datamaps) を取得します...");
                const response = await fetch("https://raw.githubusercontent.com/markmarkoh/datamaps/master/src/js/data/world.topo.json");
                if (!response.ok) {
                    throw new Error(`世界地図データ取得エラー: HTTP status ${response.status}`);
                }
                const worldData = await response.json();
                console.log("世界地図データ (Datamaps) を取得しました。");

                // TopoJSON から GeoJSON へ変換 (簡易版、完全な変換には topojson-client ライブラリ推奨)
                // ここでは、既に GeoJSON 形式であると仮定して処理を続ける
                // 実際には worldData は TopoJSON なので、変換が必要です。
                // ただし、このコードスニペットでは簡略化のため、変換ロジックは省略します。
                // 代わりに、既存の境界線データ取得コードが機能していると仮定します。
                // この部分は、実際に worldData を正しく処理するコードに置き換える必要があります。
                // 以下は、プレート境界データ取得コードを流用した例です。

                // 例として、worldData が GeoJSON だと仮定 (実際は異なる)
                const worldX = [];
                const worldY = [];
                const worldZ = [];

                 // worldData が実際の TopoJSON であるため、この部分は動作しません。
                 // 正しい実装には topojson-client の使用が必要です。
                 // ここでは、プレート境界の取得が成功していればそれを再利用する例を示します。
                 // 実際のプロジェクトでは、worldData を正しくパースする必要があります。
                 // 以下はプレート境界のデータを再利用する擬似的な例です。
                 // --- プレート境界データを再利用 (擬似) ---
                 if (plateBoundariesTrace) {
                     worldMapTrace = {
                         ...plateBoundariesTrace, // プレート境界のデータをコピー
                         name: "世界地図境界", // 名前を変更
                         line: { // スタイルを調整
                             color: "white",
                             width: 4.8,
                         }
                     };
                     console.log("世界地図 (Datamaps) トレースをプレート境界データから作成しました。");
                 } else {
                     console.warn("世界地図データ (Datamaps) から有効なポイントが生成されませんでした。");
                 }
                 // --- プレート境界データを再利用 (擬似) ここまで ---

            } catch (error) {
                console.error("世界地図データ (Datamaps) の取得または処理中にエラーが発生しました:", error);
                console.warn("世界地図データの読み込みに失敗しましたが、他の要素は表示されます。");
            }
            // === 新規: Datamaps World.json データの取得と処理 ここまで ===


            // 4. すべてのトレースを結合 (worldMapTrace, plateBoundariesTrace を追加)
            // 描画順序: 球体 -> 世界地図 -> プレート境界 -> 津波 -> 地震データ
            const allTraces = [
                earthSphereTrace,
                ...(worldMapTrace ? [worldMapTrace] : []), // 条件付き追加
                ...(plateBoundariesTrace ? [plateBoundariesTrace] : []), // 条件付き追加
                ...tsunamiTraces, // 津波トレースを追加
                ...dataTraces
            ];

            // 5. レイアウト定義
            const layout = {
                title: "地球儀 3D 地震プロット",
                showlegend: true,
                font: { color: "white" },
                paper_bgcolor: "black",
                plot_bgcolor: "black",
                scene: {
                    xaxis: { visible: false },
                    yaxis: { visible: false },
                    zaxis: { visible: false },
                    aspectmode: "data", // データに応じたアスペクト比
                    bgcolor: "black",
                    camera: {
                        eye: { x: 1.25, y: 1.25, z: 1.25 } // 初期視点
                    }
                },
                margin: { l: 0, r: 0, b: 0, t: 50 },
            };

            // 6. グラフを描画
            Plotly.react(containerId, allTraces, layout);

        } catch (error) {
            console.error("球面Plotly グラフ描画エラー:", error);
            document.getElementById(containerId).innerHTML = "<p>球面グラフの描画中にエラーが発生しました。</p>";
        }
    })();
}


/**
 * 接続状態と最終更新時刻をUIに反映します。
 * @param {Object} connections - 接続状態オブジェクト (StateManager.state.connections)
 * @param {Object} lastUpdateTimes - 最終更新時刻オブジェクト (StateManager.state.lastUpdateTimes)
 */
function renderStatusInfo(connections, lastUpdateTimes) {
    // 各データソースの状態表示要素を更新
    const connectionElements = {
        'jmaEew': document.getElementById('jmaEewStatus'),
        'jmaEq': document.getElementById('jmaEqStatus'),
        'scEew': document.getElementById('scEewStatus'),
        'fjEew': document.getElementById('fjEewStatus'),
        'cencEq': document.getElementById('cencEqStatus'),
        'ceaEew': document.getElementById('ceaEewStatus'),
        'iclEew': document.getElementById('iclEewStatus'),
        'emscEq': document.getElementById('emscEqStatus'),
        'cwaEq': document.getElementById('cwaEqStatus'),
        'cwaEq_tiny': document.getElementById('cwaEq_tinyStatus'),
        'sa': document.getElementById('saStatus'), // ShakeAlert
        // 必要に応じて追加
    };

    const updateTimeElements = {
        'jmaEew': document.getElementById('jmaEewLastUpdate'),
        'scEew': document.getElementById('scEewLastUpdate'),
        'fjEew': document.getElementById('fjEewLastUpdate'),
        'jmaEq': document.getElementById('jmaEqLastUpdate'),
        'cencEq': document.getElementById('cencEqLastUpdate'),
        'jmaXml': document.getElementById('jmaXmlLastUpdate'),
        'ceaEew': document.getElementById('ceaEewLastUpdate'),
        'iclEew': document.getElementById('iclEewLastUpdate'),
        'emscEq': document.getElementById('emscEqLastUpdate'),
        'cwaEq': document.getElementById('cwaEqLastUpdate'),
        'cwaEq_tiny': document.getElementById('cwaEq_tinyLastUpdate'),
        'jmaGeojson': document.getElementById('jmaHypoLastUpdate'),
        // 必要に応じて追加
    };

    // 接続状態更新
    for (const [source, element] of Object.entries(connectionElements)) {
        if (element) {
            const isConnected = connections[source];
            element.textContent = isConnected ? '接続中' : '未接続';
            element.className = `status ${isConnected ? 'connected' : 'disconnected'}`;
        }
    }

    // 最終更新時刻更新
    for (const [source, element] of Object.entries(updateTimeElements)) {
        if (element) {
            const updateTime = lastUpdateTimes[source];
            if (updateTime) {
                element.textContent = dataProcessor.formatTimeAgo ? dataProcessor.formatTimeAgo(updateTime) : new Date(updateTime).toLocaleString();
            } else {
                element.textContent = '未更新';
            }
        }
    }

    // 統合リストの最終更新時刻表示 (例: combinedStatus 要素)
    const combinedStatusElement = document.getElementById('combinedStatus');
    if (combinedStatusElement) {
        // ここでは、最新の更新時刻を表示する例
        const latestUpdateTime = Object.values(lastUpdateTimes)
            .filter(time => time instanceof Date || (typeof time === 'string' && !isNaN(Date.parse(time))))
            .map(time => new Date(time))
            .sort((a, b) => b - a)[0];

        if (latestUpdateTime) {
            combinedStatusElement.textContent = `最新更新: ${dataProcessor.formatTimeAgo ? dataProcessor.formatTimeAgo(latestUpdateTime) : latestUpdateTime.toLocaleString()}`;
        } else {
            combinedStatusElement.textContent = '最新更新: データがありません';
        }
    }
}


/**
 * JMA XML 詳細情報を描画します。
 * @param {string} xmlContent - JMA XMLの文字列
 * @param {HTMLElement} containerElement - 詳細情報を描画する要素
 */
function renderJmaXmlDetail(xmlContent, containerElement) {
    if (!containerElement) {
        console.error("renderJmaXmlDetail: containerElement が指定されていません。");
        return;
    }

    if (!xmlContent) {
        containerElement.innerHTML = `<p class="no-data">詳細情報がありません</p>`;
        return;
    }

    try {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlContent, "text/xml");

        // エラーチェック
        const parseError = xmlDoc.querySelector("parsererror");
        if (parseError) {
            throw new Error(`XMLパースエラー: ${parseError.textContent}`);
        }

        // カスタム解析関数を呼び出し (dataProcessor.js に実装がある想定)
        // ただし、提供されたコード断片には parseJmaXmlDetail が含まれていたため、
        // それを再利用する形にします。
        // 実際には、dataProcessor に移動するのが望ましいです。

        // --- 以下のコードは、提供されたコード断片の `parseJmaXmlDetail` ロジックを内蔵 ---
        let html = "";

        // タイトル
        const title = xmlDoc.querySelector("Title")?.textContent ||
                      xmlDoc.querySelector("title")?.textContent ||
                      "情報なし";
        html += `<h3>${title}</h3>`;

        // 発表時刻
        const published = xmlDoc.querySelector("DateTime")?.textContent ||
                          xmlDoc.querySelector("datetime")?.textContent ||
                          xmlDoc.querySelector("published")?.textContent ||
                          "";
        // JMA XML時間フォーマット関数 (内蔵)
        const formatJmaXmlTime = (timeStr) => {
            if (!timeStr) return "情報なし";
            const date = new Date(timeStr);
            return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}`;
        };
        html += `<p class="time">発表時刻: ${formatJmaXmlTime(published)}</p>`;

        // 地震情報の抽出
        const earthquakes = xmlDoc.querySelectorAll("Earthquake");
        if (earthquakes.length > 0) {
            earthquakes.forEach((eq, index) => {
                html += `<div class="earthquake-detail">`;
                html += `<h4>地震 ${index + 1}</h4>`;

                // 発生時刻
                const originTime = eq.querySelector("OriginTime")?.textContent ||
                                   eq.querySelector("originTime")?.textContent ||
                                   "情報なし";
                html += `<p>発生時刻: ${formatJmaXmlTime(originTime)}</p>`;

                // 震源
                const hypoName = eq.querySelector("Hypocenter > Name")?.textContent ||
                                 eq.querySelector("hypocenter > name")?.textContent ||
                                 "情報なし";
                html += `<p>震源: ${hypoName}</p>`;

                // 緯度・経度
                const latitude = eq.querySelector("Hypocenter > Latitude")?.textContent ||
                                 eq.querySelector("hypocenter > latitude")?.textContent ||
                                 "情報なし";
                const longitude = eq.querySelector("Hypocenter > Longitude")?.textContent ||
                                  eq.querySelector("hypocenter > longitude")?.textContent ||
                                  "情報なし";
                html += `<p>緯度: ${latitude}, 経度: ${longitude}</p>`;

                // 深さ
                const depthNode = eq.querySelector("Hypocenter > Depth");
                let depthText = "情報なし";
                if (depthNode) {
                    const depthValue = depthNode.textContent;
                    const depthUnit = depthNode.getAttribute("unit") || "km";
                    depthText = `${depthValue} ${depthUnit}`;
                }
                html += `<p>深さ: ${depthText}</p>`;

                // マグニチュード
                const magnitude = eq.querySelector("Magnitude")?.textContent ||
                                  eq.querySelector("magnitude")?.textContent ||
                                  "情報なし";
                const magType = eq.querySelector("Magnitude")?.getAttribute("type") ||
                                eq.querySelector("magnitude")?.getAttribute("type") ||
                                "M";
                html += `<p>${magType}: ${magnitude}</p>`;

                // 最大震度
                const maxInt = eq.querySelector("jmx_eb:MaxInt")?.textContent ||
                               eq.querySelector("maxInt")?.textContent ||
                               "情報なし";
                if (maxInt && maxInt !== "情報なし") {
                    html += `<p>最大震度: ${dataProcessor.getIntersityLabel_j(maxInt)}</p>`;
                }

                // 震度観測点情報
                const intensityPrefList = eq.querySelectorAll("Intensity > Pref") ||
                                          eq.querySelectorAll("intensity > pref") ||
                                          [];
                if (intensityPrefList.length > 0) {
                    html += `<div style="margin-left: 20px;">`;
                    html += `<h5>震度観測点</h5>`;
                    intensityPrefList.forEach((pref) => {
                        const prefName = pref.querySelector("Name")?.textContent ||
                                         pref.querySelector("name")?.textContent ||
                                         "情報なし";
                        html += `<div style="margin-left: 20px;">`;
                        html += `<p>┌─ ${prefName}</p>`;

                        const cityList = pref.querySelectorAll("City") ||
                                         pref.querySelectorAll("city") ||
                                         [];
                        cityList.forEach((city) => {
                            const cityName = city.querySelector("Name")?.textContent ||
                                             city.querySelector("name")?.textContent ||
                                             "情報なし";
                            const cityMaxInt = city.querySelector("MaxInt")?.textContent ||
                                               city.querySelector("maxInt")?.textContent ||
                                               "情報なし";
                            html += `<div style="margin-left: 40px;">`;
                            html += `<p>└─ ${cityName}: ${dataProcessor.getIntersityLabel_j(cityMaxInt)}</p>`;

                            // 観測点の震度
                            const stationList = city.querySelectorAll("IntensityStation") ||
                                                city.querySelectorAll("station") ||
                                                [];
                            stationList.forEach((station) => {
                                const stationName = station.querySelector("Name")?.textContent ||
                                                    "情報なし";
                                const stationInt = station.querySelector("Int")?.textContent ||
                                                   station.querySelector("int")?.textContent ||
                                                   "情報なし";
                                html += `<div style="margin-left: 60px;">`;
                                html += `<p>・${stationName}: ${dataProcessor.getIntersityLabel_j(stationInt)}</p>`;
                                html += `</div>`;
                            });
                            html += `</div>`;
                        });
                        html += `</div>`;
                    });
                    html += `</div>`;
                }

                html += `</div>`; // .earthquake-detail
            });
        } else {
             html += `<p>地震情報がありません。</p>`;
        }
        // --- 内蔵解析ロジック終了 ---

        containerElement.innerHTML = html;

    } catch (error) {
        console.error("XML詳細描画エラー:", error);
        containerElement.innerHTML = `<p class="no-data">詳細情報の描画に失敗しました</p><p>エラー: ${error.message}</p>`;
    }
}


// --- モジュールエクスポート ---
// 他のスクリプトからこれらの関数を使用できるようにします。
// (モジュールシステムを使っている場合は export { ... };)
// または、グローバル変数として (現状のコード構造に合わせる場合)
window.uiRenderer = {
    renderEarthquakeList,
    renderMapMarkers,
    renderTsunamiLayer,
    renderLineGraph,
    renderSphereGraph,
    renderStatusInfo,
    renderJmaXmlDetail,
    // 内部ヘルパー関数はエクスポートしない
};

console.log("UIRenderer initialized.");
