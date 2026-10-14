// Google Identity Services 設定
// 請在 Google Cloud Console 建立 OAuth 用戶端（網頁應用程式），
// 將 Client ID 填入下方。詳見專案 README。
window.SCHOOL_ADMIN_CONFIG = {
  // 例：1234567890-xxxx.apps.googleusercontent.com
  googleClientId: "",
  // 只允許此 Google Workspace 網域登入
  allowedDomain: "g.lwfss.edu.hk",
  // 開發／演示：若尚未設定 Client ID，可暫時用緊急通行碼（正式環境請留空字串停用）
  // 設為空字串 "" 即強制 Google 登入
  emergencyPassword: "",
  schoolName: "世界龍岡學校劉皇發中學",
  schoolShort: "劉皇發中學"
};
