# FocusBoard

FocusBoard ist ein verspieltes, kartenbasiertes Whiteboard für Windows, in der Art von Milanote. Notizen, Bilder, Linien, Spalten, Aufgaben und verschachtelte Boards liegen auf einer freien Fläche. Die App ist ein lokaler Desktop-Prototyp (Electron): die Boards liegen als JSON-Dateien auf dem eigenen Rechner. Es gibt kein Konto, keinen Abgleich und keinen Stift.

Diese Fassung ist **0.4.3**. Beim Start erscheint die Übersicht „Meine Boards“. Der sichtbare Name ist FocusBoard. Die Installationskennung und der Datenordner der Version 0.3 bleiben, damit eine vorhandene Sicherung übernommen werden kann.

Der Prototyp ist **nicht signiert**. Windows SmartScreen kann beim Start warnen.

## Funktionen

- Übersicht „Meine Boards“ mit Kartenminiaturen, „zuletzt bearbeitet“ und „Zuletzt verwendet“
- Neu, Umbenennen, Duplizieren und Löschen. Löschen legt das Board in den Papierkorb, von dort lässt es sich wiederherstellen.
- Bibliotheksordner, voreingestellt `Dokumente\FocusBoard`, wechselbar und für OneDrive geeignet. Änderungen werden automatisch gespeichert.
- Datei, Öffnen übernimmt eine JSON-Datei in die Bibliothek und lässt das Original liegen. Exportieren schreibt eine Kopie.
- Logo und „Zur Übersicht“ kehren zur Startseite zurück. Eine alte automatische Sicherung kann übernommen werden.
- Notizen in Gelb, Rosa, Türkis, Grün und Orange, dazu zwei Überschriften. Notizen wachsen mit dem Text mit.
- Bildkarten, Spalten, die Karten tragen, Aufgaben mit Haken, Linien und fünf Sticker. „+ Eintrag“ bleibt innerhalb der Aufgabenkarte.
- Unterboards, die über den Pfad oben geöffnet werden und in der Datei ihres Boards bleiben
- Werkzeuge lassen sich auf die Fläche ziehen. Linien docken an Karten an oder liegen frei. Beide Enden haben runde Griffe, die ganze Linie lässt sich ziehen, und beim Zeichnen folgt eine gestrichelte Vorschau.
- Rückgängig und Wiederholen, Zoom (50 %, 100 %, 200 %, Alles) und eine weiße oder schwarze Fläche ohne Raster
- Hell, Dunkel oder System ist eine Einstellung der App und gehört nicht zur Datei
- Mausrad verschiebt senkrecht, Umschalt seitlich, Strg zoomt am Zeiger; zwei Finger verschieben beide Achsen, die Pinzetten-Geste zoomt. Strg+A markiert die Karten. Ein Rahmen wählt Karten und Linien zusammen.
- Dateien der Version 0.1 und 0.2 lassen sich öffnen und werden als Version 3 gelesen
- Bedienung auf Deutsch. Die Kennzeichnung „React Flow“ bleibt sichtbar, weil die Fläche mit dieser Bibliothek gebaut ist
- Kartentext in der mitgelieferten Schrift Patrick Hand (SIL Open Font License, siehe `src/renderer/src/fonts/OFL.txt`)
- Keine Animationen

## Version 0.4.3

- Eine Startseite „Meine Boards“ zeigt jedes Board als Kachel mit Miniatur der Karten, dem Namen und „zuletzt bearbeitet“. Oben steht „Zuletzt verwendet“.
- Neu anlegen, umbenennen, duplizieren und löschen. Löschen fragt nach und legt das Board in den Papierkorb. Dort lässt es sich wiederherstellen.
- Die Boards liegen in einem Bibliotheksordner. Voreinstellung ist `Dokumente\FocusBoard`. Der Ordner lässt sich ändern und eignet sich für OneDrive. Änderungen werden automatisch gespeichert.
- Datei, Öffnen übernimmt eine einzelne JSON-Datei in die Bibliothek und lässt das Original liegen. Exportieren schreibt eine Kopie an einen anderen Ort.
- Das Logo und „Zur Übersicht“ führen zurück zur Startseite. Gibt es eine alte automatische Sicherung, bietet die Übersicht an, sie zu übernehmen. Die Sicherungsdatei bleibt liegen.

## Version 0.4.2

- Pfeile sind bearbeitbar. An beiden Enden sitzen runde Griffe, mit denen sich die Linie verschieben oder neu andocken lässt.
- Ziehen an der Linie selbst verschiebt sie. Angedockte Enden lösen sich dabei und werden frei.
- Nach dem ersten Punkt folgt eine gestrichelte Vorschau dem Zeiger, bis das zweite Ende gesetzt ist.
- Linien gehören zur Rechteckauswahl. Zieht man die Karten, wandern die mitgewählten Linien mit.
- In der Linienleiste dreht „Umdrehen“ die Pfeilrichtung um.
- „+ Eintrag“ bleibt innerhalb der Aufgabenkarte, auch wenn die Liste in einer Spalte steht.

## Version 0.4.1 (Stabil)

- Die automatische Sicherung läuft weiter, während der Hinweis zum Wiederherstellen offen ist.
- Das Menü „Mehr“ bleibt auch bei kleinem Fenster und bei 150 % Skalierung vollständig sichtbar und klickbar.
- Enter in einer Aufgabenliste setzt den Cursor in die neue Zeile. Rücktaste leert die letzte Zeile, statt sie zu entfernen.
- Notizen wachsen mit dem Text mit, ohne Scrollbalken.
- Karten in einer Spalte stapeln sich neu, wenn eine Karte darüber wächst.
- Strg+A markiert die Karten, nicht die Beschriftung der Oberfläche.
- Die Linienleiste schließt sich beim Wegklicken, mit Escape oder beim Boardwechsel.
- Speichern schreibt erst in eine temporäre Datei und benennt sie danach um. Die vorige Fassung bleibt als `.bak`.
- Hell, Dunkel oder System ist eine Einstellung der App. Rückgängig ändert das Thema nicht.

## Oberfläche (0.4.3)

Beim Start die Übersicht „Meine Boards“. Auf der Fläche links: Auswahl, Notiz, zwei Überschriften, Bild, Spalte, Aufgaben, Linie und Mehr. Unter Mehr: Unterboard und fünf Sticker. Oben Pfad, Rückgängig, Wiederholen und Datei. Unten rechts Zoom, 50 %, 100 %, 200 % und Alles. Die Fläche ist rein weiß oder rein schwarz, ohne Raster. Notizen: Gelb, Rosa, Türkis, Grün, Orange.

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
release/FocusBoard-Setup-0.4.3.exe
```

## Dateiformat

Ein Board ist eine Datei, `format` ist `digitales-whiteboard`. Neue Dateien haben `version` `3`.
Version 1 und 2 werden beim Öffnen angenommen. Darin stehen alle Boards, Karten, Linien, Spalten, Aufgaben, Ansicht und die Bilder als Data-URL.
Unterboards bleiben in der Datei ihres Boards. Die Datei ist zwischen PC und Laptop kopierbar. Sie kann durch die Bilder groß werden
(höchstens 8 MB je Bild, höchstens 40 MB für die ganze Datei).

Die Bibliothek speichert jedes Board als eigene JSON-Datei und schreibt Änderungen von selbst. Schreiben erfolgt atomar: erst in eine temporäre Datei, dann umbenennen. Die vorige Fassung bleibt als `.bak`. Schlägt das Schreiben fehl, bleibt die alte Datei heil. Eine Datei außerhalb der Bibliothek wird nicht still überschrieben.

## Bewusst nicht in dieser Fassung

Kein Stift und kein Druck. Keine Link-Karten.
Kein PDF, keine Präsentation, kein Abgleich. Der Rückgängig-Verlauf bleibt in der Sitzung und wird nicht in die Datei geschrieben.
Keine gebogene Linie und kein Griff in der Mitte der Linie.

## Lizenzen

MIT, siehe `LICENSE`. Drittsoftware: `THIRD_PARTY_NOTICES.md`.
