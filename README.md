# FocusBoard

FocusBoard ist ein verspieltes, kartenbasiertes Whiteboard für Windows, in der Art von Milanote. Notizen, Bilder, Linien, Spalten, Aufgaben und verschachtelte Boards liegen auf einer freien Fläche. Die App ist ein lokaler Desktop-Prototyp (Electron): alles steht in einer JSON-Datei auf dem eigenen Rechner. Es gibt kein Konto, keinen Abgleich und keinen Stift.

Der sichtbare Name ist FocusBoard. Die Installationskennung und der Datenordner der Version 0.3 bleiben, damit ein Update die vorhandene Sicherung nicht verlegt.

Der Prototyp ist **nicht signiert**. Windows SmartScreen kann beim Start warnen.

## Funktionen

- Notizen in Gelb, Rosa, Türkis, Grün und Orange, dazu zwei Überschriften
- Bildkarten, Spalten, die Karten tragen, Aufgaben mit Haken, Linien und fünf Sticker
- Unterboards, die über den Pfad oben geöffnet werden
- Werkzeuge lassen sich auf die Fläche ziehen; Linien docken an Karten an oder liegen frei
- Rückgängig und Wiederholen, Zoom (50 %, 100 %, 200 %, Alles) und eine weiße oder schwarze Fläche ohne Raster
- Mausrad verschiebt senkrecht, Umschalt seitlich, Strg zoomt am Zeiger; zwei Finger verschieben beide Achsen, die Pinzetten-Geste zoomt
- Dateien der Version 0.1 und 0.2 lassen sich öffnen und werden als Version 3 gelesen
- Zusätzliche Sicherung nur im eigenen Datenordner; die gewählte Datei wird nicht automatisch überschrieben
- Bedienung auf Deutsch. Die Kennzeichnung „React Flow“ bleibt sichtbar, weil die Fläche mit dieser Bibliothek gebaut ist
- Kartentext in der mitgelieferten Schrift Patrick Hand (SIL Open Font License, siehe `src/renderer/src/fonts/OFL.txt`)
- Keine Animationen

## Oberfläche (0.4)

Links: Auswahl, Notiz, zwei Überschriften, Bild, Spalte, Aufgaben, Linie und Mehr. Unter Mehr: Unterboard und fünf Sticker. Oben Pfad, Rückgängig, Wiederholen und Datei. Unten rechts Zoom, 50 %, 100 %, 200 % und Alles.

## Technik

Electron, React, TypeScript und [React Flow](https://reactflow.dev/) (`@xyflow/react`, MIT).
Der Renderer hat kein Node.js (`contextIsolation`, `sandbox`, `nodeIntegration: false`).
Pfade wählt nur der Hauptprozess über die Systemdialoge. Importierte Dateien werden geprüft:
Board-Baum, Pfeile, Bildtyp anhand der Dateisignatur, Größe.

Die Windows-Ausgabe ist ein NSIS-Installer für 64-Bit (`x64`). Es wird kein Zertifikat verwendet
und die EXE-Ressourcen werden nicht nachträglich signiert oder mit einem eigenen Icon überschrieben.

Voraussetzung: Node.js 22.

## Abhängigkeiten installieren

`npm ci` verwendet die festgeschriebene `package-lock.json`. In `.npmrc` steht
`legacy-peer-deps=true`, weil der Abhängigkeitslöser von npm 10 bei Vitest sonst abbricht.

```bash
npm ci
```

## Entwicklung

```bash
npm run dev
```

Die gebaute App ohne Installer:

```bash
npm run build
npm run preview
```

## Tests

```bash
npm test
npm run typecheck
```

`npm test` führt die Unit-Tests mit Vitest aus. Die Schritte für eine Prüfung auf PC und Laptop stehen in `TESTANLEITUNG.md`. End-to-End-Tests mit Playwright: `npm run test:e2e`.

## Windows-Installer erzeugen

Auf Windows:

```bash
npm ci
npm run dist:win
```

Unter Linux braucht der NSIS-Schritt Wine, auch ohne Signatur. electron-builder startet
dabei kurz den erzeugten Uninstaller-Helfer. Auf einem System ohne 32-Bit-Wine bricht
das ab. Headless zusätzlich mit einem virtuellen Bildschirm:

```bash
sudo dpkg --add-architecture i386
sudo apt-get update
sudo apt-get install -y wine wine32:i386 xvfb
npm ci
xvfb-run -a npm run dist:win
```

Es wird kein Zertifikat gesucht (`CSC_IDENTITY_AUTO_DISCOVERY=false` im Skript).
Die EXE-Ressourcen werden nicht signiert und nicht mit einem eigenen Icon überschrieben.

Das Skript setzt `CSC_IDENTITY_AUTO_DISCOVERY=false`, damit electron-builder kein Zertifikat sucht.
Der Installer liegt danach unter:

```text
release/FocusBoard-Setup-0.4.0.exe
```

## Dateiformat

Eine Datei, `format` ist `digitales-whiteboard`. Neue Dateien haben `version` `3`.
Version 1 und 2 werden beim Öffnen angenommen. Darin stehen alle Boards, Karten, Linien, Spalten, Aufgaben, Ansicht und die Bilder als Data-URL.
Die Datei ist zwischen PC und Laptop kopierbar. Sie kann durch die Bilder groß werden
(höchstens 8 MB je Bild, höchstens 40 MB für die ganze Datei).

## Bewusst nicht in dieser Fassung

Kein Stift und kein Druck. Keine Link-Karten.
Kein PDF, keine Präsentation, kein Abgleich. Der Rückgängig-Verlauf bleibt in der Sitzung und wird nicht in die Datei geschrieben.

## Lizenzen

MIT, siehe `LICENSE`. Drittsoftware: `THIRD_PARTY_NOTICES.md`.
