# Bau und Tests 0.4.0

Stand: 7. November 2026. Linux, Node.js 22. Kein Windows-PC.

Nur der Name FocusBoard und das mitgelieferte Zeichen. Die Bedienung aus 0.3 ist unverändert.

## Ergebnis

- `npm test`: 33 Unit-Tests bestanden, darunter Name, Dateiformat Version 3, alter Datenordner `Digitales Whiteboard`, About-Text und die sieben ICO-Größen.
- `npm run typecheck`: ohne Fehler.
- Playwright mit Electron: 9 Tests bestanden, inklusive des Namens FocusBoard oben links und der Prüfungen aus 0.3.
- NSIS-Cross-Build mit Wine. Signatur aus (`signExecutable: false`), Ressourceneintrag für das Symbol an. Standardsymbol von Electron ist ersetzt.

## Symbol

In `FocusBoard.exe`, `FocusBoard-Setup-0.4.0.exe` und `Uninstall FocusBoard.exe` steckt dieselbe Icon-Gruppe: 16, 24, 32, 48, 64, 128 und 256. Der Windows-Symbolcache wurde nicht geprüft.

## Installer

`FocusBoard-Setup-0.4.0.exe`

- Größe: 103 716 167 Bytes
- SHA256: `10c5c5daae64c25fd4001aaf7560f959623d54371e8299e8e78131a2bda804c9`
- Nicht signiert. Enthält `FocusBoard.exe` (PE32+ x64).
- Installationskennung bleibt `de.nadin.digitales-whiteboard.prototype`, NSIS-GUID `71db26c7-f6d1-58f4-b361-0e1cdd71ad4c`.
- Die automatische Sicherung bleibt im Datenordner `Digitales Whiteboard`.

## Nicht auf Windows-Hardware geprüft

Echte Maus, Touchpad, SmartScreen, Installation, Startmenü, Desktop-Verknüpfung, Symbolcache, Monitorwechsel, Windows-Skalierung 100/150/200 %.
