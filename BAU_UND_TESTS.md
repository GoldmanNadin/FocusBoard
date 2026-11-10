# Bau und Tests 0.4.1

Stand: 10. November 2026. Linux, Node.js 22. Kein Windows-PC.

Stabilitätsfassung. Keine neuen Werkzeuge, keine Animationen, gleiche Farben und Patrick Hand.

## Ergebnis

- Vitest: 39 Tests bestanden, davon 1 Property-Test mit 25 Läufen (fast-check).
- Playwright mit Electron: 15 Tests bestanden.
- `npm run typecheck` ohne Fehler.
- NSIS-Cross-Build mit Wine. Nicht signiert.

## Installer

`FocusBoard-Setup-0.4.1.exe`

- Größe: 103 720 795 Bytes
- SHA256: `040855d7fd4aec5652ca6b5c1f7c7029b927486ad393665b3bd5f4a0357a77ea`
- Installationskennung und NSIS-GUID unverändert. Datenordner bleibt `Digitales Whiteboard`.

## Nicht auf Windows-Hardware geprüft

Echte Maus, Touchpad, SmartScreen, Installation, Startmenü, voller Datenträger am echten PC, Windows-Skalierung außer der simulierten 150 %.
