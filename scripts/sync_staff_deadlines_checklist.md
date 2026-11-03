# staff_deadlines Sheet 同步 checklist（一次／routine）

- [ ] 讀 Sheet tab `文件期限`（跳過空 title；核對 header 未改名）
- [ ] `due_date` 只接受 `YYYY-MM-DD` 或空 → NULL
- [ ] 記錄同步前：`SELECT academic_year, COUNT(*) FROM staff_deadlines GROUP BY 1`
- [ ] 對每個 Sheet 學年：DELETE 該年 → INSERT（有 id：`OVERRIDING SYSTEM VALUE`；無 id：普通 INSERT + 寫返 A 欄）
- [ ] `setval` 到 `MAX(id)`
- [ ] 核對：Sheet 有效列數 = 該啲學年 DB 列數；抽查幾條 title／due_date
- [ ] 唔公開 Sheet；唔把 service_role 寫入 repo／對話
