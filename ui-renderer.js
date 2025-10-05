// ui-renderer.js内の handleInput 関数 (修正後)

function handleInput(e) {
    // ... (省略: 状態の更新と保存)

    window.saveState();

    if (e.target.id === 'googleClientId' && window.gapi && window.gapi.load) {
        // ★★★ 修正: Client ID入力時に認証を初期化する initClient() を呼び出す ★★★
        if (window.state.googleClientId) {
            // gapiライブラリがロード済みであれば、initClientを直接実行
            if (window.gapi.client) {
                window.initClient();
            } else {
                // gapi自体はロードされているが、clientが未ロードの場合は、client:auth2を再ロードしてinitializeAppからinitClientを呼び出す
                // 実際には、gapi.load('client:auth2', initializeApp)がDOMContetLoadedで実行されるため、initClientを直接呼び出すのが安全
                console.log("GAPI Clientがまだロードされていません。DOMロード完了を待ってください。");
            }
        }
    }
    updateUI();
}

// ... (省略: initializeApp 内の最後の部分も initClient() に変更)
function initializeApp() {
    // 1. Load Data
    window.loadState();

    // 2. Set Listeners
    // ... (イベントリスナーの設定はそのまま)

    // 3. Initial UI Update and GAPI init attempt
    updateUI(); 
    if (window.state.googleClientId) {
        window.initClient(); // ★★★ 修正: initClient() を呼び出す ★★★
    }
}
// ...
