// このファイルは、DOM操作、UIのレンダリング、イベントリスナーの設定を管理します。

const state = window.state;
const $dom = window.$dom;


// --- Stopwatch Logic --- 
// ストップウォッチ機能のロジック

function handleTimerClick() {
    if (state.isTiming) {
        stopStopwatch();
    } else {
        startStopwatch();
    }
    window.updateUI();
}

function startStopwatch() { 
    state.isTiming = true;
    state.stopwatchStartTime = Date.now();
    state.stopwatchIntervalId = setInterval(updateTimerDisplay, 1000);
}

function updateTimerDisplay() {
    const elapsed = Date.now() - state.stopwatchStartTime;
    $dom.$timerDisplay.textContent = window.formatTime(elapsed);
}

async function stopStopwatch() {
    clearInterval(state.stopwatchIntervalId);

    const endTimeMs = Date.now();
    const startTimeMs = state.stopwatchStartTime;
    const durationMinutes = (endTimeMs - startTimeMs) / (1000 * 60);

    if (durationMinutes < 0.1) {
        alert("記録時間が短すぎます。");
    } else {
        $dom.$timerStatus.textContent = "Google Fitに記録中...";
        $dom.$timerButton.disabled = true;

        // Fit APIに書き込み
        const success = await window.writeActivityToFit(startTimeMs, endTimeMs);

        if (success) {
            alert(`活動を終了し、Google Fitに記録しました！\n記録時間: ${durationMinutes.toFixed(1)}分`);
        }
    }

    state.isTiming = false;
    state.stopwatchStartTime = null;
    state.stopwatchIntervalId = null;
    window.updateUI();
}


// --- UI Rendering Functions ---

function updateUI() {
    // 1. Error & Auth
    if (state.authError) {
        $dom.$errorDisplay.textContent = state.authError;
        $dom.$errorDisplay.classList.remove('hidden');
    } else {
        $dom.$errorDisplay.classList.add('hidden');
    }

    // Auth Buttonの表示ロジック
    const isAuthButtonEnabled = (state.googleClientId.length > 0 && !state.isSignedIn);
    $dom.$authButton.disabled = !isAuthButtonEnabled;
    $dom.$authButton.textContent = state.isSignedIn ? "Google Fitからサインアウト" : "Google Fitに認証";
    // Client IDが入力され、未認証の場合にオレンジ色でボタンを有効化
    $dom.$authButton.className = `w-full px-6 py-3 font-semibold text-white rounded-lg transition duration-300 ${isAuthButtonEnabled ? 'bg-orange-500 hover:bg-orange-600 shadow-lg' : 'bg-gray-400 cursor-not-allowed'}`;

    $dom.$fetchButton.disabled = !state.isSignedIn || state.loading;
    $dom.$fetchButton.className = `flex-1 px-6 py-3 font-semibold text-white rounded-lg transition duration-300 ${state.isSignedIn && !state.loading ? 'bg-indigo-600 hover:bg-indigo-700 shadow-lg' : 'bg-gray-400 cursor-not-allowed'}`;
    if (state.loading) {
        $dom.$fetchButton.innerHTML = `<span class="animate-spin h-5 w-5 mr-3 border-4 border-white border-solid rounded-full spinner border-r-transparent"></span> データ取得中...`;
    } else {
        $dom.$fetchButton.textContent = "Fitデータ集計 (過去30日間)";
    }

    // 2. Timer Button
    $dom.$timerButton.disabled = !state.isSignedIn || state.loading || state.isProcessing;
    if (!state.isSignedIn) {
        $dom.$timerButton.className = 'px-8 py-4 font-extrabold text-lg text-white rounded-xl transition duration-300 bg-gray-400 cursor-not-allowed';
        $dom.$timerStatus.textContent = "認証後、「今から測定」が有効になります。";
    } else if (state.isTiming) {
         $dom.$timerButton.className = 'px-8 py-4 font-extrabold text-lg text-white rounded-xl transition duration-300 bg-red-600 hover:bg-red-700 shadow-lg';
         $dom.$timerButton.textContent = "終了";
         updateTimerDisplay();
         $dom.$timerStatus.textContent = "測定中。終了ボタンでFitに記録します。";
    } else {
        $dom.$timerButton.className = 'px-8 py-4 font-extrabold text-lg text-white rounded-xl transition duration-300 bg-green-600 hover:bg-green-700 shadow-lg';
        $dom.$timerButton.textContent = "今から測定";
        $dom.$timerStatus.textContent = "「今から測定」でストップウォッチがスタートします。";
    }

    // 3. Summary & Detail Metrics
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

    // 4. Analyze Button
    const hasApiKey = state.geminiApiKey.length > 0;
    $dom.$analyzeButton.disabled = !hasApiKey || !state.summaryData || state.isProcessing;
    $dom.$analyzeButton.className = `w-full px-6 py-3 font-semibold text-white rounded-lg transition duration-300 ${!$dom.$analyzeButton.disabled ? 'bg-blue-600 hover:bg-blue-700 shadow-lg' : 'bg-gray-400 cursor-not-allowed'} flex items-center justify-center`;
    if (state.isProcessing) {
        $dom.$analyzeButton.innerHTML = `<span class="animate-spin h-5 w-5 mr-3 border-4 border-white border-solid rounded-full spinner border-r-transparent"></span> Gemini解析中...`;
    } else {
        $dom.$analyzeButton.textContent = hasApiKey ? "Geminiでアドバイスを取得" : "Gemini API Keyを入力してください";
    }

    // 5. Analysis Result Section
    if (state.analysis) {
        $dom.$analysisResultSection.classList.remove('hidden');
        $dom.$analysisTitle.textContent = state.analysis.title || "AI詳細アドバイス";
        $dom.$analysisContent.innerHTML = state.analysis.content;
    } else {
        $dom.$analysisResultSection.classList.add('hidden');
    }
}
window.updateUI = updateUI;


function renderSummaryMetrics(daily, weekly, monthly, goal) {
    const dailyTotal = daily.minutes.toFixed(0);
    const weeklyTotal = weekly.minutes.toFixed(0);
    const monthlyTotal = monthly.minutes.toFixed(0);

    // 日次合計
    $dom.$dailyTotal.innerHTML = `${dailyTotal}<span class="text-sm font-semibold text-gray-500 ml-1">分</span>`;
    $dom.$dailyTotal.parentElement.querySelector('p:first-child').textContent = `本日 (${dailyTotal >= goal ? '目標達成!' : '目標まであと ' + (goal - dailyTotal).toFixed(0) + '分'})`;

    // 週間・月間合計
    $dom.$weeklyTotal.innerHTML = `${weeklyTotal}<span class="text-sm font-semibold text-gray-500 ml-1">分</span>`;
    $dom.$monthlyTotal.innerHTML = `${monthlyTotal}<span class="text-sm font-semibold text-gray-500 ml-1">分</span>`;
}

function renderDetailMetrics(dailyData) {
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

// MarkdownをHTMLに変換するロジック (Geminiアドバイス表示用)
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
    } else if (e.target.id === 'geminiApiKey') {
        window.state.geminiApiKey = e.target.value;
    } else if (e.target.id === 'dailyGoalMinutes') {
        window.state.dailyGoalMinutes = parseInt(e.target.value) || 0;
        // 目標変更時に集計表示も更新
        if (state.summaryData) renderSummaryMetrics(state.summaryData.daily, state.summaryData.weekly, state.summaryData.monthly, state.dailyGoalMinutes);
    }

    window.saveState();

    if (e.target.id === 'googleClientId' && window.gapi && window.gapi.load) {
        // Client IDが入力され、値がある場合に認証クライアントを初期化するinitClient()を呼び出す
        if (window.state.googleClientId) {
            window.initClient();
        }
    }
    updateUI();
}

function initializeApp() {

    // 1. Load Data
    window.loadState();

    // 2. Set Listeners
    $dom.$googleClientId.addEventListener('input', handleInput);
    $dom.$geminiApiKey.addEventListener('input', handleInput);
    $dom.$dailyGoalMinutes.addEventListener('input', handleInput);
    $dom.$authButton.addEventListener('click', window.handleAuthClick);
    $dom.$fetchButton.addEventListener('click', window.handleFetchClick);
    $dom.$timerButton.addEventListener('click', handleTimerClick);
    $dom.$analyzeButton.addEventListener('click', window.handleAnalyzeClick);

    // 3. Initial UI Update and GAPI init attempt
    updateUI(); 
    if (window.state.googleClientId) {
        window.initClient(); // Client IDがLocal Storageにあれば、最初に認証初期化を試みる
    }
}

// Google API Clientライブラリがロードされたら初期化
window.gapiLoaded = function() {
    gapi.load('client:auth2', initializeApp);
}

document.addEventListener('DOMContentLoaded', () => {
    if (window.gapi && window.gapi.load) {
        // gapi.jsのロード後に実行されるgapiLoaded関数がHTMLに設定されている場合があるため、ここでは何もしない
    }
});
