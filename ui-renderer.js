// このファイルは、DOM操作、UIのレンダリング、イベントリスナーの設定を管理します。

// data-processor.jsで定義されたwindow.stateを使用
const state = window.state;
// window.$domはここで初期化時に要素を取得します

// --- Stopwatch Logic ---
function handleTimerClick() {
    if (state.isTiming) {
        stopStopwatch();
    } else {
        startStopwatch();
    }
    window.updateUI();
}

function startStopwatch() {
    state.stopwatchStartTime = Date.now();
    state.isTiming = true;
    
    if (state.stopwatchIntervalId) clearInterval(state.stopwatchIntervalId);
    
    state.stopwatchIntervalId = setInterval(() => {
        updateTimerDisplay();
    }, 1000);
}

function updateTimerDisplay() {
    if (state.isTiming && state.stopwatchStartTime) {
        const elapsedTime = Date.now() - state.stopwatchStartTime;
        window.$dom.$timerDisplay.textContent = window.formatTime(elapsedTime);
    } else {
        window.$dom.$timerDisplay.textContent = "00:00:00";
    }
}

async function stopStopwatch() {
    clearInterval(state.stopwatchIntervalId);
    
    const endTimeMs = Date.now();
    const startTimeMs = state.stopwatchStartTime;
    const durationMinutes = (endTimeMs - startTimeMs) / (1000 * 60);

    if (durationMinutes < 0.1) {
        // NOTE: カスタムモーダルなどに変更を推奨
        console.error("記録時間が短すぎます。");
    } else {
        window.$dom.$timerStatus.textContent = "Google Fitに記録中...";
        window.$dom.$timerButton.disabled = true;
        
        // Fitへの記録処理
        await window.writeActivityToFit(startTimeMs, endTimeMs);
    }
    
    state.isTiming = false;
    state.stopwatchStartTime = null;
    state.stopwatchIntervalId = null;
    window.updateUI();
}


// --- UI Rendering Functions ---

function updateUI() {
    // DOM要素が初期化されているか確認
    const $dom = window.$dom;
    if (Object.keys($dom).length === 0) return; // 初期化前はスキップ

    // 1. Error Display
    if (state.authError) {
        $dom.$errorDisplay.textContent = state.authError;
        $dom.$errorDisplay.classList.remove('hidden');
    } else {
        $dom.$errorDisplay.classList.add('hidden');
    }

    // 2. Auth Button
    const hasClientId = state.googleClientId.length > 0;
    
    // GAPIが未ロード OR Client IDがない場合はボタンを無効化
    $dom.$authButton.disabled = !state.isGapiLoaded || !hasClientId; 

    if (!state.isGapiLoaded) {
        $dom.$authButton.textContent = "ライブラリ読み込み中...";
        $dom.$authButton.className = 'px-4 py-2 font-semibold text-white rounded-lg transition duration-300 bg-gray-400 cursor-wait';
    } else if (!hasClientId) {
        $dom.$authButton.textContent = "IDを入力してください";
        $dom.$authButton.className = 'px-4 py-2 font-semibold text-white rounded-lg transition duration-300 bg-gray-400';
    } else if (state.isSignedIn) {
        $dom.$authButton.textContent = "Google Fitからログアウト";
        $dom.$authButton.className = 'px-4 py-2 font-semibold text-white rounded-lg transition duration-300 bg-red-600 hover:bg-red-700 shadow-md';
    } else {
        $dom.$authButton.textContent = "Google Fitにサインイン (WRITE権限)";
        $dom.$authButton.className = 'px-4 py-2 font-semibold text-white rounded-lg transition duration-300 bg-green-600 hover:bg-green-700 shadow-md';
    }

    // 3. Fetch Button
    $dom.$fetchButton.disabled = !state.isSignedIn || state.loading;
    $dom.$fetchButton.className = `flex-1 px-6 py-3 font-semibold text-white rounded-lg transition duration-300 ${state.isSignedIn && !state.loading ? 'bg-indigo-600 hover:bg-indigo-700 shadow-lg' : 'bg-gray-400 cursor-not-allowed'}`;
    if (state.loading) {
        $dom.$fetchButton.innerHTML = `<span class="animate-spin h-5 w-5 mr-3 border-4 border-white border-solid rounded-full spinner border-r-transparent"></span> データ取得中...`;
    } else {
        $dom.$fetchButton.textContent = "Fitデータ集計 (過去30日間)";
    }

    // 4. Timer Button (計測操作)
    $dom.$timerButton.disabled = !state.isSignedIn || state.loading || state.isProcessing;
    if (!state.isSignedIn) {
        $dom.$timerButton.className = 'px-8 py-4 font-extrabold text-lg text-white rounded-xl transition duration-300 bg-gray-400 cursor-not-allowed';
        $dom.$timerStatus.textContent = "認証後、「今から測定」が有効になります。";
    } else if (state.isTiming) {
         $dom.$timerButton.className = 'px-8 py-4 font-extrabold text-lg text-white rounded-xl transition duration-300 bg-red-600 hover:bg-red-700 shadow-lg';
         $dom.$timerButton.textContent = "終了";
         $dom.$timerStatus.textContent = "測定中。終了ボタンでFitに記録します。";
    } else {
        $dom.$timerButton.className = 'px-8 py-4 font-extrabold text-lg text-white rounded-xl transition duration-300 bg-green-600 hover:bg-green-700 shadow-lg';
        $dom.$timerButton.textContent = "今から測定";
        $dom.$timerStatus.textContent = "「今から測定」でストップウォッチがスタートします。";
    }

    // 5. Summary & Detail Metrics
    if (state.summaryData) {
        $dom.$summarySection.classList.remove('hidden');
        $dom.$detailMetricsSection.classList.remove('hidden');
        renderSummaryMetrics(state.summaryData.daily, state.summaryData.weekly, state.summaryData.monthly, state.dailyGoalMinutes);
        renderDetailMetrics(state.summaryData.daily);
        $dom.$analysisControlSection.classList.remove('hidden');
    } else {
        $dom.$summarySection.classList.add('hidden');
        $dom.$detailMetricsSection.classList.add('hidden');
        $dom.$analysisControlSection.classList.add('hidden');
    }
    
    // 6. Analyze Button
    const hasApiKey = state.geminiApiKey.length > 0;
    $dom.$analyzeButton.disabled = !hasApiKey || !state.summaryData || state.isProcessing;
    $dom.$analyzeButton.className = `w-full px-6 py-3 font-semibold text-white rounded-lg transition duration-300 ${!$dom.$analyzeButton.disabled ? 'bg-blue-600 hover:bg-blue-700 shadow-lg' : 'bg-gray-400 cursor-not-allowed'} flex items-center justify-center`;
    if (state.isProcessing) {
        $dom.$analyzeButton.innerHTML = `<span class="animate-spin h-5 w-5 mr-3 border-4 border-white border-solid rounded-full spinner border-r-transparent"></span> Gemini解析中...`;
    } else {
        $dom.$analyzeButton.textContent = hasApiKey ? "Geminiでアドバイスを取得" : "Gemini API Keyを入力してください";
    }

    // 7. Analysis Result Section
    if (state.analysis) {
        $dom.$analysisResultSection.classList.remove('hidden');
        $dom.$analysisTitle.textContent = state.analysis.title || "AI詳細アドバイス";
        $dom.$analysisContent.innerHTML = state.analysis.content;
    } else {
        $dom.$analysisResultSection.classList.add('hidden');
    }
}
window.updateUI = updateUI;


// --- Helper Renderers ---

function renderSummaryMetrics(daily, weekly, monthly, goal) {
    const $dom = window.$dom;
    const dailyTotal = daily.minutes.toFixed(0);
    const weeklyTotal = weekly.minutes.toFixed(0);
    const monthlyTotal = monthly.minutes.toFixed(0);
    
    // 日次合計
    $dom.$dailyTotal.innerHTML = `${dailyTotal}<span class="text-sm font-semibold text-gray-500 ml-1">分</span>`;
    $dom.$dailyTotal.parentElement.querySelector('p:first-child').textContent = `本日 (${dailyTotal >= goal ? '目標達成!' : '目標まであと ' + Math.max(0, goal - dailyTotal).toFixed(0) + '分'})`;
    
    // 週間・月間合計
    $dom.$weeklyTotal.innerHTML = `${weeklyTotal}<span class="text-sm font-semibold text-gray-500 ml-1">分</span>`;
    $dom.$monthlyTotal.innerHTML = `${monthlyTotal}<span class="text-sm font-semibold text-gray-500 ml-1">分</span>`;
}

function renderDetailMetrics(dailyData) {
    const $dom = window.$dom;
    $dom.$detailMetrics.innerHTML = '';
    
    const metricsList = [
        { title: "歩数", value: dailyData.steps.toLocaleString(), unit: "歩" },
        { title: "距離", value: (dailyData.distance / 1000).toFixed(2), unit: "km" },
        { title: "カロリー", value: dailyData.calories.toFixed(0), unit: "kcal" },
        { title: "平均時速", value: dailyData.avgSpeed.toFixed(1), unit: "km/h" },
        { title: "平均心拍数", value: dailyData.avgHeartRate.toFixed(0), unit: "bpm" },
        { title: "活動時間", value: dailyData.minutes.toFixed(1), unit: "分" },
    ];

    metricsList.forEach(m => {
        const card = `
            <div class="bg-white p-3 rounded-lg shadow-md border border-gray-100 text-left">
                <p class="text-xs font-medium text-gray-500">${m.title} (本日)</p>
                <p class="text-xl font-bold text-gray-900 mt-1">
                    ${m.value}<span class="text-sm font-semibold text-gray-500 ml-1">${m.unit}</span>
                </p>
            </div>
        `;
        $dom.$detailMetrics.insertAdjacentHTML('beforeend', card);
    });
}

// Markdown to HTML変換ロジック
function parseAndFormatAnalysis(markdown) {
    let html = markdown
        .replace(/^###\s*(.*)$/gm, '<h4>$1</h4>')
        .replace(/^##\s*(.*)$/gm, '<h3>$1</h3>')
        .replace(/^#\s*(.*)$/gm, '<h2>$1</h2>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/^- (.*)$/gm, '<li>$1</li>')
        .replace(/(\n<li>.*<\/li>)+/gs, '<ul class="list-disc ml-5 space-y-1 my-2">$1</ul>')
        .replace(/(\n\n)/g, '<p class="mt-4">')
        .replace(/\n(?!<p|h|u|l)/g, ' ') 
        .replace(/<p class="mt-4">/g, '</p><p class="mt-4">') 
        .trim();
    
    if (!html.startsWith('<') && html.length > 0) {
         html = '<p class="mt-4">' + html + '</p>';
    }
    
    html = html.replace(/<p class="mt-4"><\/p>/g, '');
    
    return {
        title: html.match(/<h2>(.*?)<\/h2>/)?.[1] || "AI詳細アドバイス",
        content: html.replace(/<h2>(.*?)<\/h2>/, '')
    };
}
window.parseAndFormatAnalysis = parseAndFormatAnalysis;


// --- Event Handlers & Initialization ---

function handleInput(e) {
    if (e.target.id === 'googleClientId') {
        window.state.googleClientId = e.target.value;
        // Client IDが変わった場合、GAPIの初期化を試みる
        if (window.state.googleClientId && window.state.isGapiLoaded) {
            window.initGapiClient();
        }
    } else if (e.target.id === 'geminiApiKey') {
        window.state.geminiApiKey = e.target.value;
    } else if (e.target.id === 'dailyGoalMinutes') {
        window.state.dailyGoalMinutes = parseInt(e.target.value) || 0;
        if (state.summaryData) renderSummaryMetrics(state.summaryData.daily, state.summaryData.weekly, state.summaryData.monthly, state.dailyGoalMinutes);
    }
    
    window.saveState();
    updateUI();
}

function initializeApp() {
    
    // =================================================================
    // 【重要修正箇所】DOM要素を確実に取得する
    // =================================================================
    const $id = window.$id;
    window.$dom = {
        $googleClientId: $id('googleClientId'),
        $geminiApiKey: $id('geminiApiKey'),
        $dailyGoalMinutes: $id('dailyGoalMinutes'),
        $authButton: $id('auth-button'),
        $fetchButton: $id('fetch-button'),
        $analyzeButton: $id('analyze-button'),
        $errorDisplay: $id('error-display'),
        
        // Stopwatch elements
        $timerButton: $id('timer-button'),
        $timerDisplay: $id('timer-display'),
        $timerStatus: $id('timer-status'),
        
        // Summary elements
        $summarySection: $id('summary-section'),
        $dailyTotal: $id('daily-total'),
        $weeklyTotal: $id('weekly-total'),
        $monthlyTotal: $id('monthly-total'),

        // Detail Metrics
        $detailMetricsSection: $id('detail-metrics-section'),
        $detailMetrics: $id('detail-metrics'),
        
        // Analysis elements
        $analysisControlSection: $id('analysis-control-section'),
        $analysisResultSection: $id('analysis-result-section'),
        $analysisTitle: $id('analysis-title'),
        $analysisContent: $id('analysis-content'),
    };

    // 1. Load Data
    window.loadState();
    
    // 2. Set Listeners
    // DOM要素が確実に存在するため、安全にイベントリスナーを設定
    window.$dom.$googleClientId.addEventListener('input', handleInput);
    window.$dom.$geminiApiKey.addEventListener('input', handleInput);
    window.$dom.$dailyGoalMinutes.addEventListener('input', handleInput);
    window.$dom.$authButton.addEventListener('click', window.handleAuthClick);
    window.$dom.$fetchButton.addEventListener('click', window.handleFetchClick);
    window.$dom.$timerButton.addEventListener('click', handleTimerClick);
    window.$dom.$analyzeButton.addEventListener('click', window.handleAnalyzeClick);

    
    // 3. Initial UI Update
    updateUI(); 
    
    // 4. Load GAPI and Auth2 libraries
    window.addEventListener('load', () => {
        gapi.load('client:auth2', () => {
            // GAPIライブラリがロード完了
            state.isGapiLoaded = true;
            
            // Client IDがあれば、GAPIクライアントの初期化を試みる
            if (state.googleClientId) {
                window.initGapiClient(); 
            } else {
                 // Client IDがない場合もUIを更新し、ボタンを「IDを入力してください」状態にする
                 updateUI(); 
            }
        });
    });
}
document.addEventListener('DOMContentLoaded', initializeApp);