# 文件期限：Google Sheet → Supabase 同步說明

**Sheet 係 source of truth。** 同步之後，該學年喺 `public.staff_deadlines` 嘅內容會完全跟 Sheet；網站表單同 Sheet 可以並存，但同步跑完後以 Sheet 為準。

## Sheet

- 名稱：文件期限／校務會議  
- 連結：https://docs.google.com/spreadsheets/d/1LgKOmOC5PrAnZaYPhAbe8Z6ULq6tWbHG5Dtj_pyD0WY/edit  
- 資料 tab：`文件期限`（第 1 列標題，由第 2 列起係資料）  
- 說明 tab：`說明`（不同步）  
- **唔好改欄名**（固定）：`id`、`due_date`、`due_date_raw`、`title`、`academic_year`、`sort_order`  
- 空 `title` 嘅列會跳過；空 `due_date` → DB `NULL`；`due_date` 必須係 `YYYY-MM-DD` 或留空  
- 新增列：`id` 留空；同步後 bot 會寫返新 id 入 A 欄

## 自動同步點樣運作

1. Grok Bot **routine**（由 TLC／IT 設定）會定時讀 Sheet `文件期限`。  
2. 對 Sheet 入面出現嘅每個 `academic_year`：先 `DELETE` 該學年 DB 列，再 `INSERT` Sheet 列（有 id 嘅用 `OVERRIDING SYSTEM VALUE` 保持 id；無 id 嘅新增後寫返 Sheet）。  
3. 只覆蓋 Sheet 有出現嘅學年；其他學年唔郁。  
4. **唔會**公開分享 Sheet；repo／對話唔放 `service_role` key。

## 老師／同事點做

1. 改 Google Sheet（加期限、改標題、改日期等）。  
2. 等自動同步，或者叫 TLC／IT 手動跑一次。  
3. 主頁「文件／會議」表單都可以改 DB，但下次 Sheet 同步會覆蓋該學年——**要長久保留嘅改動請寫入 Sheet**。

## 對照

| 項目 | 說明 |
|------|------|
| 前端 CRUD | `docs/js/staff-deadlines.js`（RLS） |
| 表結構 | `db/calendar_staff_deadlines.sql` |
| 寫入政策 | `db/staff_deadlines_write.sql` |
| 操作 checklist | `scripts/sync_staff_deadlines_checklist.md` |

維護：IT Coordinator（TLC）· LWFSS
