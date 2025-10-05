// このファイルは、Google Fit API/Gemini APIへの通信ロジックを管理します。

const DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/fitness/v1/rest"];
const SCOPES = "https://www.googleapis.com/auth/fitness.activity.read https://www.googleapis.com/auth/fitness.activity.write https://www.googleapis.com/auth/fitness.body.read"; 
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent`;
// const MS_IN_DAY = 24 * 60 * 60 * 1000; // 未使用のため削除

// --- GAPI Initialization (認証の核となる部分) ---

// 1. Google APIクライアントライブラリをClient IDとスコープで初期化する
function initClient() {
    const state = window.state;
    
    // Client IDが空の場合は、エラーを出して初期化しない
    if (!state.googleClientId) {
        state.authError = "Client IDが設定されていません。入力後に認証ボタンを押してください。";
        window.updateUI();
        return; 
    }

    gapi.client.init({
        clientId: state.googleClientId, // ★★★ ユーザー入力のIDを使用 ★★★
        discoveryDocs: DISCOVERY_DOCS,
        scope: SCOPES, 
    }).then(() => {
        // 初期化が成功した後、認証ステータスのリスナーを設定する
        gapi.auth2.getAuthInstance().isSignedIn.listen(updateSigninStatus);
        
        // 初期の認証ステータスを反映する
        updateSigninStatus(gapi.auth2.getAuthInstance().isSignedIn.get());
        state.isGapiLoaded = true;
        state.authError = null;
        window.updateUI();

        // Fit APIクライアントをロード
        initGapiClient();

    }).catch(error => {
        console.error("GAPI Client Initialization Error:", error);
        state.authError = `GAPI初期化失敗: ${error.details || error.error || error.message}. Client IDを確認してください。`;
        window.updateUI();
    });
}
window.initClient = initClient;

// 2. Google Fit API (fitness) のクライアントをロードする
function initGapiClient() {
    gapi.client.load('fitness', 'v1').then(() => {
        // Fitness APIのロードが完了
        window.updateUI();
    });
}
window.initGapiClient = initGapiClient;

// 3. 認証ステータスが変更されたときの処理
function updateSigninStatus(isSignedIn) {
    const state = window.state;
    state.isSignedIn = isSignedIn;
    window.updateUI();

    // サインイン後、自動でデータ取得を試みる
    if (isSignedIn) {
        // window.handleFetchClick(); // データ取得は認証完了後、ユーザーに実行させる方が親切
    }
}
// window.updateSigninStatus = updateSigninStatus; // windowに公開する必要はない

// 4. 認証ボタンがクリックされたときの処理
function handleAuthClick() {
    const state = window.state;
    if (!state.isGapiLoaded) {
        // GAPIが初期化されていなければ、ここで初期化を試みる
        initClient();
        return;
    }

    if (state.isSignedIn) {
        gapi.auth2.getAuthInstance().signOut();
    } else {
        // サインイン処理 (ポップアップ表示)
        gapi.auth2.getAuthInstance().signIn();
    }
}
window.handleAuthClick = handleAuthClick;


// --- Google Fit Handlers (詳細データ取得) ---

// ... (以下、変更なし)

// --- Google Fit Handlers (書き込み) ---

// ... (以下、変更なし)

// --- Gemini AI Analysis --- 

// ... (以下、変更なし)
