// このファイルは、Google Fit API/Gemini APIへの通信ロジックを管理します。

// data-processor.jsで定義されたwindow.stateを使用

// --- Constants ---
const DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/fitness/v1/rest"];
// READ/WRITE両方の権限とHEART_RATEの読み取り権限
const SCOPES = "https://www.googleapis.com/auth/fitness.activity.read https://www.googleapis.com/auth/fitness.activity.write https://www.googleapis.com/auth/fitness.body.read"; 
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent`;

// --- GAPI Loading and Initialization --- 

/**
 * GAPIクライアントライブラリのロードを開始し、ロード完了時にUIを更新します。
 */
function initGapiLoader() {
    // window.onloadを待ってからGAPIをロード（GAPIライブラリの推奨）
    window.addEventListener('load', () => {
        // gapi.load()のコールバック内で直接処理を実行しており、window.gapiLoaded関数は不要です
        gapi.load('client:auth2', () => {
            // GAPIライブラリがロード完了
            window.state.isGapiLoaded = true;
            
            // Client IDがあれば、GAPIクライアントの初期化を試みる
            if (window.state.googleClientId) {
                window.initGapiClient(); 
            } else {
                 // Client IDがない場合もUIを更新し、ボタンを「IDを入力してください」状態にする
                 window.updateUI(); 
            }
        });
    });
}
window.initGapiLoader = initGapiLoader;


/**
 * GAPIクライアントの初期化を実行する（Client IDが設定されている場合のみ）
 */
function initGapiClient() {
    const state = window.state;
    if (!state.googleClientId || !state.isGapiLoaded) {
        state.authError = "Google APIライブラリの準備ができていないか、Client IDがありません。";
        window.updateUI();
        return;
    }

    gapi.client.init({
        apiKey: 'DUMMY', 
        clientId: state.googleClientId,
        discoveryDocs: DISCOVERY_DOCS,
        scope: SCOPES,
    }).then(() => {
        // 初期化成功後、サインイン状態を監視
        const authInstance = gapi.auth2.getAuthInstance();
        authInstance.isSignedIn.listen(updateSigninStatus);
        updateSigninStatus(authInstance.isSignedIn.get());
        state.authError = null;
        window.updateUI();
    }).catch(error => {
        console.error("GAPI Client Init Error:", error);
        state.authError = "Google APIクライアントの初期化に失敗しました。Client IDまたはリダイレクトURIの設定を確認してください。";
        window.updateUI();
    });
}
window.initGapiClient = initGapiClient;


function updateSigninStatus(isSignedIn) {
    window.state.isSignedIn = isSignedIn;
    window.state.authError = null;
    window.updateUI();
}


function handleAuthClick() {
    if (!window.state.googleClientId) {
        console.error("Google Fit Client IDを入力してください。"); 
        return;
    }

    if (gapi.auth2.getAuthInstance().isSignedIn.get()) {
        gapi.auth2.getAuthInstance().signOut();
    } else {
        // サインインポップアップを表示
        gapi.auth2.getAuthInstance().signIn(); 
    }
}
window.handleAuthClick = handleAuthClick;


// --- Google Fit Handlers (詳細データ取得と集計) ---

/**
 * Fitのデータソースから集計値を取得
 */
async function aggregateFitData(startTimeMs, endTimeMs, dataType, dataSourceId, bucketDurationMs) {
    const requestBody = {
        aggregateBy: [{ 
            dataType: dataType,
            dataSourceId: dataSourceId 
        }],
        // NOTE: セッション期間全体を集計するため、bucketDurationMillisを期間全体に設定
        bucketByTime: { durationMillis: bucketDurationMs },
        startTimeMillis: startTimeMs,
        endTimeMillis: endTimeMs,
    };

    // NOTE: GAPIクライアントが初期化されていない場合は処理を中断
    if (!gapi.client.fitness) return []; 

    try {
        const response = await gapi.client.fitness.users.dataset.aggregate({
            userId: 'me',
            resource: requestBody
        });
        return response.result && response.result.bucket ? response.result.bucket : [];
    } catch (e) {
        console.error(`Error aggregating data for ${dataType}:`, e);
        return [];
    }
}


async function handleFetchClick() {
    const state = window.state;
    if (!state.isSignedIn) return;

    state.loading = true;
    state.sessions = [];
    state.summaryData = null;
    state.analysis = null;
    window.updateUI();

    const now = new Date();
    // 過去30日間 + 本日分を含める
    const startTimeMillis = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30).getTime();
    const endTimeMillis = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - 1; 

    try {
        // 1. セッションリストを取得 (過去30日間)
        const sessionResponse = await gapi.client.fitness.users.sessions.list({
            userId: 'me',
            startTime: startTimeMillis,
            endTime: endTimeMillis,
            includeDeleted: false,
        });

        const rawSessions = sessionResponse.result.session || [];
        
        // 2. 各セッションの活動期間中の詳細データを取得し、集計する
        const sessionsWithDetails = await Promise.all(rawSessions
            .filter(s => s.activityType !== 0) // 活動タイプ0 (不明)を除外
            .map(async s => {
                const sessionStart = parseInt(s.startTimeMillis);
                const sessionEnd = parseInt(s.endTimeMillis);
                const durationMs = sessionEnd - sessionStart;
                const durationMinutes = durationMs / (1000 * 60);

                // 各指標のデータ取得 (セッション期間中の合計/平均)
                const aggregates = await Promise.all([
                    // 歩数 
                    aggregateFitData(sessionStart, sessionEnd, "com.google.step_count.delta", "raw:com.google.step_count.delta:*:*", durationMs),
                    // 距離
                    aggregateFitData(sessionStart, sessionEnd, "com.google.distance.delta", "raw:com.google.distance.delta:*:*", durationMs),
                    // カロリー
                    aggregateFitData(sessionStart, sessionEnd, "com.google.calories.expended", "raw:com.google.calories.expended:*:*", durationMs),
                    // 心拍数 (平均値を取得するため、ここでは1分バケットで取得し、processor側で平均を計算)
                    aggregateFitData(sessionStart, sessionEnd, "com.google.heart_rate.bpm", "raw:com.google.heart_rate.bpm:*:*", 1000 * 60)
                ]);

                // データの抽出ヘルパー関数
                const extractValue = (buckets, type) => {
                    let totalValue = 0;
                    let count = 0;

                    buckets.forEach(bucket => {
                        bucket.dataset.forEach(dataset => {
                            dataset.point.forEach(point => {
                                // Fit APIではintValまたはfpValで値が返る
                                const value = point.value[0]?.fpVal || point.value[0]?.intVal || 0;
                                totalValue += value;
                                count++;
                            });
                        });
                    });

                    // 心拍数の場合は、合計をカウントで割って平均を出す
                    if (type === 'heartRate' && count > 0) return totalValue / count;
                    return totalValue;
                };

                // NOTE: 心拍数はセッション期間中の平均値を取得
                const avgHeartRate = extractValue(aggregates[3], 'heartRate');
                
                return {
                    startTime: sessionStart,
                    endTime: sessionEnd,
                    durationMinutes: durationMinutes,
                    steps: Math.round(extractValue(aggregates[0], 'steps')),
                    distance: extractValue(aggregates[1], 'distance'), // meter
                    calories: extractValue(aggregates[2], 'calories'), // kcal
                    avgHeartRate: avgHeartRate, // bpm
                };
            })
        );
        
        state.sessions = sessionsWithDetails;
        state.summaryData = window.calculateSummary(); // 集計実行
        state.authError = null;

    } catch (error) {
        console.error("Fit Data Fetch Error:", error);
        state.authError = "データ取得中にエラーが発生しました。権限とClient IDを確認してください。";
    } finally {
        state.loading = false;
        window.updateUI();
    }
}
window.handleFetchClick = handleFetchClick;


/**
 * 計測した活動時間をGoogle Fitにセッションとして書き込む
 */
async function writeActivityToFit(startTimeMs, endTimeMs) {
    const state = window.state;
    if (!state.isSignedIn) {
        console.error("Google Fitにサインインしてから記録してください。");
        return false;
    }
    
    const activityType = 7; // ウォーキング
    const sessionId = `activity-tracker-${startTimeMs}-${endTimeMs}`;

    const requestBody = {
        id: sessionId,
        name: `計測活動 (${new Date(startTimeMs).toLocaleDateString()})`,
        description: `活動時間: ${window.formatTime(endTimeMs - startTimeMs)}`,
        startTimeMillis: startTimeMs,
        endTimeMillis: endTimeMs,
        activityType: activityType,
    };

    try {
        const response = await gapi.client.fitness.users.sessions.update({
            userId: 'me',
            sessionId: sessionId,
            resource: requestBody,
        });

        if (response.status === 200) {
             // 記録成功後、最新データを再取得してUIを更新
             await handleFetchClick(); 
             return true;
        } else {
            throw new Error(`Fit API failed with status: ${response.status}`);
        }

    } catch (error) {
        console.error("Fit Data Write Error:", error);
        console.error(`活動の記録に失敗しました: ${error.message}`);
        return false;
    }
}
window.writeActivityToFit = writeActivityToFit;


// --- Gemini AI Analysis --- (指数関数的バックオフを追加)

async function fetchWithExponentialBackoff(fetchFunc, maxRetries = 5, delay = 1000) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fetchFunc();
        } catch (error) {
            // ログは出力しないが、コンソールで確認できるようにしておく
            if (i === maxRetries - 1) throw error; // 最後の試行で失敗したらスロー
            // 指数関数的な遅延 + ランダムな揺らぎ (ジッター)
            await new Promise(resolve => setTimeout(resolve, delay * (2 ** i) + Math.random() * 1000));
        }
    }
}

async function handleAnalyzeClick() {
    const state = window.state;
    if (!state.geminiApiKey || !state.summaryData || state.isProcessing) return;

    state.isProcessing = true;
    state.analysis = { title: "AI詳細アドバイス", content: `<div class="flex items-center justify-center py-8">
        <span class="animate-spin h-8 w-8 mr-3 border-4 border-blue-600 border-solid rounded-full spinner border-r-transparent"></span>
        <span class="text-blue-600 font-semibold">Geminiがデータを解析し、アドバイスを作成しています...</span>
    </div>` };
    window.updateUI();

    const prompt = window.createAnalysisPrompt(state.summaryData, state.dailyGoalMinutes); 

    try {
        const fetchGemini = async () => {
             const response = await fetch(GEMINI_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Goog-Api-Key': state.geminiApiKey,
                },
                body: JSON.stringify({
                    contents: [{ role: "user", parts: [{ text: prompt }] }],
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                // 429 (Rate Limit)または5xxエラーの場合、再試行のためにスロー
                if (response.status === 429 || response.status >= 500) {
                     throw new Error(`Transient API Error: ${response.status}`);
                }
                // それ以外のエラーは即座に失敗
                throw new Error(`Gemini API Error: ${response.status} - ${errorData.error ? errorData.error.message : response.statusText}`);
            }
            return response;
        };

        const response = await fetchWithExponentialBackoff(fetchGemini);
        const data = await response.json();
        
        // データの妥当性チェック
        if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
             throw new Error("Geminiからの応答データが不完全です。");
        }
        
        const analysisText = data.candidates[0].content.parts[0].text;
        
        const { title, content } = window.parseAndFormatAnalysis(analysisText); 
        
        state.analysis.title = title;
        state.analysis.content = content;
        state.authError = null;

    } catch (error) {
        console.error("Gemini Analysis Error:", error);
        state.authError = `AI解析エラー: ${error.message}. APIキーが正しいか確認してください。`;
        state.analysis = { title: "AI解析エラー", content: `<p class="text-red-600 font-mono text-sm">${error.message}</p>` };
    } finally {
        state.isProcessing = false;
        window.updateUI();
    }
}
window.handleAnalyzeClick = handleAnalyzeClick;