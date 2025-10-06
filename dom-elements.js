// --- DOM Elements ---

// DOM要素の参照を格納するグローバルオブジェクト（initializeAppで初期化されます）
window.$dom = {};

// IDによる要素取得ヘルパー関数
const $id = (id) => document.getElementById(id);
window.$id = $id; 