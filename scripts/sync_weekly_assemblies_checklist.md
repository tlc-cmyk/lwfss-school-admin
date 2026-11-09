# weekly_assemblies Sheet 同步 checklist（一次／routine）

- [ ] 讀 Sheet tab `週會編排總表`（跳過標題／空列；欄：日期、主題週 或 活動、中一…中六、場地安排）
- [ ] 日期 `D/M/YYYY` → `YYYY-MM-DD`；各 text 欄 trim，預設 `''`；場地多行合併
- [ ] 記錄同步前：`SELECT count(*), min(assembly_date), max(assembly_date) FROM weekly_assemblies WHERE academic_year = '2026-2027'`
- [ ] UPSERT 全部 Sheet 有效列（`ON CONFLICT (assembly_date) DO UPDATE`；寫 `academic_year`、`sort_order`）
- [ ] `DELETE FROM weekly_assemblies WHERE academic_year = '2026-2027' AND assembly_date NOT IN (Sheet 日期集合)`
- [ ] 核對：Sheet 有效列數 = 該學年 DB `count(*)`；抽查 min／max 同幾個 theme_week
- [ ] 唔公開 Sheet；唔把 service_role 寫入 repo／對話
