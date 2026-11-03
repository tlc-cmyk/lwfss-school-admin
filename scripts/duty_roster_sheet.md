# 老師當值 Google Sheet（ops note）

Spreadsheet title: **老師當值／值日表**

**Sheet 係 source of truth。** 自動／手動同步見 `scripts/sync_duty_roster_from_sheet.md`（同文件期限一樣：UPSERT 後刪 Sheet 冇嘅日期）。

## Tabs

| Tab | Purpose |
|-----|---------|
| `值日表` | Data table (one row per duty date) |
| `說明` | Editing instructions (Cantonese)；不同步 |

## Headers（唔好改名）

Must match `public.duty_roster` exactly — English snake_case:

| Column | DB type | Notes |
|--------|---------|--------|
| `duty_date` | date PK | `YYYY-MM-DD` |
| `teacher1` | text | Teacher short code（e.g. TLC） |
| `teacher2` | text | Teacher short code |
| `notes` | text | Optional（swaps／代值）；可空 |

唔好插入／刪除／調欄次序或改 header。每一日一列；日期必須唯一。空 `duty_date` 列同步時會跳過。

## Sync（摘要）

1. 讀 `值日表` 全部有效列 → 正規化。  
2. UPSERT 入 `public.duty_roster`；再 DELETE Sheet 集合以外嘅 DB 列。  
3. Grok Bot routine：預期平日每小時（由 parent／TLC 設定）。  
4. 唔公開分享；repo／對話唔放 `service_role`。

## Seed

Initial rows were exported from Supabase `public.duty_roster` ordered by `duty_date`（建立時 187 列）。之後以 Sheet 為準。

## Drive

Preferred folder: `LWFSS 學校行政系統資料` (`1eYHxkoxBKpwP5ynVOM1COJ6KL8mIcwuH`).  
Drive API move may fail with `403 appNotAuthorizedToFile` under drive.file scope — 可手動拖入資料夾。

## Sharing

Not public by default; teachers share the sheet themselves.
