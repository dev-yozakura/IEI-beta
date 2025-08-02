// dataProcessor.js

// --- ヘルパー関数群 (データ変換の中心) ---

/**
 * 震度を整数に変換します。
 * @param {string|number|null|undefined} intensity - 入力される震度（ローマ数字、数値、文字列数値など）
 * @returns {number} 変換された整数震度。変換できない場合は 0。
 */
function getIntensityInteger(intensity) {
  // null, undefined, 空文字の場合は 0 を返す
  if (intensity === null || intensity === undefined || intensity === "") {
    return 0;
  }

  // すでに数値型であれば、絶対値の整数部分を返す
  if (typeof intensity === "number") {
    return Math.floor(Math.abs(intensity));
  }

  // 文字列型の場合
  if (typeof intensity === "string") {
    // トリムして前後の空白を除去
    const trimmedIntensity = intensity.trim();

    // 空文字チェック（トリム後）
    if (trimmedIntensity === "") {
      return 0;
    }

    // ローマ数字マッピング
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

    // ローマ数字チェック
    if (romanToNumber.hasOwnProperty(trimmedIntensity)) {
      return romanToNumber[trimmedIntensity];
    }

    // 数値文字列チェック (例: "5.5", "4")
    const num = parseFloat(trimmedIntensity);
    if (!isNaN(num)) {
      return Math.floor(Math.abs(num)); // 負数の場合は絶対値を取る
    }
  }

  // その他の型または変換不能な場合は 0 を返す
  console.warn(
    `getIntensityInteger: 変換できない値です。入力: ${intensity} (型: ${typeof intensity})`
  );
  return 0;
}

/**
 * 震度値から、対応するHTMLラベル文字列を生成します (国際向け?)。
 * @param {string|number|null|undefined} intensity - 入力される震度
 * @returns {string} 生成されたHTMLラベル文字列。入力が無効な場合は空文字。
 */
function getIntersityLabel(intensity) {
  // null, undefined, 空文字の場合は空文字を返す
  if (intensity === null || intensity === undefined || intensity === "") {
    return "";
  }

  let level = "";
  let text = "";

  if (typeof intensity === "string") {
    const trimmedIntensity = intensity.trim();
    if (trimmedIntensity === "") {
      return "";
    }

    // ローマ数字対応 (例: "III")
    // ローマ数字マッピング (レベルとテキストが同じ)
    const romanLevels = [
      "I",
      "II",
      "III",
      "IV",
      "V",
      "VI",
      "VII",
      "VIII",
      "IX",
      "X",
    ];
    const romanIndex = romanLevels.indexOf(trimmedIntensity);
    if (romanIndex !== -1) {
      level = `level-${romanIndex + 1}`;
      text = trimmedIntensity;
      return `<span class="intensity-label ${level}">${text}</span>`; // すぐに返す
    }

    // 弱/強に対応
    if (trimmedIntensity === "弱") {
      level = "weak";
      text = "弱";
      return `<span class="intensity-label ${level}">${text}</span>`;
    } else if (trimmedIntensity === "強") {
      level = "strong";
      text = "強";
      return `<span class="intensity-label ${level}">${text}</span>`;
    }

    // 数値文字列に対応 (例: "5.5", "4")
    const num = parseFloat(trimmedIntensity);
    if (!isNaN(num)) {
      const isDecimal = num % 1 !== 0;
      if (isDecimal) {
        // 小数値の場合は level-5.5 のような形式 (toFixed(1) で1桁の小数にする)
        level = `level-${num.toFixed(1)}`; // 例: "level-5.5"
        text = num.toFixed(1); // 例: "5.5"
      } else {
        // 整数値の場合は level-5 のような形式
        const intNum = Math.floor(num);
        level = `level-${intNum}`;
        text = intNum.toString();
      }
      return `<span class="intensity-label ${level}">${text}</span>`;
    }

    // その他の文字列 (例: "情報なし") は空文字を返す
    console.warn(
      `getIntersityLabel: 処理できない文字列形式の震度です。入力: ${intensity}`
    );
    return ""; // または return `<span class="intensity-label">${intensity}</span>`; など
  } else if (typeof intensity === "number") {
    // 数値型の場合
    const isDecimal = intensity % 1 !== 0;
    if (isDecimal) {
      level = `level-${intensity.toFixed(1)}`; // 例: "level-5.5"
      text = intensity.toFixed(1); // 例: "5.5"
    } else {
      const intNum = Math.floor(intensity);
      level = `level-${intNum}`;
      text = intNum.toString();
    }
    return `<span class="intensity-label ${level}">${text}</span>`;
  } else {
    // その他の型
    console.warn(
      `getIntersityLabel: サポートされていない型の震度です。入力: ${intensity} (型: ${typeof intensity})`
    );
    return "";
  }
}

/**
 * 日本向け震度ラベル（`intensity-label_j` クラス使用）を生成します。
 * @param {string|number|null|undefined} intensity - 入力される震度（ローマ数字、漢字「弱」「強」、数値など）
 * @returns {string} 生成されたHTMLラベル文字列。入力が無効な場合は空文字。
 */
function getIntersityLabel_j(intensity) {
  // 1. null, undefined, 空文字の場合は空文字を返す
  if (intensity === null || intensity === undefined || intensity === "") {
    return "";
  }

  let level = "";
  let text = "";

  // 2. 文字列型の場合
  if (typeof intensity === "string") {
    const trimmedIntensity = intensity.trim();

    // トリム後、空文字なら空文字を返す
    if (trimmedIntensity === "") {
      return "";
    }

    // 3. ローマ数字マッピング
    const romanIntensityMap = {
      I: { level: "level-1", text: "I" },
      II: { level: "level-2", text: "II" },
      III: { level: "level-3", text: "III" },
      IV: { level: "level-4", text: "IV" },
      V: { level: "level-5", text: "V" },
      VI: { level: "level-6", text: "VI" },
      VII: { level: "level-7", text: "VII" },
      VIII: { level: "level-8", text: "VIII" },
      IX: { level: "level-9", text: "IX" },
      X: { level: "level-10", text: "X" },
    };

    // ローマ数字チェック
    if (romanIntensityMap.hasOwnProperty(trimmedIntensity)) {
      const mapping = romanIntensityMap[trimmedIntensity];
      level = mapping.level;
      text = mapping.text;
      // マッチしたら即座にHTMLを返す
      return `<span class="intensity-label_j ${level}">${text}</span>`;
    }

    // 4. 漢字「弱」「強」のチェック
    if (trimmedIntensity === "弱") {
      level = "weak";
      text = "弱";
      return `<span class="intensity-label_j ${level}">${text}</span>`;
    } else if (trimmedIntensity === "強") {
      level = "strong";
      text = "強";
      return `<span class="intensity-label_j ${level}">${text}</span>`;
    }

    // 5. 文字列型の数値 ("5.5", "4") のチェック
    const num = parseFloat(trimmedIntensity);
    if (!isNaN(num)) {
      const isDecimal = num % 1 !== 0;
      if (isDecimal) {
        level = `level-${num.toFixed(1)}`;
        text = num.toFixed(1);
      } else {
        const intNum = Math.floor(num);
        level = `level-${intNum}`;
        text = intNum.toString();
      }
      return `<span class="intensity-label_j ${level}">${text}</span>`;
    }

    // 6. その他の文字列形式
    console.warn(
      `getIntersityLabel_j: 処理できない文字列形式の震度です。入力: ${intensity}`
    );
    return ""; // または return `<span class="intensity-label_j">${intensity}</span>`; など

    // 7. 数値型の場合
  } else if (typeof intensity === "number") {
    const isDecimal = intensity % 1 !== 0;
    if (isDecimal) {
      level = `level-${intensity.toFixed(1)}`;
      text = intensity.toFixed(1);
    } else {
      const intNum = Math.floor(intensity);
      level = `level-${intNum}`;
      text = intNum.toString();
    }
    return `<span class="intensity-label_j ${level}">${text}</span>`;

    // 8. その他の型
  } else {
    console.warn(
      `getIntersityLabel_j: サポートされていない型の震度です。入力: ${intensity} (型: ${typeof intensity})`
    );
    return "";
  }
}

/**
 * 指定された日時文字列とオフセットをもとに、UTCのDateオブジェクトを生成します。
 * @param {string} dateTimeStr - "YYYY-MM-DD HH:mm:ss" 形式の日時文字列
 * @param {number} offsetHours - ローカルタイムゾーンのUTCからのオフセット（時間）。デフォルトは8（CST/中国標準時）。
 * @returns {Date|null} 変換されたDateオブジェクト。失敗した場合はnull。
 */
function parseLocalTimeToUTCDate(dateTimeStr, offsetHours = 8) {
  // 入力チェック
  if (!dateTimeStr || typeof dateTimeStr !== "string") {
    console.warn("parseLocalTimeToUTCDate: 無効な日時文字列です:", dateTimeStr);
    return null;
  }

  // 文字列を年、月、日、時、分、秒に分割
  const parts = dateTimeStr.match(
    /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/
  );

  if (!parts) {
    console.warn(
      "parseLocalTimeToUTCDate: 日時文字列の形式が正しくありません:",
      dateTimeStr
    );
    return null;
  }

  // Date.UTC は引数がUTC時刻を表す値を期待するため、オフセットを引いて調整
  // Dateコンストラクタは月が0始まりなので、1引く
  const utcDate = new Date(
    Date.UTC(
      parseInt(parts[1], 10), // year
      parseInt(parts[2], 10) - 1, // month (0-11)
      parseInt(parts[3], 10), // day
      parseInt(parts[4], 10) - offsetHours, // hour (UTCに変換)
      parseInt(parts[5], 10), // minute
      parseInt(parts[6], 10) // second
    )
  );

  // 結果が有効な日付かチェック
  if (isNaN(utcDate.getTime())) {
    console.warn(
      "parseLocalTimeToUTCDate: Dateオブジェクトの生成に失敗しました:",
      dateTimeStr
    );
    return null;
  }

  return utcDate;
}

/**
 * BMKGのWIBタイムスタンプ ("DD Month YYYY, HH:MM:SS WIB") をUTCのDateオブジェクトに変換します。
 * @param {string} dateString - 日付文字列 (例: "05 April 2025")
 * @param {string} timeString - 時刻文字列 (例: "14:30:00 WIB")
 * @returns {Date|null} 変換されたDateオブジェクト。失敗した場合はnull。
 */
function parseBmkgWibTimeToUTCDate(dateString, timeString) {
  if (!dateString || !timeString) {
    console.warn(
      "parseBmkgWibTimeToUTCDate: 日付または時刻文字列がありません。",
      dateString,
      timeString
    );
    return null;
  }

  // 時刻文字列から "WIB" を削除
  const cleanTimeString = timeString.replace("WIB", "").trim();
  // 日付と時刻を結合
  const combinedDateTimeString = `${dateString}, ${cleanTimeString}`;

  // 月名マッピング (英語名から月インデックスへ)
  const monthNames = {
    January: 0,
    February: 1,
    March: 2,
    April: 3,
    May: 4,
    June: 5,
    July: 6,
    August: 7,
    September: 8,
    October: 9,
    November: 10,
    December: 11,
  };

  // 正規表現でパース
  const regex = /^(\d{1,2})\s+(\w+)\s+(\d{4}),\s+(\d{1,2}):(\d{2}):(\d{2})$/;
  const match = combinedDateTimeString.match(regex);

  if (!match) {
    console.warn(
      "parseBmkgWibTimeToUTCDate: 文字列形式が正しくありません。",
      combinedDateTimeString
    );
    return null;
  }

  const day = parseInt(match[1], 10);
  const monthName = match[2];
  const year = parseInt(match[3], 10);
  const hour = parseInt(match[4], 10);
  const minute = parseInt(match[5], 10);
  const second = parseInt(match[6], 10);

  const monthIndex = monthNames[monthName];
  if (monthIndex === undefined) {
    console.warn("parseBmkgWibTimeToUTCDate: 無効な月名です。", monthName);
    return null;
  }

  // WIBはUTC+7
  // Date.UTCはUTC時刻を期待するので、ローカル時刻(UTC+7)から7時間を引く
  const utcDate = new Date(
    Date.UTC(year, monthIndex, day, hour - 7, minute, second)
  );

  if (isNaN(utcDate.getTime())) {
    console.warn(
      "parseBmkgWibTimeToUTCDate: Dateオブジェクトの生成に失敗しました。",
      combinedDateTimeString
    );
    return null;
  }

  return utcDate;
}

// --- データ処理関数群 (各ソース別) ---

/**
 * USGS GeoJSON データを内部統一形式に変換します。
 * @param {Object} rawData - USGS APIから取得した生のGeoJSONオブジェクト
 * @returns {Array} 変換された地震データオブジェクトの配列
 */
function processUsgsData(rawData) {
  const processedData = [];
  try {
    if (rawData && Array.isArray(rawData.features)) {
      rawData.features.forEach((feature) => {
        const props = feature.properties;
        const geom = feature.geometry;

        if (!props || !geom) return; // 不完全なデータをスキップ

        const time = new Date(props.time);
        const updateTime = new Date(props.updated);
        const coordinates = geom.coordinates || [
          "情報なし",
          "情報なし",
          "情報なし",
        ];
        const lon =
          coordinates[0] !== "情報なし" ? parseFloat(coordinates[0]) : null;
        const lat =
          coordinates[1] !== "情報なし" ? parseFloat(coordinates[1]) : null;
        const depth =
          coordinates[2] !== "情報なし" ? parseFloat(coordinates[2]) : null;

        let intensity = null;
        const cdi = props.cdi;
        const mmi = props.mmi;
        if (cdi !== null && cdi !== undefined && cdi >= (mmi || 0)) {
          intensity = cdi;
        } else if (mmi !== null && mmi !== undefined) {
          intensity = mmi;
        }

        processedData.push({
          id: props.code || props.ids || `usgs_${time.getTime()}_${lat}_${lon}`, // 固有ID生成
          source: "usgs",
          displayType: "eq",
          Title: props.title,
          time: time.toISOString(),
          time_full: time.toLocaleString(),
          updateTime: updateTime.toISOString(),
          updateTime_full: updateTime.toLocaleString(),
          lat: lat,
          lng: lon,
          magnitude: props.mag !== undefined ? parseFloat(props.mag) : null,
          depth: depth,
          location: props.place || "不明",
          magtype: props.magType || "M",
          intensity: intensity,
          tsunami: props.tsunami,
          sig: props.sig, // 重要度
          // 必要に応じて他のプロパティを追加
        });
      });
    }
  } catch (error) {
    console.error("USGSデータ処理エラー:", error);
  }
  return processedData;
}

/**
 * BMKG M5.0+ 地震情報変換関数
 * @param {Object} rawData - BMKG APIから取得した生データ
 * @returns {Array} 変換された地震データオブジェクトの配列
 */
function processBmkg_M5Data(rawData) {
  const processedData = [];
  try {
    if (rawData.Infogempa && Array.isArray(rawData.Infogempa.gempa)) {
      rawData.Infogempa.gempa.forEach((item) => {
        if (!item) return;
        const coords = item.Coordinates
          ? item.Coordinates.split(",")
          : ["情報なし", "情報なし"];
        const lat =
          coords[0] !== "情報なし" ? parseFloat(coords[0].trim()) : null;
        const lng =
          coords[1] !== "情報なし" ? parseFloat(coords[1].trim()) : null;

        // parseBmkgWibTimeToUTCDate は既存のヘルパー関数と仮定
        const utcDate = parseBmkgWibTimeToUTCDate(item.Tanggal, item.Jam);

        // 震度情報の抽出（ローマ数字を抽出）
        const intensityMatch = item.Dirasakan?.match(
          /([IVX]+|I|II|III|IV|V|VI|VII|VIII|IX|X)\s/g
        );
        const intensity = intensityMatch?.[0]?.trim() || "情報なし";

        processedData.push({
          id: `bmkg_m5_${item.Tanggal}_${item.Jam}_${item.Magnitude}_${item.Lintang}_${item.Bujur}`, // 固有ID生成例
          source: "bmkg_m5",
          displayType: "eq",
          Title: "M5.0+ 地震情報",
          Tanggal: item.Tanggal,
          Jam: item.Jam,
          time: utcDate ? utcDate.toISOString() : "情報なし",
          time_full: utcDate ? utcDate.toLocaleString("ja-JP") : "情報なし",
          DateTime: item.DateTime,
          lat: lat,
          lng: lng,
          magnitude: parseFloat(item.Magnitude) || "情報なし",
          Depth: parseFloat(item.Kedalaman) || "情報なし",
          depth: parseFloat(item.Kedalaman) || "情報なし", // depth フィールドも追加
          location: `${item.Wilayah}`, // 場所
          HypoCenter: `${item.Lintang}, ${item.Bujur}`,
          tsunamiPotential: item.Potensi, // フィールド名を小文字に統一
          intensity: intensity,
          // 必要に応じて他のプロパティも追加
        });
      });
    }
  } catch (error) {
    console.error("BMKG M5 データ処理エラー:", error);
  }
  return processedData;
}

/**
 * BMKG 地震情報変換関数 (M5.0未満も含む)
 * @param {Object} rawData - BMKG APIから取得した生データ
 * @returns {Array} 変換された地震データオブジェクトの配列
 */
function processBmkgData(rawData) {
  const processedData = [];
  try {
    if (rawData.Infogempa && Array.isArray(rawData.Infogempa.gempa)) {
      rawData.Infogempa.gempa.forEach((item) => {
        if (!item) return;
        const coords = item.Coordinates
          ? item.Coordinates.split(",")
          : ["情報なし", "情報なし"];
        const lat =
          coords[0] !== "情報なし" ? parseFloat(coords[0].trim()) : null;
        const lng =
          coords[1] !== "情報なし" ? parseFloat(coords[1].trim()) : null;

        // parseBmkgWibTimeToUTCDate を使用
        const utcDate = parseBmkgWibTimeToUTCDate(item.Tanggal, item.Jam);

        // 震度情報の抽出（ローマ数字を抽出）
        const intensityMatch = item.Dirasakan?.match(
          /([IVX]+|I|II|III|IV|V|VI|VII|VIII|IX|X)\s/g
        );
        const intensity = intensityMatch?.[0]?.trim() || "情報なし";

        processedData.push({
          id: `bmkg_${item.Tanggal}_${item.Jam}_${item.Magnitude}_${item.Lintang}_${item.Bujur}`, // 固有ID生成例
          source: "bmkg",
          displayType: "eq",
          Title: "地震情報",
          Tanggal: item.Tanggal,
          Jam: item.Jam,
          time: utcDate ? utcDate.toISOString() : "情報なし",
          time_full: utcDate ? utcDate.toLocaleString("ja-JP") : "情報なし",
          DateTime: item.DateTime,
          lat: lat,
          lng: lng,
          magnitude: parseFloat(item.Magnitude) || "情報なし",
          Depth: parseFloat(item.Kedalaman) || "情報なし",
          depth: parseFloat(item.Kedalaman) || "情報なし", // depth フィールドも追加
          location: `${item.Wilayah}`, // 場所
          HypoCenter: `${item.Lintang}, ${item.Bujur}`,
          tsunamiPotential: item.Potensi,
          intensity: intensity,
          Dirasakan: item.Dirasakan, // 詳細な震度情報
          // 必要に応じて他のプロパティも追加
        });
      });
    }
  } catch (error) {
    console.error("BMKG データ処理エラー:", error);
  }
  return processedData;
}

/**
 * EMSC 地震情報変換関数
 * @param {Object} rawData - EMSC WebSocketから取得した生データ (Featureオブジェクト)
 * @returns {Object|null} 変換された地震データオブジェクト、またはnull (処理不可時)
 */
function processEmscData(rawData) {
  if (!rawData || !rawData.properties) {
    console.warn("processEmscData: 無効な生データです。", rawData);
    return null;
  }

  try {
    const props = rawData.properties;
    const date = new Date(props.time);
    // JST（UTC+9）に変換 (元コードに準拠)
    const jstDate = new Date(date.getTime() + 9 * 60 * 60 * 1000);
    // 年/月/日 時:分:秒 形式にフォーマット (元コードに準拠)
    const formattedtime = jstDate
      .toISOString()
      .replace(/T/, " ")
      .replace(/\..+Z/, "")
      .replace(/-/g, "/");

    return {
      id: rawData.id, // ✅ IDを保持
      source: "emsc", // ✅ EMSC ソースを明示
      auth: props.auth,
      displayType: "eq", // ✅ 表示タイプを明示
      // properties から必要な情報を抽出・変換
      time: formattedtime, // 発生時刻 (JST)
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
      intensity: props.intensity || "情報なし", // 最大震度
      Title: props.flynn_region || "EMSC 地震", // 表示用タイトル
      // 必要に応じて他のプロパティも追加可能
    };
  } catch (error) {
    console.error("EMSCデータ処理エラー:", error, "受信データ:", rawData);
    return null;
  }
}

/**
 * JMA GeoJSON 地震情報変換関数
 * @param {Object} rawData - JMA GeoJSONから取得した生データ (FeatureCollection)
 * @returns {Array} 変換された地震データオブジェクトの配列
 */
function processJmaHypoData(rawData) {
  const processedData = [];
  try {
    if (rawData && rawData.features && Array.isArray(rawData.features)) {
      rawData.features.forEach((feature) => {
        const props = feature.properties;
        const coords = feature.geometry.coordinates;

        if (!props || !coords) return; // 不完全なデータをスキップ

        processedData.push({
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
          depth:
            coords[2] !== null
              ? coords[2] !== undefined
                ? parseFloat(coords[2]).toFixed(1)
                : "不明"
              : "不明", // 深さ (km)
          lat: coords[1],
          lng: coords[0],
          intensity: props.intensity || "なし", // 最大震度 (あれば)
          magtype: props.mj || "", // マグニチュードの種類
          // 必要に応じて他のプロパティも追加
          // title: props.ttl|| `M${props.magnitude} 地震`, // タイトル
          // json: props.json, // 詳細JSONパス
        });
      });
    }
  } catch (error) {
    console.error("JMA Hypoデータ処理エラー:", error);
  }
  return processedData;
}

/**
 * JMA XML 地震情報変換関数
 * @param {XMLDocument} xml - JMA XMLから取得した生データ (パース済みDOM)
 * @returns {Array} 変換された地震データオブジェクトの配列
 */
function processJmaXmlData(xml) {
  const processedData = [];
  try {
    // エントリを抽出
    const entries = xml.querySelectorAll("entry");
    entries.forEach((entry) => {
      const title = entry.querySelector("title")?.textContent || "情報なし";
      const link = entry.querySelector("link")?.getAttribute("href") || "#";
      const published = entry.querySelector("published")?.textContent || "";

      // タイトルから震度情報を抽出（例: "震度3 青森県三沢市" → 震度3）
      const intensityMatch = title.match(/震度([1-7弱強弱中強])/);
      const intensity = intensityMatch ? intensityMatch[1] : "情報なし";

      // ID生成 (例: published + title のハッシュなど、一意性を高める方法が望ましい)
      const id = `jma_xml_${published}_${title.replace(/\s+/g, "_")}`.substring(
        0,
        100
      ); // 長くなりすぎないように

      processedData.push({
        id: id, // 固有ID生成
        type: "jma_xml",
        Title: title,
        link: link,
        published: published,
        intensity: intensity,
        displayType: "xml",
        // 必要に応じて他のXMLフィールドを抽出・変換
      });
    });
  } catch (error) {
    console.error("JMA XMLデータ処理エラー:", error);
  }
  return processedData;
}

/**
 * CENC 地震情報変換関数 (WebSocket JSON)
 * @param {Object} rawData - CENC WebSocketから取得した生データ
 * @returns {Object|null} 変換された地震データオブジェクト、またはnull (処理不可時)
 */
function processCencData(rawData) {
  if (!rawData || !rawData.id) {
    // 基本的なIDチェック
    console.warn("processCencData: 無効な生データです。", rawData);
    return null;
  }

  try {
    // rawData.time がどのような形式かによる (例: "2023-10-27T01:23:45Z" などと仮定)
    const utcDate = new Date(rawData.time);
    const formattedTime = !isNaN(utcDate.getTime())
      ? utcDate.toISOString()
      : "情報なし";

    return {
      id: rawData.id,
      source: "cenc",
      displayType: "eq",
      time: formattedTime,
      time_full: !isNaN(utcDate.getTime())
        ? utcDate.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })
        : "信息缺失", // 中国標準時
      lat: rawData.latitude !== undefined ? parseFloat(rawData.latitude) : null,
      lng:
        rawData.longitude !== undefined ? parseFloat(rawData.longitude) : null,
      magnitude:
        rawData.magnitude !== undefined
          ? parseFloat(rawData.magnitude).toFixed(1)
          : "信息缺失",
      depth:
        rawData.depth !== undefined
          ? parseFloat(rawData.depth).toFixed(1)
          : "信息缺失",
      location: rawData.location || "信息缺失",
      // 必要に応じて他のプロパティを追加
    };
  } catch (error) {
    console.error("CENCデータ処理エラー:", error, "受信データ:", rawData);
    return null;
  }
}

/**
 * CWA (中央気象署) 地震情報変換関数 (WebSocket JSON)
 * @param {Object} rawData - CWA WebSocketから取得した生データ
 * @returns {Object|null} 変換された地震データオブジェクト、またはnull (処理不可時)
 */
function processCwaData(rawData) {
  if (!rawData || !rawData.id) {
    // 基本的なIDチェック
    console.warn("processCwaData: 無効な生データです。", rawData);
    return null;
  }

  try {
    // rawData.time がどのような形式かによる (例: "2023-10-27T01:23:45Z" などと仮定)
    const utcDate = new Date(rawData.time);
    const formattedTime = !isNaN(utcDate.getTime())
      ? utcDate.toISOString()
      : "資訊缺失";

    return {
      id: rawData.id,
      source: "cwa",
      displayType: "eq",
      time: formattedTime,
      time_full: !isNaN(utcDate.getTime())
        ? utcDate.toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })
        : "資訊缺失", // 台北時間
      lat: rawData.latitude !== undefined ? parseFloat(rawData.latitude) : null,
      lng:
        rawData.longitude !== undefined ? parseFloat(rawData.longitude) : null,
      magnitude:
        rawData.magnitude !== undefined
          ? parseFloat(rawData.magnitude).toFixed(1)
          : "資訊缺失",
      depth:
        rawData.depth !== undefined
          ? parseFloat(rawData.depth).toFixed(1)
          : "資訊缺失",
      location: rawData.location || "資訊缺失",
      // 必要に応じて他のプロパティを追加
    };
  } catch (error) {
    console.error("CWAデータ処理エラー:", error, "受信データ:", rawData);
    return null;
  }
}

/**
 * CWA Tiny 地震情報変換関数 (WebSocket JSON)
 * @param {Object} rawData - CWA Tiny WebSocketから取得した生データ
 * @returns {Object|null} 変換された地震データオブジェクト、またはnull (処理不可時)
 */
function processCwaTinyData(rawData) {
  // CWA Tiny のデータ構造が CWA と大きく異なる場合、別の処理が必要
  // ここでは processCwaData と同様の構造を仮定しますが、実際のデータ構造に合わせて調整してください。
  if (!rawData || !rawData.id) {
    console.warn("processCwaTinyData: 無効な生データです。", rawData);
    return null;
  }

  try {
    const utcDate = new Date(rawData.time);
    const formattedTime = !isNaN(utcDate.getTime())
      ? utcDate.toISOString()
      : "資訊缺失";

    return {
      id: rawData.id,
      source: "cwa_tiny",
      displayType: "eq",
      time: formattedTime,
      time_full: !isNaN(utcDate.getTime())
        ? utcDate.toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })
        : "資訊缺失",
      lat: rawData.latitude !== undefined ? parseFloat(rawData.latitude) : null,
      lng:
        rawData.longitude !== undefined ? parseFloat(rawData.longitude) : null,
      magnitude:
        rawData.magnitude !== undefined
          ? parseFloat(rawData.magnitude).toFixed(1)
          : "資訊缺失",
      depth:
        rawData.depth !== undefined
          ? parseFloat(rawData.depth).toFixed(1)
          : "資訊缺失",
      location: rawData.location || "資訊缺失",
      // 必要に応じて他のプロパティを追加
    };
  } catch (error) {
    console.error("CWA Tinyデータ処理エラー:", error, "受信データ:", rawData);
    return null;
  }
}

// --- モジュールエクスポート ---
// 他のスクリプトからこれらの関数を使用できるようにします。
// (モジュールシステムを使っている場合は export { ... };)
// または、グローバル変数として (現状のコード構造に合わせる場合)
window.dataProcessor = {
  // ヘルパー関数
  getIntensityInteger,
  getIntersityLabel,
  getIntersityLabel_j,
  parseLocalTimeToUTCDate,
  parseBmkgWibTimeToUTCDate,

  // データ処理関数
  processUsgsData,
  processBmkg_M5Data,
  processBmkgData,
  processEmscData,
  processJmaHypoData,
  processJmaXmlData,
  processCencData,
  processCwaData,
  processCwaTinyData,
  // 必要に応じて他のプロセッサーも追加
};

console.log("DataProcessor initialized.");
