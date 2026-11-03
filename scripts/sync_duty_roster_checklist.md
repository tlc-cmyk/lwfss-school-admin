# duty_roster Sheet 同步 checklist（一次／routine）

- [ ] 讀 Sheet tab `值日表`（跳過空 `duty_date`；核對 header 未改名：`duty_date,teacher1,teacher2,notes`）
- [ ] `duty_date` → `YYYY-MM-DD`；`teacher1`／`teacher2`／`notes` trim，預設 `''`
- [ ] 記錄同步前：`SELECT count(*), min(duty_date), max(duty_date) FROM duty_roster`
- [ ] UPSERT 全部 Sheet 有效列（`ON CONFLICT (duty_date) DO UPDATE`）
- [ ] `DELETE FROM duty_roster WHERE duty_date NOT IN (Sheet 日期集合)`
- [ ] 核對：Sheet 有效列數 = DB `count(*)`；抽查 min／max 同幾個 teacher code
- [ ] 唔公開 Sheet；唔把 service_role 寫入 repo／對話
