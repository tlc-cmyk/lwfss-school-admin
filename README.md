# 劉皇發中學 · 學校行政系統

獨立的學校行政系統（**與** [lwfss-timetable](https://tlc-cmyk.github.io/lwfss-timetable/) **分開**）。

- **雲端資料庫**：Supabase 免費專案 `lwfss-school-admin`（Postgres）
- **本機備份**：SQLite `db/school.db`（離線備份／匯入快取，**不要刪除**）
- **網站**：靜態 HTML/CSS/JS，GitHub Pages（`docs/`）
- **登入**：Supabase Auth 的 Google provider，只接受 `@g.lwfss.edu.hk`
- **模組**：主頁 sticky 頂卡＋功能欄；下方面板跟 tab 轉（預設時間表）；教師時間表查詢；文件遞交清單及校務會議（教職員）

學校：世界龍岡學校劉皇發中學（LWFSS）  
維護：IT Coordinator（曹立翔 / TLC）  
組織：LWFSS

Pages：<https://tlc-cmyk.github.io/lwfss-school-admin/>

---

## Supabase 專案

| 項目 | 值 |
|------|----|
| 名稱 | `lwfss-school-admin` |
| Project ref | `edausixxdclhonkrdzqg` |
| API URL | `https://edausixxdclhonkrdzqg.supabase.co` |
| 區域 | `ap-southeast-1` |
| 資料表 | `teachers`（65）、`lessons`（1908）、`meta`、`staff`（75）、`staff_deadlines`（92）、`cycle_days`（67）、`calendar_events`（~290）、`assembly_by_day`（10）、`students`（755）、`student_groups`（2542）、`class_teachers`（49） |

前端只用 **anon key**（寫在 `docs/js/config.js`）。這把鑰匙是公開的。  
真正的限制是 **RLS**，不是把 anon key 藏起來。

### RLS（只限學校網域讀取）

三張表都已啟用 RLS。現有政策只有 SELECT（`polcmd = r`），角色 `authenticated`：

- `school_read_teachers`
- `school_read_lessons`
- `school_read_meta`
- `school_read_staff`
- `school_read_cycle_days` / `school_read_calendar_events` / `school_read_assembly_by_day`（本校 `@g.lwfss.edu.hk`）
- `school_read_students` / `school_read_student_groups` / `school_read_class_teachers`（本校 `@g.lwfss.edu.hk`）
- `staff_read_staff_deadlines`（**僅** `staff` 表內電郵可 SELECT）

條件（約）：

```sql
COALESCE(auth.jwt() ->> 'email', '') ILIKE '%@g.lwfss.edu.hk'
```

沒有 INSERT / UPDATE / DELETE 政策，所以即使資料表 GRANT 給了 `anon` 和 `authenticated`，未登入或非本校電郵的請求也讀不到列（實測 anon key 查 `teachers` 回傳 `[]`），也不能改資料。  
**不要**把 `service_role` key 或 Google Client Secret 放進這個倉庫。

### 主頁（登入後 · sticky 頂卡＋功能欄，唔顯示校網）

設計原則：**頂部資訊卡同功能欄永遠保留**（sticky），唔顯示校徽／校名／「學校行政系統」品牌 header；mobile-first。**只有下方面板**跟住功能欄 tab 轉，唔 remount 頂卡／功能欄。

1. **單一頂卡（sticky）**：日期＋香港即時時間＋Day N＋狀態 chip＋姓名（＋短碼／職稱）＋**早會主題**（`assembly_by_day`）＋今日事項（≤3）＋改日期。唔再堆疊校網 header、今日卡、事項卡三層。登出喺頂卡右上角；唔再顯示底欄 footer。
2. **早會**：按當日 `cycle_days.cycle_day` 對應 `assembly_by_day`；顯示「早會：…」；升國旗日（DAY2／DAY7）加「· 升國旗」。無循環日（假期）唔顯示。
3. **今日事項**：優先當日 `calendar_events`（校曆備註／活動／假期／考試，含「關愛月」等；種子見 `db/seed_calendar_events.sql`），再補最多合共 3 條今日 `staff_deadlines`；頂卡內白底 inset、**單行省略**。當日**未有真 DB 資料就唔顯示**。
4. **功能欄（sticky tabs）**：時間表（預設）／班別／課室／文件／會議／即時空堂／約開會。切換只換下方面板。
5. **下方面板**：預設＝D1–D10 選擇器＋教師下拉＋節卡（P1…；其間插入一般／BF 鐘聲嘅緊湊 早會／小息／午膳列；時間、現正節／休息 highlight、細倒數依選取／今日循環日揀 BF 或一般）；鐘聲類型已喺頂卡 Day N 顯示，唔再喺面板重複標「一般／BF上課時間」或教師姓名塊。**班別／課室** tab＝同一套 D1–D10（與教師時間表共用 `selectedDay`）＋班別（1A–6D）或課室選擇，按 `lessons` 過濾當日課節（教職員可用；學生稍後）。**文件／會議** tab 嵌入 `staff_deadlines` 清單（即將到期／全年、按月分組；教職員專用，學生見友善提示）；**即時空堂** tab＝按香港時間＋今日循環日＋一般／BF 鐘聲（Day 5／10＝BF）判斷現正節，列出該節 `lessons` 無課之教師（`short_name`＋`name`；教職員專用）；約開會而家用 placeholder。Day 5／10 用 BF 鐘聲，其餘循環日用一般。

Auth 繼續喺 `document` 派 `schooladmin:authed`；教職員／學生規則不變；前端只用 anon key，**唔用** `service_role`。

### 身分：教職員 vs 學生

教師與學生都用 `@g.lwfss.edu.hk` Google 登入。登入後前端以電郵查 `staff` 表：

- **在職員名單** → 教職員介面（教師時間表等）
- **不在名單** → 學生介面（班別時間表稍後）

結構見 `db/staff.sql`；種子資料來自「2627職員名單」Google Sheet（另加 IT 主任 `tlc@g.lwfss.edu.hk`）。

### 學生資料庫（2026-2027）

| 表 | 列數 | 說明 |
|----|------|------|
| `students` | 755 | 班別 `class_code`＋學號 `class_no`；英／中文姓名、性別、社；`email` 可空 |
| `student_groups` | 2542 | S2–S6 科目分組（含教師 shortcode）；S4 兩份 xls 已去重 |
| `class_teachers` | 49 | 各班班主任 shortcode（來自 `staff.class_teacher`） |

結構／RLS：`db/students.sql`；種子：`db/seed_students.sql`（由 `scripts/parse_students.py` 從班名單 xlsx＋分組 xls 產生）。


---

## 目錄結構

```
school-admin/
├── db/
│   ├── schema.sql          # 本機 SQLite 結構（與雲端欄位對應）
│   ├── staff.sql           # 雲端 staff 允許名單 DDL
│   ├── seed_staff.sql      # staff upsert 種子
│   ├── calendar_staff_deadlines.sql  # calendar_events / cycle_days / staff_deadlines
│   ├── seed_staff_deadlines.sql
│   ├── seed_cycle_days.sql
│   ├── assembly_by_day.sql # 早會日程（Day 1–10）
│   ├── seed_assembly_by_day.sql
│   ├── students.sql        # students / student_groups / class_teachers DDL+RLS
│   ├── seed_students.sql   # 2026-2027 學生＋分組種子
│   └── school.db           # 離線備份／匯入快取（保留）
├── scripts/
│   ├── import_timetable.py # 從 Sheet 匯出重建 SQLite + 本地 JSON
│   └── parse_students.py   # 從班名單／分組 Excel 產生 seed_students.sql
├── docs/                   # GitHub Pages 網站根目錄
│   ├── index.html
│   ├── timetable.html
│   ├── staff-deadlines.html
│   ├── assets/校曆表-2026-2027.pdf
│   ├── css/app.css
│   ├── js/config.js        # Supabase URL、anon key、allowedDomain
│   ├── js/auth.js          # Supabase Google 登入
│   ├── js/home.js          # 主頁精簡：今日條、今日事項、模組 pill、課表
│   ├── js/timetable.js     # 雲端時間表 + 今日循環日
│   ├── js/staff-deadlines.js
│   └── data/
│       ├── timetable.json  # 本地備份
│       └── timetable.js
└── README.md
```

---

## 網站怎樣讀時間表

登入成功且工作階段來自 Supabase 時，`timetable.js` 會分頁讀取 `teachers`、`lessons`、`meta`（PostgREST 預設每頁最多 1000 列，課節約 1908，所以會讀兩頁），再組成跟 `window.TIMETABLE_DATA` 一樣的形狀：

```text
{ meta, teachers: [{ code, eng, chi, lessonCount, schedule: { day: { period: { class, classShort, subject, subjectShort, teacher, room } } } }] }
```

雲端失敗、傳回空表，或只是緊急通行碼／舊 GIS 備援時，改用 `docs/data/timetable.js`，並顯示：

「雲端暫不可用，使用本地備份」

---

## 啟用 Google 登入（你現在要做的）

按鈕「使用學校 Google 帳戶登入」會呼叫：

```js
supabase.auth.signInWithOAuth({
  provider: "google",
  options: {
    queryParams: {
      hd: "g.lwfss.edu.hk",
      access_type: "online",
      prompt: "select_account"
    },
    redirectTo: window.location.origin + window.location.pathname
  }
})
```

`hd` 只是 Google 帳戶選擇器的提示。真正擋非本校帳戶的是：前端檢查電郵網域後 `signOut()`，以及上面的 RLS。

### 1. Google Cloud OAuth 用戶端

1. 打開 [Google Cloud Console](https://console.cloud.google.com/)
2. 建立或選擇專案（例如 `lwfss-school-admin`）
3. **API 和服務 → OAuth 同意畫面**
   - 若學校 Workspace 允許，User type 選 **Internal**
   - 應用程式名稱：`劉皇發中學學校行政系統`
4. **API 和服務 → 憑證 → 建立憑證 → OAuth 用戶端 ID**
   - 類型：**網頁應用程式**
   - **已授權的 JavaScript 來源**加入：
     - `https://tlc-cmyk.github.io`
     - 本機預覽可加 `http://localhost:8080`
   - **已授權的重新導向 URI**（Supabase 代收，必須完全一致）：
     - `https://edausixxdclhonkrdzqg.supabase.co/auth/v1/callback`
5. 複製 **用戶端 ID** 與 **用戶端密鑰（Client Secret）**  
   Secret 只貼進 Supabase，不要 commit。

### 2. Supabase 啟用 Google provider

Dashboard：<https://supabase.com/dashboard/project/edausixxdclhonkrdzqg/auth/providers>

1. **Authentication → Providers → Google** → 啟用
2. 貼上 Google Cloud 的 **Client ID** 與 **Client Secret**
3. 儲存

### 3. Supabase 允許本站導回

**Authentication → URL Configuration**

- Site URL：`https://tlc-cmyk.github.io/lwfss-school-admin/`
- Redirect URLs 加入（PKCE 會回到目前頁面）：
  - `https://tlc-cmyk.github.io/lwfss-school-admin/**`
  - `http://localhost:8080/**`（本機預覽）

未列入允許清單時，Google 登入完成後 Supabase 會拒絕導回。

### 4. 確認

用 `tlc@g.lwfss.edu.hk` 登入後，時間表應顯示「Supabase 雲端」，查 `TLC` 應見到曹立翔 / TSAO LAP CHEUNG。  
用其他網域（例如 `@gmail.com`）應被登出，並看到只允許 `@g.lwfss.edu.hk` 的錯誤。

`docs/js/config.js` 的 `googleClientId` 可以保持空白。那是舊的 Google Identity Services 按鈕，只有之後填了才會出現，而且**沒有** Supabase 工作階段，時間表只會用本地備份。主路徑是 Supabase。

`emergencyPassword` 請保持 `""`。

---

## 重新匯入時間表

來源 Sheet：`timetablegrok`（tab `MailMergeDB`）  
fileId：`14UPpVtyrCCzM_uExw7hsfKxKk-5F_kzZMy00j1RYFoM`

### 本機 SQLite 與 JSON 備份（現在就能做）

```bash
python3 scripts/import_timetable.py /path/to/export.json
```

或：

```bash
export TIMETABLE_SRC=/path/to/export.json
python3 scripts/import_timetable.py
```

腳本會重建 `db/school.db`，並覆寫 `docs/data/timetable.json` 與 `docs/data/timetable.js`。  
SQLite 是離線備份和匯入快取，不要刪。

### 雲端（Supabase SQL／MCP，稍後做腳本也可以）

雲端欄位與 SQLite 對應：

| SQLite | Postgres |
|--------|----------|
| `teachers.code / eng_name / chi_name / lesson_count` | 同名，`code` 為主鍵 |
| `lessons`（`teacher_code, day, period, class_name, class_short, subject, subject_short, teachers_field, room`） | 同名；`id` 為 identity |
| `meta(key, value)` | 同名 |

更新雲端時：

1. 用上面的 Python 先更新本機 SQLite（當備份）
2. 在 Supabase SQL Editor，或透過已連接的 Supabase MCP `execute_sql`（專案 `edausixxdclhonkrdzqg`）以具備寫入權限的身分執行：
   - `DELETE FROM lessons;`
   - `DELETE FROM teachers;`
   - `DELETE FROM meta;`
   - 再 `INSERT` 新列（`lessons.id` 不用自己填）
3. 不要用瀏覽器裡的 anon key 寫入；RLS 沒有寫入政策
4. 之後若要自動化，可另寫腳本用 **service role**（只放在本機環境變數，不進 git）從 `school.db` upsert 上雲

匯入後抽查：`teachers` 約 65 列、`lessons` 約 1908 列、`meta` 有 `generated_at`。

---

## 本機預覽

```bash
cd docs
python3 -m http.server 8080
# http://localhost:8080/
```

OAuth 導回必須先把 `http://localhost:8080/**` 加進 Supabase Redirect URLs。  
未啟用 Google provider 時，登入按鈕會失敗，頁面會提示到 Dashboard 啟用。

---

## 部署至 GitHub Pages

倉庫以 `docs/` 為網站根目錄（已設定）。

```bash
git add -A && git commit -m "Update site"
git push origin main
```

網址：<https://tlc-cmyk.github.io/lwfss-school-admin/>

---

## 未來模組

主頁已預留：**當值**、**代堂**（有真 DB 先顯示）；文件遞交清單嵌喺主頁「文件／會議」面板（同 `staff-deadlines.html` 邏輯）。  
新模組可沿用同一 Supabase 專案加表（並加上同樣的學校網域 SELECT 政策）、共用 `js/auth.js`。

---

## 授權與用途

供劉皇發中學校內行政使用。  
anon key 可以留在前端；Client Secret 與 service role key 不可以。
