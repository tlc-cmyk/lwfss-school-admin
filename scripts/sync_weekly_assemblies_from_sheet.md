# 周會編排：Google Sheet → Supabase 同步說明

**Sheet 係 source of truth。** 同步之後，`public.weekly_assemblies` 會完全跟 Sheet `週會編排總表`（該學年）；整表以 Sheet 為準。

唔好同 `assembly_by_day`（循環日早會）撈亂——呢張係**有日期嘅周會**；時段對應 **Day 8 · P6–P7**。

## Sheet

- 名稱：2627年度週會編排總表  
- 連結：https://docs.google.com/spreadsheets/d/1TBZVkOfgKjnMYPSZ0pMz0nh1Y7GR_uAf6SYbWwphQ2c/edit  
- 資料 tab：`週會編排總表`  
- 版面（由上至下）：
  - 第 1 列：標題（可忽略）
  - 第 2 列：空
  - 第 3 列：欄名——`（空／日期）`、`主題週 或 活動`、`中一級`…`中六級`、`場地安排`
  - 第 4 列起：資料
- 日期顯示為 `D/M/YYYY` 或 `DD/M/YYYY`（例如 `9/9/2026`）→ 同步時轉 `YYYY-MM-DD`
- 空日期列跳過；文字欄 trim，空則 `''`
- `academic_year` 固定寫 `2026-2027`（或跟 Sheet 學年規則）；`sort_order` 按 Sheet 列序由 1 起

## DB 欄位對照

| Sheet | DB |
|------|-----|
| 日期 | `assembly_date`（PK） |
| 主題週 或 活動 | `theme_week` |
| 中一級…中六級 | `s1`…`s6` |
| 場地安排 | `venue`（多行合併成一句，可用 `；`） |
| — | `academic_year`、`sort_order` |

## 自動同步點樣運作

1. Grok Bot **routine**（由 TLC／IT 設定）定時讀 Sheet `週會編排總表`。  
2. 正規化後：對所有有效列 `UPSERT`（`ON CONFLICT (assembly_date) DO UPDATE`）。  
3. `DELETE` 該 `academic_year` 入面 `assembly_date` 唔喺今次 Sheet 集合嘅列。  
4. 核對：Sheet 有效列數 = 該學年 DB `count(*)`；抽查 min／max 日期。  
5. **唔會**公開分享 Sheet；repo／對話唔放 `service_role` key。

## 老師／同事點做

1. 改 Google Sheet（主題、各級內容、場地、加／刪日期）。  
2. 等自動同步，或者叫 TLC／IT 手動跑一次。  
3. 網站頂欄「周會」、今日事項、功能欄「Day8 周會」讀嘅係 DB——**要長久保留嘅改動請寫入 Sheet**。

## 對照

| 項目 | 說明 |
|------|------|
| 表結構／RLS | `db/weekly_assemblies.sql` |
| 種子（歷史） | `db/seed_weekly_assemblies.sql` |
| 前端總表 | `docs/js/weekly-assemblies.js` |
| 頂欄／今日事項 | `docs/js/home.js` |
| 操作 checklist | `scripts/sync_weekly_assemblies_checklist.md` |

維護：IT Coordinator（TLC）· LWFSS
