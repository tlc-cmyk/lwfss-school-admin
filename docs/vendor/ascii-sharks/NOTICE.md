# ascii-sharks (vendored)

Source: https://github.com/stackedlol/ascii-sharks  
License: MIT (see LICENSE)

Vendored into LWFSS school-admin for the holiday timetable underlay.
Local change: `OceanEngine` accepts optional `{ fishCount }` for the compact panel.
Rebuild bundle (dev machine):

```sh
npx esbuild docs/vendor/ascii-sharks/browser-entry.ts \
  --bundle --format=iife --global-name=AsciiSharksBundle \
  --outfile=docs/js/vendor/ascii-sharks.js --target=es2018 --minify
```

Pages serves only `docs/js/vendor/ascii-sharks.js` — no npm at runtime.
