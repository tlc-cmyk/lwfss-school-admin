// 劉皇發中學 · 學校行政系統設定
// supabaseAnonKey 是公開的 anon key（會出現在 GitHub Pages）。
// 資料表已開 RLS：只有已登入、且電郵以 @g.lwfss.edu.hk 結尾的 JWT 可以 SELECT。
// 不要把 service_role key 或 Google Client Secret 放進這個檔案。
window.SCHOOL_ADMIN_CONFIG = {
  supabaseUrl: "https://edausixxdclhonkrdzqg.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkYXVzaXh4ZGNsaG9ua3JkenFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE5ODE5NTMsImV4cCI6MjEwNzU1Nzk1M30.yJVhFLSMv1diXIlJTTcWdW7dBeu2JZ9802f2vztun0A",
  // 可留空。主登入路徑是 Supabase Auth 的 Google provider，不是 GIS。
  // 例：1234567890-xxxx.apps.googleusercontent.com
  googleClientId: "",
  // 只允許此 Google Workspace 網域登入
  allowedDomain: "g.lwfss.edu.hk",
  // 開發／演示：若尚未設定 OAuth，可暫時用緊急通行碼（正式環境請留空字串停用）
  emergencyPassword: "",
  schoolName: "世界龍岡學校劉皇發中學",
  schoolShort: "劉皇發中學"
};
