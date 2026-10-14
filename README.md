# 劉皇發中學 · 學校行政系統

獨立的學校行政系統（**與** [lwfss-timetable](https://tlc-cmyk.github.io/lwfss-timetable/) **分開**）。

- **資料庫**：免費 SQLite（`db/school.db`），零註冊
- **網站**：靜態 HTML/CSS/JS，可部署至 GitHub Pages
- **登入**：學校 Google 帳戶 `@g.lwfss.edu.hk`（Google Identity Services）
- **首個模組**：教師時間表查詢

學校：世界龍岡學校劉皇發中學（LWFSS）  
維護：IT Coordinator（曹立翔 / TLC）

---

## 目錄結構

```
school-admin/
├── db/
│   ├── schema.sql          # 資料表定義
│   └── school.db           # SQLite 資料庫（由匯入腳本產生）
├── scripts/
│   └── import_timetable.py # 從 Sheet 匯出匯入 DB + JSON
├── docs/                   # GitHub Pages 網站根目錄
│   ├── index.html
│   ├── timetable.html
│   ├── css/app.css
│   ├── js/config.js        # ← 填入 Google OAuth Client ID
│   ├── js/auth.js
│   ├── js/timetable.js
│   └── data/
│       ├── timetable.json
│       └── timetable.js
└── README.md
```

---

## SQLite 資料庫

路徑：`db/school.db`

主要資料表：

| 表 | 說明 |
|----|------|
| `teachers` | 教師代碼、中英文名、節數 |
| `lessons` | 每節課（day 1–10、period、科目、班別、課室） |
| `meta` | 校名、來源 Sheet fileId、產生時間等 |

之後若要改用免費雲端資料庫，可把同一 schema 搬到 **Turso**（libSQL）或 **Supabase**（Postgres）免費層，匯入腳本只需改連線字串。

---

## 從 Google Sheet 重新匯入

來源 Sheet：`timetablegrok`（tab `MailMergeDB`）  
fileId：`14UPpVtyrCCzM_uExw7hsfKxKk-5F_kzZMy00j1RYFoM`

1. 用 Drive / 工具匯出 MailMergeDB 為 JSON 包裝或 CSV
2. 在本機執行：

```bash
python3 scripts/import_timetable.py /path/to/export.json
```

或：

```bash
export TIMETABLE_SRC=/path/to/export.json
python3 scripts/import_timetable.py
```

腳本會：

- 重建 `db/school.db`
- 寫出 `docs/data/timetable.json` 與 `docs/data/timetable.js`（供靜態站使用，GitHub Pages **不需要**伺服器）

---

## Google 學校帳戶登入（必要）

教師必須以 **`@g.lwfss.edu.hk`** 登入（例如 `tlc@g.lwfss.edu.hk`）。  
本站使用 **Google Identity Services（GIS）** 用戶端登入，並以 JWT 內的 `email` 網域做限制；同時設定 `hd: g.lwfss.edu.hk`。

### 建立 OAuth 用戶端（免費）

1. 前往 [Google Cloud Console](https://console.cloud.google.com/)
2. 建立或選擇專案（例如 `lwfss-school-admin`）
3. **API 和服務 → OAuth 同意畫面**
   - User Type：選 **Internal**（若學校 Workspace 允許；只限本校帳戶）  
     若只能選 External：測試使用者加入本校教師，或之後上架
   - 應用程式名稱：`劉皇發中學學校行政系統`
4. **API 和服務 → 憑證 → 建立憑證 → OAuth 用戶端 ID**
   - 應用程式類型：**網頁應用程式**
   - 已授權的 JavaScript 來源（依實際網址加入），例如：
     - `https://tlc-cmyk.github.io`
     - `http://localhost:8080`（本機預覽）
   - 已授權的重新導向 URI：GIS 按鈕流程通常可不填；若改用 redirect 模式再補
5. 複製 **用戶端 ID**（形如 `xxxxx.apps.googleusercontent.com`）
6. 編輯 `docs/js/config.js`：

```js
window.SCHOOL_ADMIN_CONFIG = {
  googleClientId: "把用戶端ID貼這裡.apps.googleusercontent.com",
  allowedDomain: "g.lwfss.edu.hk",
  emergencyPassword: "",  // 正式環境請保持空白
  schoolName: "世界龍岡學校劉皇發中學",
  schoolShort: "劉皇發中學"
};
```

7. 提交並推送後，Pages 即會顯示「使用 Google 登入」按鈕。

> **注意（靜態站限制）**：純前端 GIS 可驗證登入身分與網域，適合校內工具 v1。  
> 時間表 JSON 仍會隨網站公開下載；若日後要真正隱藏資料，請改用 **Supabase Auth（Google provider）+ RLS** 或邊緣函式，把資料放在需登入才可讀的 API 之後。README 已預留此升級路徑。

### 本機緊急通行（可選）

未填 `googleClientId` 時，畫面上會提示設定步驟。  
僅供開發可暫時設定 `emergencyPassword`（例如本機測試）；**正式環境必須留空**，強制 Google 登入。

---

## 本機預覽

```bash
cd docs
python3 -m http.server 8080
# 瀏覽器開啟 http://localhost:8080/
```

查詢示例：登入後輸入 `TLC` → 應顯示 **曹立翔 / TSAO LAP CHEUNG** 時間表。

---

## 部署至 GitHub Pages

本倉庫以 `docs/` 作為網站根目錄。

```bash
# 已建立 repo 後
git add -A && git commit -m "Update site"
git push origin main
```

在 GitHub：Settings → Pages → Source：`Deploy from a branch` → Branch：`main` → Folder：`/docs`。

預期網址：

`https://tlc-cmyk.github.io/lwfss-school-admin/`

記得把此網址加入 OAuth「已授權的 JavaScript 來源」。

---

## 未來模組

主頁已預留：**當值**、**校曆**、**代堂**。  
新增模組時可沿用 `db/schema.sql` 加表、在 `scripts/` 加匯入、在 `docs/` 加頁面，並共用 `js/auth.js` 登入狀態。

---

## 授權與用途

供劉皇發中學校內行政使用。請勿將 OAuth Client Secret 提交到本倉庫（本站 v1 只使用 Client ID）。
