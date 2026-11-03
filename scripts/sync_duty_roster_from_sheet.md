# 老師當值：Google Sheet → Supabase 同步說明

**Sheet 係 source of truth。** 同步之後，`public.duty_roster` 會完全跟 Sheet `值日表`；整表 full replace（UPSERT Sheet 列，再刪除 Sheet 冇出現嘅 `duty_date`）。

## Sheet

- 名稱：老師當值／值日表  
- 連結：https://docs.google.com/spreadsheets/d/1h4TtMJlw8VWSbBMsRroxX4D7PeYWcT4JeUe3eqA3JNg/edit  
- 資料 tab：`值日表`（第 1 列標題，由第 2 列起係資料）  
- 說明 tab：`說明`（不同步）  
- **唔好改欄名**（固定）：`duty_date`、`teacher1`、`teacher2`、`notes`  
- 空 `duty_date` 嘅列會跳過；`teacher1`／`teacher2`／`notes` trim 後預設 `''`  
- `duty_date` 必須係 `YYYY-MM-DD`；每一日最多一列（PK）

## 自動同步點樣運作

1. Grok Bot **routine**（由 TLC／IT 設定；預期平日每小時）會定時讀 Sheet `值日表`。  
2. 正規化後：對所有有效列 `UPSERT`（`ON CONFLICT (duty_date)` 更新三個 text 欄）。  
3. `DELETE` DB 入面 `duty_date` 唔喺今次 Sheet 集合嘅列——整表以 Sheet 為準。  
4. 核對：Sheet 有效列數 = DB `count(*)`；抽查 min／max 日期同幾個 teacher short code。  
5. **唔會**公開分享 Sheet；repo／對話唔放 `service_role` key。

## 老師／同事點做

1. 改 Google Sheet（改值日老師、加／刪日子、填 `notes` 代值等）。  
2. 等自動同步，或者叫 TLC／IT 手動跑一次。  
3. 網站頂欄「值日」讀嘅係 DB——**要長久保留嘅改動請寫入 Sheet**。

## Drive

Preferred folder：`LWFSS 學校行政系統資料`（`1eYHxkoxBKpwP5ynVOM1COJ6KL8mIcwuH`）。  
Drive API 搬檔可能 `403 appNotAuthorizedToFile`（drive.file scope）——可手動拖入資料夾。

## 對照

| 項目 | 說明 |
|------|------|
| 表結構／RLS | `db/duty_roster.sql` |
| 種子（歷史） | `db/seed_duty_roster.sql` |
| Sheet ops note | `scripts/duty_roster_sheet.md` |
| 操作 checklist | `scripts/sync_duty_roster_checklist.md` |

維護：IT Coordinator（TLC）· LWFSS
