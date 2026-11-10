# FocusBoard 0.4.0 – Feedback für die Entwicklung

Stand: 10. November 2026 · Grundlage: Code-Review des ganzen Quellcodes und Prüfung in der laufenden App (Electron unter Linux, Playwright-Skripte, Bildschirmfotos).

Ziel ist eine App, die sich wie Milanote anfühlt: ruhig, direkt, ohne Überraschungen. Sie darf keine Daten verlieren, und jede Geste muss so wirken, wie man es erwartet.

---

## Stand der Korrekturen (Branch `claude/hopeful-noether-b6yl4q`)

Alle 13 bestätigten Fehler aus Abschnitt A sind behoben, außerdem B1, B2, B4, B6, B7 und B17 sowie der Platzhalter für leere Notizen. Für jeden Punkt gibt es einen Regressionstest: `tests/e2e/fixes.spec.ts` (11 Oberflächentests) und `tests/fixes.test.ts` (5 Unit-Tests). Insgesamt laufen 38 Unit-Tests und 20 Oberflächentests grün.

| Punkt | Was jetzt passiert |
|---|---|
| A1 | Die Sicherung läuft weiter, auch wenn der Wiederherstellen-Hinweis offen ist. Die frühere Sitzung wird beim Start nach `recovery-autosave.json.previous` kopiert. „Verwerfen“ löscht die laufende Sicherung nicht mehr. |
| A2 | Das „Mehr“-Menü liegt fest am Fenster neben dem Knopf und wird von der Werkzeugleiste nicht mehr abgeschnitten. |
| A3/A4 | Enter springt in den neuen Eintrag, ↑/↓ wechseln zwischen Einträgen, Enter im Titel springt in den ersten Eintrag. Rücktaste in einem leeren Eintrag löscht ihn und springt in den vorigen. Der letzte Eintrag wird nur geleert. |
| A5 | Ändert sich die Höhe einer Karte in einer Spalte (Liste, Text, Größenänderung), wird die Spalte neu angeordnet. |
| A6 | Die Linien-Leiste schließt bei Klick auf die Fläche oder eine Karte, bei Escape, Boardwechsel, Rückgängig, Neu und Öffnen. Entf/Rücktaste löscht die markierte Linie. |
| A7 | Strg+A wählt alle Karten. Die Oberfläche selbst ist nicht mehr als Text markierbar. |
| A8 | Alle Eingabefelder werden für Tastenkürzel als Eingabe erkannt. Im Board-Titel übernimmt Enter, Escape stellt den alten Titel wieder her. |
| A9 | Das Thema ist nicht mehr Teil des Verlaufs und macht die Datei nicht „ungespeichert“. Rückgängig behält das aktuelle Thema. |
| A10 | Eine neu angelegte Notiz, die leer verlassen wird, verschwindet ohne Eintrag im Verlauf. Leere bestehende Notizen zeigen „Leere Notiz“ blass und kursiv, der Editor zeigt „Hier tippen …“. |
| A11 | Text-Karten wachsen und schrumpfen mit dem Text (gemessen über eine unsichtbare Kopie des Textes). Die Breite wird an den Seitenkanten gezogen, die Höhe folgt dem Inhalt. |
| A12 | Anzeige: „Keine Änderungen“ · „Alle Änderungen gespeichert“ · „Nicht in Datei gespeichert · Sicherung 14:32“. |
| A13 | Linien liegen über den Karten, Pfeilspitzen sind sichtbar. |
| B1/B2 | „Ungespeichert“ wird nur einmal pro Änderung berechnet, Bilder gehen nur mit ihrer ID in den Vergleich ein. Die vollständige Kopie des Dokuments beim Ziehen und Bearbeiten entfällt. |
| B4 | „Speichern“ schreibt in eine temporäre Datei, synchronisiert sie und benennt sie dann um. |
| B6 | Spalte und Liste prüfen die Kartenzahl und die Geometrie, Linien prüfen die Höchstzahl. |
| B7 | Der Linien-Entwurf wird bei jedem Wechsel von Werkzeug oder Board verworfen. Ein verschluckter Klick nach dem Zeichnen einer Linie bleibt nicht mehr hängen. |

### Neu eingebaut (zweiter Schritt)

Getestet mit `tests/e2e/tools.spec.ts` (8 Oberflächentests) und `tests/clipboard.test.ts` (7 Unit-Tests). Stand: 45 Unit-Tests und 28 Oberflächentests grün, zweimal hintereinander ohne Wackler.

| Bereich | Was jetzt geht |
|---|---|
| D1 Zwischenablage | Strg+C/X/V und Strg+D für Karten. Linien zwischen kopierten Karten, Spalten mit Inhalt und Unterboards mit allem Inhalt werden mitkopiert, auch in ein anderes Dokument. Eingefügt wird an der Mausposition, das Eingefügte ist danach ausgewählt. Beim Kopieren landet zusätzlich reiner Text in der Zwischenablage (für andere Programme). |
| D1 Einfügen von außen | Strg+V mit Bildschirmfoto → Bildkarte. Mit Text → Notiz. Mit Web-Adresse → Link-Karte. |
| D1 Bilder hineinziehen | Ein oder mehrere Bilder aus dem Explorer auf die Fläche ziehen. Sie werden als Raster angeordnet. |
| D1 Rechtsklick-Menü | Auf Karten: Bearbeiten/Umbenennen, Öffnen, Notizfarbe, Duplizieren, Kopieren, Ausschneiden, Nach vorne, Nach hinten, Löschen. Auf der Fläche: Hier einfügen, Notiz hier, Link hier, Alles auswählen. Schließt mit Escape, Klick daneben oder Mausrad. |
| D1 Ebenen | „Nach vorne“ und „Nach hinten“. |
| D2 Link-Karte | Neues Werkzeug „Link“ (Taste K). Nimmt nur http(s)-Adressen an, `example.com` wird zu `https://example.com/`. Die Karte zeigt Host und Titel, der Knopf öffnet die Seite im Standardbrowser. Der Hauptprozess prüft die Adresse noch einmal. Doppelklick oder F2 ändert die Adresse. Das Dateiformat prüft Links beim Laden (`javascript:` und `file:` werden abgelehnt). |
| B5 Menü „Bearbeiten“ | Rückgängig, Wiederholen, Duplizieren, Alles auswählen und Löschen wirken auf das Board. In Textfeldern bleibt das normale Textverhalten. |
| C1 Werkzeugleiste | Jedes Werkzeug hat eine Beschriftung (Notiz, Titel, Untertitel, Bild, Link, Board, Spalte, Liste, Linie, Mehr) und ein Tastenkürzel (V, N, T, U, I, K, B, S, A, L), das im Tooltip steht. Unterboard ist ein eigenes Werkzeug. Neues Notiz-Symbol. |
| C7 Bilder | Seitenverhältnis bleibt beim Einfügen und beim Größenändern erhalten. |
| C8 Unterboards | Doppelklick öffnet das Unterboard. Umbenennen über F2, Enter oder Rechtsklick. Beim Anlegen ist „Neues Board“ markiert, Tippen ersetzt den Titel (vorher wurde angehängt: „Neues BoardProjekt“). Dasselbe gilt für Spaltentitel. |
| C11 Rückmeldung | Leere Boards erklären, was man tun kann. Nach dem Löschen erscheint „Karte gelöscht · Rückgängig“ für 6 Sekunden. |
| Neu gefunden und behoben | **Doppelklick auf die leere Fläche** legte nie eine Notiz an, auch in der Originalversion 0.4.0 nicht: React Flow verschluckt den zweiten Klick, wenn eine Rechteckauswahl beginnt. **Die Auswahl sprang zurück** auf die zuletzt angelegte Karte, sobald sich irgendetwas neu ausrichtete, und manchmal waren dadurch zwei Karten ausgewählt. **Escape schloss das Rechtsklick-Menü nicht.** |

### Neu eingebaut (dritter Schritt)

Stand: 47 Unit-Tests und 32 Oberflächentests grün, zweimal hintereinander.

| Bereich | Was jetzt geht |
|---|---|
| B9 Automatisch speichern | Sobald ein Board einmal als Datei gespeichert oder aus einer Datei geöffnet wurde, schreibt FocusBoard jede Änderung 1,5 s später selbst in diese Datei (atomar, siehe B4). Davor greift weiterhin die Sicherung im Datenordner. |
| D3 Suche | Strg+F oder „Suchen“ oben: durchsucht alle Boards (Notizen, Überschriften, Listen-Einträge, Spalten, Links, Unterboard-Titel), ohne Rücksicht auf Groß-/Kleinschreibung und Umlaute. Enter oder Klick öffnet das Board, wählt die Karte aus und holt sie in die Mitte. |
| C6 Linien | Eine markierte Linie zeigt Griffe an beiden Enden. Ziehen verschiebt das Ende, über einer Karte dockt es an deren Kante an. Rückgängig ist möglich. |
| D3 Vorlagen | Unter „Mehr“: Kanban (3 Spalten), Wochenplan (7 Tage + Liste), Moodboard. Eingefügt wie kopierte Karten, mit einem Schritt rückgängig. |

### Neu eingebaut (vierter Schritt)

Stand: 49 Unit-Tests und 35 Oberflächentests grün, zweimal hintereinander.

| Bereich | Was jetzt geht |
|---|---|
| C2 Textformatierung | Notizen zeigen `# Überschrift`, `- Liste`, `1. Liste`, `[ ]`/`[x]`, `**fett**`, `*kursiv*`, `~~durch~~`, `` `Code` `` und klickbare Links (öffnen im Browser). Strg+B/Strg+I umschließen die Markierung. Dargestellt wird ausschließlich über React-Elemente, Kartentext kann kein HTML einschleusen. Die Kartenhöhe misst die formatierte Ansicht. Die Suche zeigt Treffer ohne Formatierungszeichen. |
| C9 Animationen | Kurze Übergänge (120 ms) an Knöpfen, Menüs, Suche und Hinweisen. Fläche, Karten und Linien bewegen sich nie animiert, damit Ziehen exakt bleibt. Mit „Animationen aus“ in Windows (`prefers-reduced-motion`) ist alles still. |
| C2 Schrift | „Schrift: Hand / Klar“ oben schaltet zwischen Patrick Hand und Segoe UI. Die Wahl wird gemerkt, Karten messen ihre Höhe danach neu. |
| C9 Minikarte | „Karte“ im Zoom-Feld blendet eine Übersicht ein (Notizen in ihrer Farbe). Man kann darin ziehen und zoomen. Die Wahl wird gemerkt. |
| D2 Zeichnen | Werkzeug „Zeichnen“ (Taste P): Klick legt eine Skizze an. Darin zeichnet man mit Maus, Stift oder Finger, mit 6 Farben, fein oder dick, „Strich weg“ und „Fertig“. Escape oder ein Klick daneben beendet das Zeichnen. Eine leer verlassene Skizze verschwindet wieder. Striche werden relativ zur Karte gespeichert und beim Vergrößern proportional mitskaliert. Das Dateiformat prüft Farben, Punktzahl (höchstens 40 000) und Wertebereich. |

### Neu eingebaut (neunter Schritt): restliche Code-Pflege

Stand: 55 Unit-Tests und 47 Oberflächentests grün, zweimal hintereinander.

| Punkt | Ergebnis |
|---|---|
| B12 | Das globale, bei jedem Rendern überschriebene `setCardLookup` ist ersetzt durch einen React-Context (`CardLookupContext`), den die Zeichenfläche bereitstellt. Alle 12 Kartentypen lesen ihn über `useContext`. |
| B15 | Rückgängig und Wiederholen oben sind beim Schreiben nicht mehr ausgegraut. Ein Klick beendet das Schreiben und nimmt es als einen Schritt zurück (getestet). |
| B16 | Spalten haben nur noch einen Breitengriff: einen schmalen Streifen über die ganze rechte Kante, sichtbar beim Überfahren und bei Auswahl. Der zweite Größengriff, dessen Höhenänderung sofort wieder überschrieben wurde, ist weg. |

Damit sind alle Punkte aus A, B, C und D umgesetzt. Offen ist allein, was sich nur auf echter Windows-Hardware prüfen lässt (siehe „Was ausdrücklich nicht geprüft werden konnte“ und Checkliste G).

### Neu eingebaut (achter Schritt): Aufräumen und Gesamtprüfung

Stand: 55 Unit-Tests und 46 Oberflächentests grün, zweimal hintereinander.

| Punkt | Ergebnis |
|---|---|
| Papierkorb und Rückgängig | Wird eine Löschung mit Rückgängig zurückgeholt, verschwindet der Eintrag wieder aus dem Papierkorb. Wiederholen legt ihn erneut an. Keine Dubletten mehr. |
| B3 | Die Sicherung im Datenordner schreibt frühestens 1,5 s nach der letzten Änderung (vorher 0,5 s). |
| B8 | Mehrere ausgewählte Karten, die gemeinsam auf eine Spalte gezogen werden, landen alle darin (in ihrer Reihenfolge von oben nach unten). Gemeinsam herausgezogen verlassen sie die Spalte alle. |
| B10 | Geprüft: bereits sicher. Der Hauptprozess validiert die Datei vollständig, bevor er sich ihren Pfad merkt. |
| B11 | Toter Code in `loadJson` entfernt. |
| B13 | Ungenutzte `SidePanel.tsx` gelöscht. |
| Gesamtdurchlauf | Neuer Test „a long, realistic session“: Vorlage, Notiz mit Formatierung, Unterboard mit Link und Tabelle, Zeichnung, Kommentar, Form, Farbfeld, Anhang, Linie, Kopieren/Einfügen/Duplizieren/Löschen/Rückgängig/Wiederholen, Suche mit Sprung, Zoom, Thema, Schrift, Minikarte, Speichern, Export. Jede Fehlermeldung im Skript oder in der Konsole lässt den Test scheitern. Ergebnis: keine einzige. |
| Windows-Build | `electron-builder --win --dir` baut `FocusBoard.exe` mit der neuen Dateizuordnung. Der NSIS-Installer braucht Wine und wurde hier nicht gebaut. |

**Was ausdrücklich nicht geprüft werden konnte:** echte Windows-Hardware (Touchpad-Gesten, Stift, 150 % / 200 % Skalierung, mehrere Monitore), der Doppelklick auf eine `.focusboard`-Datei im Explorer nach der Installation, die SmartScreen-Warnung und das Öffnen von Anhängen mit echten Windows-Programmen. Dafür bitte die Checkliste in Abschnitt G auf einem Windows-PC durchgehen.

### Neu eingebaut (siebter Schritt)

Stand: 55 Unit-Tests und 43 Oberflächentests grün, zweimal hintereinander.

| Bereich | Was jetzt geht |
|---|---|
| D2 Datei-Anhänge | PDF, Text, Markdown, CSV, RTF, Word, Excel, PowerPoint, OpenDocument, ZIP, MP3/WAV/M4A und MP4 lassen sich als Karte anhängen (hineinziehen, Strg+V oder „Mehr → Datei anhängen“, höchstens 10 MB). Die Karte zeigt Typ, Name und Größe. „Öffnen“ (oder Doppelklick) öffnet mit dem Standardprogramm, „Speichern…“ legt eine Kopie ab. **Programme, Skripte, Verknüpfungen, HTML, SVG und Office-Makroformate werden nie angenommen**, auch nicht aus einer geladenen Datei: Ein geteiltes Board kann nichts transportieren, das per Doppelklick Code ausführt. Der Hauptprozess prüft jeden Anhang vor dem Öffnen noch einmal und legt ihn in einen eigenen Temp-Ordner. Dateinamen werden von Pfadangaben befreit. Anhänge sind durchsuchbar. |
| D3 Papierkorb | Gelöschte und ausgeschnittene Karten (auch ganze Unterboards mit Inhalt) landen im Papierkorb der App (Datei → Papierkorb…). Er überlebt das Schließen, behält Einträge 30 Tage (höchstens 50) und stellt sie in die Mitte des aktuellen Boards zurück. Was zurückkommt, wird wie eine geöffnete Datei vollständig geprüft. |
| Schnelles Tippen | Der Puffer für früh getippte Buchstaben verlor in seltenen Fällen ein Zeichen (Leerzeichen). Behoben, 10 Wiederholungen ohne Fehler. |

### Neu eingebaut (sechster Schritt)

Stand: 53 Unit-Tests und 41 Oberflächentests grün, zweimal hintereinander.

| Bereich | Was jetzt geht |
|---|---|
| C9 Hilfslinien | Beim Ziehen einer Karte rastet sie an Kanten und Mitten anderer Karten ein (6 Bildschirmpixel), eine orange Linie zeigt die Ausrichtung. Mit gedrückter Alt-Taste wird frei platziert. Die eingerastete Position bleibt auch beim Loslassen erhalten. |
| D3 PDF-Export | „Als PDF exportieren“ im Datei-Menü legt das ganze Board auf eine A4-Seite (Hoch- oder Querformat je nach Board), erzeugt in einem unsichtbaren, gesperrten Fenster. |
| D4 Öffnen von außen | Eine Board-Datei (`.json` oder neu `.focusboard`) kann per „Öffnen mit“ oder durch Ziehen auf das Programmsymbol geöffnet werden. Ein zweiter Programmstart übergibt die Datei an das laufende Fenster (nur ein Fenster). Der Installer registriert `.focusboard`. Eine ins Fenster gezogene Board-Datei wird als ungespeicherte Kopie geladen. |
| D2 Kommentar | Sprechblase für Anmerkungen (unter „Mehr“), eigener Stil, durchsuchbar. |
| D2 Tabelle | Tabelle mit Kopfzeile (unter „Mehr“). Tab springt zur nächsten Zelle, Enter eine Zeile tiefer (in der letzten Zeile neue Zeile), ↑/↓ wechselt die Zeile. „+/− Zeile“ und „+/− Spalte“ erscheinen über der ausgewählten Tabelle. Höchstens 40 × 10, durchsuchbar, als Tab-Text kopierbar. |
| Platzierung | Karten aus dem Menü „Mehr“ (Formen, Farbfeld, Tabelle, Kommentar, Sticker) landen nicht mehr übereinander, sondern suchen sich einen freien Platz nahe der Bildmitte. |
| Schnelles Tippen | Tippt man sofort nach dem Anlegen einer Notiz, Form oder eines Kommentars los, gehen die ersten Buchstaben nicht mehr verloren. Vorher landete z. B. ein „B“ als Tastenkürzel im Werkzeug „Board“. |
| „Mehr“-Menü | Misst sich nach dem Öffnen selbst und rückt hoch, bis es ganz ins Fenster passt. |

### Neu eingebaut (fünfter Schritt)

Stand: 50 Unit-Tests und 38 Oberflächentests grün, zweimal hintereinander.

| Bereich | Was jetzt geht |
|---|---|
| Strg+Z beim Schreiben | Der Notiz-Editor hat einen eigenen Verlauf, der Getipptes wortweise zusammenfasst (neuer Schritt bei Leerzeichen/Zeilenumbruch nach einem Wort oder nach einer Pause > 1 s). Strg+Y bzw. Strg+Umschalt+Z stellt wieder her. Vorher machte Strg+Z nur ein Zeichen rückgängig, auch in 0.4.0. |
| Cursor beim Bearbeiten | Beim Öffnen einer bestehenden Notiz steht der Cursor am Textende. Vorher stand er am Anfang, neuer Text landete vorn. |
| D3 Zuletzt geöffnet | Datei-Menü und leeres Hauptboard zeigen die zuletzt geöffneten oder gespeicherten Boards (bis zu 8, fehlende Dateien ausgegraut). Der Renderer kann nur Pfade öffnen, die der Hauptprozess selbst in diese Liste geschrieben hat. |
| D3 Export | „Als Bild exportieren (PNG)“ im Datei-Menü: Das ganze Board wird eingepasst, Bedienelemente ausgeblendet, fotografiert und die vorige Ansicht wiederhergestellt. |
| C6 Gebogene Linien | Eine markierte Linie hat in der Mitte einen gelben Griff. Ziehen biegt sie, Doppelklick macht sie wieder gerade, beides rückgängig machbar. Das Dateiformat speichert die Biegung als optionales `bend`. |
| C2 Farben | Drei neue Notizfarben: Lila, Blau, Weiß (alle mit Lesekontrast > 4,5:1, getestet). Farbnamen sind deutsch. |
| C10 Dunkles Thema | Fläche #121212 statt reinem Schwarz, Notizfarben im Dunkeln leicht gedämpft. Umschalten ist sofort und ohne halb-blasse Zwischenbilder. |
| D2 Formen | Rechteck, Kreis und Raute unter „Mehr“ (klicken oder auf die Fläche ziehen), mit Text und Farbe. Linien docken an. |
| D2 Farbfeld | Farbmuster mit Name und HEX-Wert, Farbe wählbar. Ein Klick auf den HEX-Wert kopiert ihn. |
| „Mehr“-Menü | Zweispaltig, scrollt bei sehr kleinen Fenstern. |
| Suche | Findet auch Formen und Farbfelder. |

Noch offen: nur der Test auf echter Windows-Hardware.

## 0. Kurzfazit

Die Basis ist solide. Datenmodell, Prüfung beim Import, Sicherheit im Electron-Teil (Sandbox, CSP, keine Node-Rechte im Renderer) und die Tests sind sauber gemacht. Die Bedienung fühlt sich aber noch nach Prototyp an:

1. **Es gibt echte Fehler.** Einer davon kann Arbeit kosten: Solange der Hinweis „Wiederherstellen“ sichtbar ist, wird nichts automatisch gesichert (siehe A1).
2. **Grundgesten fehlen**, die jeder von Milanote, Miro oder Figma kennt: Kopieren und Einfügen, Duplizieren, Alles auswählen, Rechtsklick-Menü, Bilder per Drag & Drop oder aus der Zwischenablage.
3. **Karten wachsen nicht mit ihrem Inhalt.** Notizen bekommen Scrollbalken, Listen überdecken in Spalten die nächste Karte.
4. **Die Oberfläche ist sehr „Standard-HTML“.** Native Checkboxen, graue Pfeil-Knöpfe, zwei gleich aussehende „H“-Symbole, Werkzeuge ohne Beschriftung, ein doppelter „100 %“-Wert im Zoom-Feld.
5. **Werkzeuge fehlen.** Für ein Milanote-ähnliches Board fehlen vor allem Link, Datei, Farbfeld, Kommentar, Zeichnen, Tabelle, Vorlagen und Suche (siehe Abschnitt D).

**Empfohlene Reihenfolge:** zuerst Abschnitt A (Fehler), dann B (Grundgesten), dann C (Feinschliff), dann D (neue Werkzeuge).

---

## A. Bestätigte Fehler (in der App nachgestellt)

Jeder Punkt wurde mit einem Playwright-Skript in der gebauten App geprüft. Schweregrad: 🔴 kritisch · 🟠 hoch · 🟡 mittel.

### A1 🔴 Automatische Sicherung steht still, solange der Wiederherstellen-Hinweis offen ist
- **Ablauf:** App starten, Notiz schreiben, App schließen. Neu starten. Der Hinweis „Es gibt eine automatisch gesicherte Sitzung …“ erscheint. Man ignoriert ihn und arbeitet weiter.
- **Ergebnis:** Die Sicherungsdatei wird **nie** aktualisiert (geprüft: Inhalt und Änderungszeit bleiben gleich). Stürzt die App jetzt ab oder wird sie geschlossen, ist alles seit dem Start verloren.
- **Ursache:** `src/renderer/src/App.tsx:159`: `if (demo || recovery) return;`
- **Lösung:** Beim Start die alte Sicherung in eine eigene Datei verschieben (z. B. `recovery-previous.json`) und die normale Sicherung sofort weiterlaufen lassen. Oder den Hinweis als Dialog zeigen, der eine Entscheidung verlangt, bevor man arbeiten kann.

### A2 🔴 Das Menü „Mehr“ (Unterboard, Sticker) ist abgeschnitten und kaum klickbar
- **Ablauf:** Fenster 1440×900, auf „Mehr“ klicken.
- **Ergebnis:** Das Menü liegt innerhalb der 72 px breiten Werkzeugleiste. Die Leiste hat `overflow: auto`, deshalb wird das Menü abgeschnitten und unten erscheint ein waagrechter Scrollbalken. Ein Treffertest auf den Knopf „Unterboard“ trifft **nicht** den Knopf (`elementFromPoint` liefert ein anderes Element).
- **Ursache:** `.toolbar { overflow: auto; position: relative }` in `src/renderer/src/styles.css`, und `.more-pop` ist ein Kind der Leiste.
- **Lösung:** Das Menü über ein Portal an `document.body` hängen, oder die Leiste auf `overflow: visible` stellen und die Position mit `getBoundingClientRect` berechnen. Noch besser: Unterboard und Sticker direkt in die Leiste setzen (siehe C1).

### A3 🟠 Aufgabenliste: Mit Rücktaste verschwindet der letzte Eintrag, danach kann man nichts mehr eintragen
- **Ablauf:** Liste anlegen, den einzigen Eintrag leeren, Rücktaste drücken.
- **Ergebnis:** 0 Einträge, Anzeige „0/0“. Es gibt keinen Knopf „Eintrag hinzufügen“. Die Karte ist leer und kann nicht mehr befüllt werden.
- **Ursache:** `src/renderer/src/components/cards.tsx:315-319` und `deleteTodoItem` in `src/shared/todos.ts`.
- **Lösung:** Den letzten Eintrag nie löschen, nur leeren. Zusätzlich eine Zeile „+ Eintrag“ unter der Liste anzeigen. Nach dem Löschen den Cursor in den vorherigen Eintrag setzen.

### A4 🟠 Aufgabenliste: Nach Enter bleibt der Cursor im alten Eintrag
- **Ablauf:** In Eintrag 1 „Eins“ tippen, Enter drücken, weitertippen.
- **Ergebnis:** Ein neuer leerer Eintrag entsteht, der Fokus bleibt aber auf Eintrag 1 (gemessen: Index 0). Der weitere Text landet im falschen Eintrag. So kann man keine Liste schnell herunterschreiben.
- **Ursache:** `addTodoAfter` in `App.tsx:505-509` legt den Eintrag an, setzt aber keinen Fokus. `addTodoItem` gibt die `itemId` zwar zurück, sie wird aber nicht genutzt.
- **Lösung:** Die neue `itemId` im Zustand merken („pendingFocus“) und den neuen Eintrag nach dem Rendern fokussieren. Pfeil hoch/runter sollen zwischen Einträgen wechseln. Enter im Titel soll in den ersten Eintrag springen.

### A5 🟠 Aufgabenliste in einer Spalte überdeckt die Karte darunter
- **Ablauf:** Spalte anlegen, Liste und darunter eine Notiz in die Spalte ziehen, in der Liste 5× Enter drücken.
- **Ergebnis:** Die Liste wächst (304 px), die Spalte wird aber nicht neu angeordnet. Die Notiz liegt über der Liste (Liste unten bei 489 px, Notiz oben bei 369 px).
- **Ursache:** `addTodoItem` (`src/shared/todos.ts`) ändert `height`, ruft aber `relayoutColumn` nicht auf, wenn `columnId` gesetzt ist. Dasselbe gilt für jede andere Größenänderung einer Karte in einer Spalte.
- **Lösung:** Eine zentrale Funktion `afterCardChange(doc, boardId, cardId)`, die bei Bedarf die Spalte neu anordnet. Sie soll nach **jeder** Änderung von Größe oder Inhalt laufen.

### A6 🟠 Die Linien-Leiste bleibt für immer stehen, auch auf anderen Boards
- **Ablauf:** Linie zeichnen, Linie anklicken (die Leiste mit Farben, „Pfeil“ und „Löschen“ erscheint). Dann auf die leere Fläche klicken, Escape drücken oder ein Unterboard öffnen.
- **Ergebnis:** Die Leiste bleibt in allen drei Fällen sichtbar, auch auf dem leeren Unterboard. Die Knöpfe zeigen dann ins Leere. Die Entf-Taste löscht die markierte Linie nicht.
- **Ursache:** `onSelectLine` wird nur mit einer ID aufgerufen (`BoardCanvas.tsx:368`), nie mit `null`. `openBoard`, `newDocument` und Escape setzen `selectedLine` nicht zurück.
- **Lösung:** Bei Klick auf die Fläche, bei Escape, beim Boardwechsel, bei „Neu“ und beim Öffnen `setSelectedLine(null)` aufrufen. Entf/Rücktaste löschen die markierte Linie. Eine markierte Linie zeigt Griffe an den Enden (siehe C6).

### A7 🟠 Strg+A markiert die ganze Oberfläche als Text
- **Ablauf:** Auf die Fläche klicken, Strg+A drücken.
- **Ergebnis:** Keine Karte wird ausgewählt. Stattdessen werden alle Texte der Oberfläche blau markiert (Logo, Knöpfe, Zoom-Feld).
- **Lösung:** Strg+A soll alle Karten des Boards auswählen. Die Oberfläche bekommt `user-select: none`, nur Editoren und Eingabefelder erlauben Markieren.

### A8 🟡 Enter im Board-Titel öffnet den Editor einer Karte
- **Ablauf:** Eine Notiz anklicken, dann oben im Board-Titel tippen und Enter drücken.
- **Ergebnis:** Der Titel wird nicht übernommen. Stattdessen öffnet sich der Editor der zuvor gewählten Notiz.
- **Ursache:** Der globale Tasten-Handler (`App.tsx:557`) erkennt nur `data-role="card-editor"` als Eingabe, nicht aber das Titelfeld.
- **Lösung:** Alle `input`, `textarea` und `[contenteditable]` als Eingabe behandeln. Enter übernimmt den Titel und verlässt das Feld, Escape stellt den alten Titel wieder her.

### A9 🟡 Das Umschalten Hell/Dunkel landet im Rückgängig-Verlauf und macht die Datei „ungespeichert“
- **Ablauf:** Auf „Dunkel“ klicken, dann Strg+Z drücken.
- **Ergebnis:** Das Thema springt zurück. Wer nach einer Textänderung das Thema wechselt, muss beim Rückgängigmachen zweimal drücken, und das erste Mal passiert scheinbar nichts.
- **Lösung:** Das Thema ist eine App-Einstellung, kein Inhalt. Es gehört in die Einstellungen (localStorage oder Datei im Datenordner), nicht in Dokument und Verlauf. Zusätzlich die Option „Wie System“ (`prefers-color-scheme`) anbieten.

### A10 🟡 Leere Notizen bleiben liegen und sehen aus wie echte Notizen mit dem Text „Notiz“
- **Ablauf:** Notiz-Werkzeug wählen, auf die Fläche klicken, sofort Escape drücken.
- **Ergebnis:** Eine gelbe Karte mit dem Text „Notiz“ bleibt liegen. Der Platzhalter sieht aus wie echter Inhalt.
- **Lösung:** So wie Milanote: Eine Notiz, die beim Verlassen des Editors leer ist und nie Text hatte, wird verworfen, ohne Eintrag im Verlauf. Den Platzhalter blass und kursiv darstellen (z. B. „Hier tippen …“), und nur während der Bearbeitung.

### A11 🟡 Notizen wachsen nicht mit dem Text, es erscheint ein Scrollbalken
- **Ablauf:** 30 Zeilen in eine Notiz schreiben.
- **Ergebnis:** Die Karte bleibt 160 px hoch, innen erscheint ein weißer Windows-Scrollbalken (Inhalt 648 px, sichtbar 142 px).
- **Lösung:** Karten passen ihre Höhe automatisch an den Inhalt an (Höhe messen, z. B. mit `ResizeObserver` auf `.card-copy`, in das Modell schreiben, Spalte neu anordnen). Die Breite stellt man selbst ein, die Höhe folgt dem Text. Ein manueller Höhen-Griff ist bei Notizen dann nicht nötig.

### A12 🟡 Die Speicheranzeige zeigt „Gespeichert“, obwohl Änderungen offen sind
- **Ergebnis:** Nach Strg+S und einer weiteren Änderung steht bis zur nächsten automatischen Sicherung „Gespeichert“ da, obwohl die Datei veraltet ist. Danach steht dort „Automatisch gesichert“, was Laien als „alles ist in meiner Datei“ lesen.
- **Ursache:** `App.tsx:653`: `dirty ? autosaveLabel || 'Ungespeichert' : 'Gespeichert'`, wobei `autosaveLabel` nach dem Speichern auf „Gespeichert“ steht.
- **Lösung:** Drei klare Zustände: „Alle Änderungen gespeichert“ · „Nicht in Datei gespeichert · Sicherung von 14:32“ · „Speichert …“. Besser noch: echtes automatisches Speichern in die Datei (siehe B9).

### A13 🟡 Linien liegen unter den Karten und die Pfeilspitze verschwindet
- **Ergebnis:** Im Demo-Board läuft die orange Linie von der gelben zur rosa Notiz unter den Karten hindurch, die Spitze ist halb verdeckt (siehe Demo-Bildschirmfoto).
- **Lösung:** Linien, die an Karten andocken, am Kartenrand enden lassen (die Kartenkante liegt schon im Anker). Die Linienebene über die Karten legen oder die Spitze vor der Kante enden lassen. Einen kleinen Abstand (4–6 px) zur Kante halten.

---

## B. Fehler und Risiken aus dem Code-Review

| # | Stelle | Problem | Vorschlag |
|---|---|---|---|
| B1 | `App.tsx:109-110`, `history.ts` | `contentSignature` macht bei **jedem Rendern** `JSON.stringify` über das ganze Dokument, eingebettete Bilder (base64) inklusive. Gemessen: 3 Bilder à 8 MB ≈ **150 ms pro Aufruf**. Pro Tastendruck laufen mehrere davon (dirty-Prüfung, `sameContent` bei commit, automatische Sicherung). Mit wenigen großen Bildern ruckelt das Tippen. | Eine Versionsnummer pro Änderung führen (`revision++`) und „dirty“ als `revision !== savedRevision` rechnen. Bilder in der Signatur nur über die ID vergleichen. |
| B2 | `App.tsx:741` | `structuredClone` des ganzen Dokuments bei jedem Ziehbeginn, mit Bildern ≈ 40 ms Verzögerung. | Nicht nötig: Das Dokument ist unveränderlich, die alte Referenz reicht. |
| B3 | `App.tsx:160-165` | Die automatische Sicherung schickt alle 500 ms nach einer Änderung das ganze JSON mit allen Bildern über IPC. | Mindestens auf 2 s entprellen, Bilder getrennt als Dateien im Datenordner ablegen und nur Verweise sichern. |
| B4 | `main/index.ts:269` | `fs.writeFile` direkt auf die Zieldatei. Absturz oder voller Datenträger während des Schreibens = kaputte Datei. | Atomar schreiben: `ziel.tmp` schreiben, `fsync`, dann `rename`. Davor eine `.bak` der letzten Version behalten. |
| B5 | `main/index.ts:205-213` | Das Menü „Bearbeiten“ nutzt Electron-Rollen (`undo`, `copy`, `delete` …). Diese wirken nur auf Textfelder, nicht auf Karten. Ein Klick auf Bearbeiten → Rückgängig tut für das Board nichts. | Eigene Menüeinträge, die über IPC die Befehle der App auslösen (wie bei Datei). |
| B6 | `boardOps.ts:560-608` | `addColumn` und `addTodoCard` prüfen weder `MAX_CARDS_PER_BOARD` noch die Geometrie. `addCanvasLine` prüft keine Höchstzahl an Linien. Man kann also Dateien erzeugen, die beim nächsten Öffnen als ungültig abgelehnt werden. | Alle `add*`-Funktionen über eine gemeinsame Prüfung führen. Zusätzlich ein Test: „Jede Aktion erzeugt ein Dokument, das `validateDocument` besteht.“ (Property-Test mit fast-check) |
| B7 | `App.tsx:94`, `placeLine` | `lineDraft` überlebt Werkzeug- und Boardwechsel. Wird danach „Linie“ auf die Fläche gezogen, verbindet die App mit einem Anker eines anderen Boards → Fehlermeldung. | `lineDraft` bei jedem Wechsel von Werkzeug oder Board zurücksetzen. Während des Entwurfs eine Vorschaulinie zum Mauszeiger zeigen. |
| B8 | `App.tsx:743-763` | Werden mehrere Karten gezogen, wird nur die gezogene Karte in eine Spalte einsortiert. Die anderen bleiben mit `columnId` „halb drin“ und springen beim nächsten Neuanordnen zurück. | `settleCardDrop` für alle ausgewählten Karten aufrufen, in der Reihenfolge ihrer y-Position. |
| B9 | Speichern | „Speichern“ ist ein manueller Schritt, die Sicherung landet nur im Datenordner. Milanote speichert immer automatisch. Laien verlieren hier Arbeit oder sind verunsichert. | Optional (Standard: an) automatisch in die geöffnete Datei speichern. Ohne Datei: Bibliothek im Datenordner (siehe D „Boards-Startseite“). |
| B10 | `main/index.ts` (Öffnen) | `currentPath` wird gesetzt, bevor der Renderer das Dokument geprüft hat. Lehnt der Renderer es ab, zeigt Strg+S trotzdem auf die fremde Datei. | Den Pfad erst nach erfolgreichem Laden bestätigen (zweistufig: `open` → `confirmOpened`). |
| B11 | `App.tsx:414-421` | `loadJson` enthält toten Code: Der `try`-Block setzt `theme` in allen Zweigen auf denselben Wert. | Aufräumen. |
| B12 | `cards.tsx:41-69` | `setCardLookup` ist ein globales, veränderliches Singleton, das beim Rendern gesetzt wird. Das ist fehleranfällig (veraltete Werte, keine Isolation in Tests), und jede Karte rendert bei jeder Änderung neu. | React-Context oder Zustand-Store (z. B. Zustand/Jotai), Karten mit `memo` und Selektoren pro Karte. |
| B13 | `SidePanel.tsx`, Connector-Code | `SidePanel` wird nirgends benutzt. `connect`, `Handles`, `toEdges` und `connectors` sind Altlasten aus Version 0.2. | Entfernen bzw. beim Laden in Linien umwandeln. |
| B14 | `App.tsx:126-134` | `dragover` und `drop` werden global unterdrückt. Damit können Bilder aus dem Explorer **nie** auf die Fläche gezogen werden (siehe D1). | Dateien in `onDrop` auswerten (siehe D1). |
| B15 | Strg+Z im Kartentext | Während der Bearbeitung ist Rückgängig gesperrt (Knöpfe ausgegraut). Strg+Z wirkt nur auf den Browser-Verlauf des Textfelds. Klickt man danach weg, ist der alte Text nur noch als Ganzes zurückholbar. | Akzeptabel. Die Knöpfe sollten dann aber nicht ausgegraut sein, sondern im Textfeld rückgängig machen. |
| B16 | Spaltengriff | Die Spaltenbreite hat einen eigenen 12-px-Griff oben rechts **und** zusätzlich den `NodeResizer`. Zwei Wege, die sich unterschiedlich verhalten. | Nur ein Griff (rechte Kante über die ganze Höhe). |
| B17 | `addTodoItem` | Die Höhe der Liste wächst, schrumpft aber beim Löschen nie. | Höhe aus dem Inhalt ableiten (wie A11). |

---

## C. Bedienbarkeit und Feinschliff nach Bereich

### C1 Werkzeugleiste (links)
- **Beschriftungen fehlen.** Milanote zeigt unter jedem Symbol ein Wort („Note“, „Link“, „To-do“ …). Bei FocusBoard gibt es nur ein `title`, das erst nach einer Sekunde erscheint. → Unter jedes Symbol ein kurzes Wort in 11 px setzen, die Leiste auf 84–92 px verbreitern.
- **Zwei gleiche „H“-Symbole** für große und kleine Überschrift. → Ein Werkzeug „Text“ (Überschrift, Unterüberschrift und Fließtext als Formatwahl auf der Karte), oder klar unterscheidbare Symbole „H1“/„H2“.
- **Die Notiz ist ein schwarzes Quadrat.** → Symbol mit umgeknickter Ecke, in der aktuellen Notizfarbe.
- **Die Notizfarbe wählt man erst nach dem Anlegen.** → Ein kleiner Farbpunkt am Notiz-Werkzeug, Klick öffnet die Auswahl. Die zuletzt gewählte Farbe bleibt.
- **Unterboard und Sticker sind unter „Mehr“ versteckt** (und das Menü ist kaputt, siehe A2). Das Unterboard ist in Milanote das zentrale Werkzeug. → Unterboard als eigenes Werkzeug ganz oben, Sticker in ein eigenes Werkzeug „Sticker“ mit Palette.
- **Werkzeug bleibt nicht aktiv.** Nach einer Spalte oder Liste springt die Leiste auf „Auswahl“, nach einer Linie auch. Das ist gut, sollte aber einheitlich sein. Zusätzlich: Doppelklick auf ein Werkzeug hält es aktiv (Mehrfach-Platzieren), wie in Figma.
- **Tastenkürzel pro Werkzeug** (N Notiz, T Text, B Board, L Linie, I Bild, C Spalte, D Aufgaben, V Auswahl) und im Tooltip anzeigen: „Notiz (N)“.
- **Ziehen aus der Leiste**: Das Vorschaubild ist ein weißes Kästchen mit dem Wort. → Eine echte Kartenvorschau in Originalgröße und halbtransparent, wie Milanote.

### C2 Notizen und Text
- Höhe wächst automatisch mit (A11), leere Notizen verschwinden (A10).
- **Formatierung fehlt völlig:** fett, kursiv, durchgestrichen, Aufzählung, nummerierte Liste, Checkbox-Zeile, Link, Code. Milanote hat eine kleine schwebende Format-Leiste. → Editor auf TipTap/ProseMirror oder Lexical umstellen, als Format Markdown oder ProseMirror-JSON. Mindestens Markdown-Kürzel (`**fett**`, `- Liste`) beim Tippen umwandeln.
- **Links im Text** sind nicht klickbar. → URLs erkennen und mit Strg+Klick im Browser öffnen (`shell.openExternal` mit Positivliste `http(s)`).
- **Schrift Patrick Hand für alles** ist verspielt, bei langen Texten aber schwer lesbar. → Schrift pro Karte oder global wählbar (Handschrift / Sans / Serif / Mono).
- **Bearbeiten startet erst bei Doppelklick.** In Milanote reicht ein Klick auf eine bereits ausgewählte Karte. → „Klick auf eine ausgewählte Karte = bearbeiten“, sowie Enter (gibt es) und einfach losschreiben, wenn eine Karte ausgewählt ist.
- **Tab** im Editor springt aus der Karte. → Tab in Listen einrücken, sonst die nächste Karte.
- **Rechtschreibprüfung** ist an (`spellcheck: true`), es fehlt aber das Kontextmenü mit Vorschlägen. → `webContents.on('context-menu')` mit `dictionarySuggestions`.
- **Notizfarben:** 5 kräftige Farben. Milanote hat zusätzlich weiße bzw. neutrale Karten. Standard für eine neue Notiz sollte „Weiß“ sein, Farbe ist Hervorhebung. Kräftiges Neon-Gelb als Standard ermüdet auf großen Boards. → Palette: Weiß, Grau, Gelb, Orange, Rot, Rosa, Lila, Blau, Türkis, Grün (gedeckte Pastelltöne), mit Kontrastprüfung.

### C3 Überschriften
- Haben keinen Hintergrund und keinen Rand, im unausgewählten Zustand ist nicht erkennbar, wo man klicken kann. → Beim Überfahren mit der Maus einen dezenten Rahmen zeigen.
- Text läuft bei schmaler Karte in einen Scrollbalken. → Höhe automatisch (A11).

### C4 Aufgabenlisten
- Fehler A3, A4, A5 beheben.
- Viel Leerraum über dem Titel „Zu tun“ (siehe Bildschirmfoto). → Abstand oben auf 8–12 px reduzieren.
- **Native Checkboxen** sehen nach Formular aus. → Eigene runde Haken im Stil der App, mit größerer Trefferfläche (mindestens 24 px).
- Fortschritt „1/2“ in 13 px grau. → Fortschrittsbalken oder „1 von 2 erledigt“, erledigte Einträge optional ausblenden oder nach unten sortieren.
- **Einträge lassen sich nicht umsortieren.** → Ziehen am Griff links, Alt+↑/↓.
- **Fälligkeitsdatum und Zuständigkeit** fehlen. Milanote hat Datum pro Aufgabe. → Optionales Datum, überfällige Einträge rot.
- **Einfügen mehrerer Zeilen** (z. B. eine Liste aus einer E-Mail) soll pro Zeile einen Eintrag anlegen.
- Die Liste lässt sich nur am schmalen Rand ziehen, weil alle Felder `nodrag` sind. → Ein sichtbarer Ziehgriff in der Kopfzeile oder Ziehen ab 4 px Bewegung, Klick ohne Bewegung = Text bearbeiten.

### C5 Spalten
- Der Zuklapp-Knopf ist ein grauer Standard-Knopf (▾). → Eigenes Symbol, flach, gleiche Farbe wie der Titel.
- Leere Spalten zeigen keinen Hinweis. → „Karten hierher ziehen“ als blasser Text in leeren Spalten.
- **Spalten-Farbe** fehlt (Milanote kann Spalten einfärben).
- **Zugeklappte Spalte** zeigt nicht, wie viele Karten sie enthält. → „Spalte · 4 Karten“.
- Beim Einsortieren erscheint nur ein 3-px-Strich. → Zusätzlich die Lücke öffnen (Karten rücken auseinander), so ist klar, wo die Karte landet.
- Spalten in Spalten sind verboten, das ist richtig. Es fehlt aber der Hinweis, wenn man es versucht.

### C6 Linien und Pfeile
- Fehler A6, A13, B7 beheben.
- **Endpunkte lassen sich nach dem Zeichnen nicht mehr verschieben.** `updateLine` unterstützt `source` und `target` schon, die Oberfläche nutzt es nicht. → Runde Griffe an beiden Enden, Ziehen dockt neu an.
- **Gebogene Linien** fehlen (Milanote: Mittelpunkt ziehen = Kurve). → Ein Kontrollpunkt in der Mitte, Bezier-Kurve.
- **Linienstil:** Stärke (dünn/mittel/dick), gestrichelt, Pfeil an Anfang/Ende/beiden.
- **Beschriftung auf der Linie** („führt zu“, „blockiert“) fehlt.
- Während der Zeichnung mit zwei Klicks gibt es keine Vorschau. → Gummiband-Linie zum Mauszeiger.
- Linien sind nicht Teil der Rechteck-Auswahl und bewegen sich bei freien Endpunkten nicht mit. → Linien mit auswählen und gemeinsam verschieben.
- Die Linien-Leiste mischt Farbfelder mit Text-Knöpfen („Pfeil“, „Löschen“) im Standard-Stil. → Einheitliche Symbol-Knöpfe.

### C7 Bilder
- **Nur über den Dateidialog.** Ziehen aus dem Explorer, Einfügen aus der Zwischenablage und Bild-URLs fehlen (D1).
- **Das Seitenverhältnis wird ignoriert:** Jedes Bild startet als 280×210 mit `object-fit: contain`, also mit Rändern. → Beim Einfügen die echten Maße lesen, Seitenverhältnis halten, beim Größenändern Shift oder immer proportional (`keepAspectRatio` im `NodeResizer`).
- Dicker Rahmen (8 px Innenabstand + Karte). → Bilder randlos mit abgerundeten Ecken, wie in Milanote.
- **Bildunterschrift** fehlt. → Optionale Zeile unter dem Bild.
- **Vollbild-Ansicht** fehlt. → Doppelklick öffnet eine Lightbox mit Zoom.
- **SVG, HEIC und AVIF** werden nicht unterstützt, und die Grenze von 8 MB ist bei Handyfotos schnell erreicht. → Beim Einfügen automatisch verkleinern (z. B. auf 2560 px lange Kante, WebP), das Original optional behalten.
- Bilder liegen als base64 in der JSON-Datei. Das macht die Dateien groß und langsam (B1). → Mittelfristig ein Ordnerformat oder ZIP (`.focusboard` mit `board.json` + `assets/`).

### C8 Unterboards
- **Doppelklick bearbeitet den Titel, statt das Board zu öffnen** (geprüft). In Milanote öffnet ein Doppelklick bzw. Klick das Board. → Doppelklick = öffnen, Titel ändern über F2 oder Klick auf den Titel.
- **Die Karte zeigt nicht, was drin ist.** → Symbol mit Farbe/Emoji, Anzahl der Karten, kleine Vorschau der ersten Inhalte.
- **Der Knopf „Öffnen“** wirkt technisch. → Die ganze Karte ist klickbar, ohne eigenen Knopf.
- **Karten in ein Unterboard ziehen** (Drag auf die Board-Karte) fehlt. In Milanote ist das der Hauptweg zum Aufräumen. → Beim Überfahren hervorheben, beim Loslassen die Karte ins Unterboard verschieben.
- **Zurück-Navigation:** Mit Alt+← oder den Maus-Seitentasten zurück, mit Rücktaste/Escape im leeren Zustand eine Ebene hoch.
- **Ansicht pro Board** wird gespeichert, gut. Beim ersten Öffnen eines vollen Boards sollte aber „Alles anzeigen“ greifen, nicht 0/0/100 %.

### C9 Kopfzeile, Navigation, Zoom
- **Der Board-Titel ist ein Eingabefeld mit Rahmen**, das wirkt wie ein Formular. → Als Text darstellen, beim Klick bearbeitbar machen. Enter übernimmt, Escape bricht ab (A8).
- **„Zurück“ ist auf dem Hauptboard sichtbar, aber ausgegraut.** → Ausblenden oder als Pfeil-Symbol vor den Pfad setzen.
- **Pfad (Breadcrumb):** Die Trennzeichen „/“ und die eckigen Knöpfe sehen technisch aus. → „Hauptboard › Projekt › Ideen“ mit Text-Links, lange Pfade mit „…“ kürzen.
- **„Dunkel/Hell“ als Wort** neben Symbol-Knöpfen ist uneinheitlich. → Sonne/Mond-Symbol, oder in die Einstellungen verschieben.
- **„Datei“-Menü** doppelt das native Menü. → Entweder native Menüleiste oder ein App-Menü (Hamburger), nicht beides.
- **Zoom-Feld:** „100 %“ als Anzeige steht direkt neben dem Knopf „100 %“. Das ist verwirrend, und das Feld ist mit 7 Teilen sehr breit. → `−  [100 % ▾]  +` mit Aufklappliste (50 / 100 / 200 / Alles anzeigen / Auswahl anzeigen). Tastatur: Strg+0 = 100 %, Strg+1 = Alles, Strg+2 = Auswahl, Strg+Plus/Minus.
- **Minikarte** fehlt (React Flow hat `<MiniMap>`), besonders hilfreich bei großen Boards. Ausblendbar.
- **Verschieben der Fläche:** nur mittlere Maustaste oder Leertaste. Milanote verschiebt mit Ziehen auf leerer Fläche, die Rechteckauswahl läuft mit Shift oder ab einer Ecke. → Einstellung „Ziehen auf leerer Fläche: Verschieben / Auswählen“. Laien kennen die Leertaste nicht.
- **Raster und Einrasten** fehlen völlig (Hilfslinien beim Ausrichten an anderen Karten wie in Figma/Milanote). → Magnetische Hilfslinien an Kanten und Mitten anderer Karten, ein dezentes Punkteraster optional.
- **„Keine Animationen“** als Prinzip ist zu hart (`* { transition: none !important }`). Ohne jede Bewegung wirkt die App sprunghaft (Zoom springt, Menüs springen). → Kurze Übergänge (80–150 ms) für Zoom, Menüs und Hover. Für Menschen, die Bewegung meiden, `@media (prefers-reduced-motion: reduce)` beachten.

### C10 Dunkles Thema
- Reines Schwarz `#000` als Fläche ist sehr hart, auf OLED kommt es zum Schmieren beim Verschieben. → `#121212`–`#1a1a1a`, Karten etwas heller.
- Die Notizfarben bleiben im Dunkeln grell (Neon auf Schwarz). → Eigene, gedämpfte Varianten für das dunkle Thema.
- Der Zuklapp-Knopf der Spalte ist grau auf schwarz und sieht ausgeschaltet aus.
- Das Logo wird im Hellen per `filter: invert(1)` umgefärbt. → Zwei echte Varianten als SVG.

### C11 Rückmeldungen und Fehler
- **Fehlermeldungen erscheinen als Balken über der Fläche** und schieben die Fläche nach unten (die Fläche springt). → Toast unten mittig, schließt sich nach 5 s von selbst, bei Löschungen mit Knopf „Rückgängig“ (wie Milanote „Karte gelöscht · Rückgängig“).
- **Löschen ohne Rückmeldung:** Entf löscht sofort. Das ist richtig, aber ein Toast mit „Rückgängig“ gibt Sicherheit.
- **Leeres Board** zeigt nichts. → Einen freundlichen Hinweis in der Mitte: „Doppelklick, um eine Notiz anzulegen · Ziehe Werkzeuge von links · Bilder einfach hineinziehen“.
- **Ersteinführung / Hilfe** fehlt. → Eine Übersicht der Tastenkürzel (`?` oder F1) und ein Beispiel-Board „Erste Schritte“ beim ersten Start.

### C12 Tastatur und Barrierefreiheit
- Viele Kürzel fehlen (siehe B-Liste in D). Pfeiltasten verschieben Karten bereits, gut. → Shift+Pfeil = 10 px.
- **Tab-Reihenfolge** auf der Fläche folgt der Reihenfolge des Anlegens, nicht der Position. → Nach Position sortieren (oben-links → unten-rechts).
- `aria-label` der Sticker sind englische Schlüssel („star“, „thumbs“), die der Farbknöpfe auch („yellow“). → Deutsche Namen: „Stern“, „Daumen hoch“, „Gelb“ …
- **Fokusrahmen** sind orange (3 px), gut. Auf orangen Notizen ist der Rahmen aber unsichtbar. → Doppelter Rahmen (dunkel + hell).
- **Kontrast:** `--muted #5c5146` auf `#fff7ea` ist knapp okay. Die 12-px-Speicheranzeige ist zu klein. → mindestens 13 px.

---

## D. Fehlende Werkzeuge und Funktionen (Vergleich mit Milanote)

Priorität: **P1** = muss vor einer Weitergabe an andere drin sein · **P2** = macht die App rund · **P3** = Kür.

### D1 Grundgesten (P1, alles fehlt heute)
| Funktion | Erwartung |
|---|---|
| **Kopieren / Ausschneiden / Einfügen** | Strg+C/X/V für ausgewählte Karten (inkl. Bilder, Linien zwischen ihnen), auch zwischen Boards. Einfügen an der Mausposition. |
| **Duplizieren** | Strg+D oder Alt+Ziehen. |
| **Alles auswählen** | Strg+A (siehe A7). |
| **Rechtsklick-Menü** | Auf Karten: Bearbeiten, Farbe, Duplizieren, Kopieren, In Unterboard verschieben, Nach vorne/hinten, Sperren, Löschen. Auf leerer Fläche: Einfügen, Notiz hier, Alles auswählen. Heute wird das Kontextmenü nur unterdrückt (`BoardCanvas.tsx:333`). |
| **Bilder hineinziehen** | Dateien aus dem Explorer auf die Fläche ziehen (mehrere gleichzeitig, als Raster anordnen). |
| **Einfügen aus der Zwischenablage** | Strg+V mit Bild (Screenshot) → Bildkarte. Strg+V mit Text → Notiz. Mit URL → Link-Karte. |
| **Ebenen-Reihenfolge** | Nach vorne / nach hinten. Heute haben alle Karten zIndex 2. |
| **Mehrfachauswahl bearbeiten** | Farbe ändern geht schon für Notizen. Es fehlen Ausrichten (links/mittig/oben), Verteilen, Gleiche Breite. |
| **Sperren** | Hintergrundbilder oder Überschriften fixieren, damit man sie nicht versehentlich verschiebt. |

### D2 Neue Kartentypen / Werkzeuge
| Werkzeug | Prio | Beschreibung |
|---|---|---|
| **Link** | P1 | URL einfügen → Karte mit Titel, Beschreibung und Vorschaubild (Open-Graph im Hauptprozess laden, mit Zeitlimit, ohne Cookies). Klick öffnet im Browser. Ohne Internet: nur die URL. |
| **Datei / Anhang** | P1 | PDF, DOCX, ZIP usw. als Karte mit Symbol, Name und Größe. Doppelklick öffnet mit dem Standardprogramm. PDFs mit Vorschau der ersten Seite. |
| **Farbfeld (Swatch)** | P2 | Farbmuster mit HEX-Wert, typisch für Moodboards in Milanote. Klick kopiert den HEX-Wert. |
| **Freihand-Zeichnen / Skizze** | P2 | Stift-Werkzeug mit 3 Stärken und Farben, Radierer. Als eigene Karte (Skizzenfläche) oder direkt auf dem Board. Wichtig für Touch-/Stift-Geräte (Surface). |
| **Kommentar** | P2 | Kleine Sprechblase an einer Karte, für Notizen an sich selbst („nachfragen!“). |
| **Tabelle** | P2 | Einfaches Raster mit Zeilen/Spalten, Tab springt weiter. |
| **Formen** | P2 | Rechteck, Kreis, Raute, Wolke, um Bereiche zu gruppieren oder Ablaufdiagramme zu zeichnen. Mit Text in der Form. |
| **Rahmen / Bereich** | P2 | Ein beschrifteter Rahmen, der alles Darin beim Verschieben mitnimmt (ähnlich Spalte, aber frei). |
| **Video / Audio** | P3 | Lokale Datei oder YouTube-Link mit Vorschaubild, abspielbar. |
| **Sprachnotiz** | P3 | Aufnahme mit Mikrofon, als Audio-Karte. |
| **Code-Block** | P3 | Mit Syntaxhervorhebung und Kopierknopf. |
| **Karten-Datum / Erinnerung** | P3 | Datum an einer Karte, Übersicht „Fällig“. |
| **Emoji-Sticker** | P3 | Statt 5 fester Sticker: Emoji-Auswahl (Windows: Win+.) und eigene PNG-Sticker. |

### D3 Organisation
| Funktion | Prio | Beschreibung |
|---|---|---|
| **Suche** | P1 | Strg+F durchsucht alle Boards (Notizen, Titel, Listen, Links), Treffer anklicken springt hin und hebt hervor. |
| **Boards-Startseite / Bibliothek** | P1 | Beim Start eine Übersicht der zuletzt geöffneten Boards mit Vorschaubild, statt immer einer leeren Fläche. „Zuletzt verwendet“ auch im Datei-Menü. |
| **Automatisches Speichern** | P1 | Siehe B9. |
| **Vorlagen** | P2 | Moodboard, Projektplan, Kanban (3 Spalten), Wochenplan, Mindmap, Brainstorming, Lernplan. Milanote lebt stark von Vorlagen. |
| **Papierkorb** | P2 | Gelöschte Unterboards 30 Tage aufheben und wiederherstellen. |
| **Export** | P2 | Als PNG/PDF (ganzes Board oder Auswahl), als Markdown (Text + Listen), Drucken. |
| **Import** | P3 | Markdown/Text-Liste → Notizen, Bilderordner → Raster, Milanote-Export (ZIP mit Markdown/Bildern), Trello-JSON. |
| **Versionsverlauf** | P3 | Automatische Schnappschüsse (stündlich/täglich) mit Wiederherstellen. Die vorhandene Sicherungsdatei ist ein guter Anfang. |
| **Verknüpfungen zwischen Boards** | P3 | Eine Karte, die auf ein anderes Board verweist (ohne es zu verschachteln). |
| **Tags / Labels** | P3 | Farbige Etiketten an Karten, Filter danach. |

### D4 Desktop-Integration (P2)
- Dateiendung `.focusboard` registrieren, Doppelklick im Explorer öffnet das Board, Pfad als Startargument, `app.requestSingleInstanceLock` für die zweite Instanz.
- Mehrere Fenster bzw. Tabs für mehrere Boards.
- Fensterposition und -größe merken.
- Automatische Updates (electron-updater) und eine Code-Signatur (SmartScreen-Warnung, siehe README).
- Einstellungen-Dialog: Thema, Schrift, Standardfarbe, automatisches Speichern, Verhalten beim Ziehen auf leerer Fläche, Sprache.

### D5 Später: Synchronisation und Zusammenarbeit (P3)
Milanote ist ein Cloud-Dienst. Für FocusBoard (lokal, ohne Konto) reicht zuerst: Dateien in einem Sync-Ordner (OneDrive/Dropbox) ablegen und Konflikte erkennen (Änderungszeit prüfen, beim Speichern warnen: „Die Datei wurde außerhalb geändert“). Echte Zusammenarbeit (CRDT, z. B. Yjs) erst, wenn das Kernprodukt sitzt.

---

## E. Technik und Qualität

1. **Zustand und Rendering:** Den Dokumentzustand in einen Store auslagern (Zustand oder `useSyncExternalStore`). Karten mit `React.memo` und je eigenem Selektor rendern. Heute rendert jede Änderung alle Karten neu, und `lookup` wird bei jeder Änderung neu gebaut (`App.tsx:438-524`).
2. **App.tsx (921 Zeilen) aufteilen:** `useHistory`, `useAutosave`, `useShortcuts`, `useClipboard`, `Toolbar`, `TopBar`, `SelectionToolbar`.
3. **Befehlsschicht:** Jede Aktion als Befehl (`{ id, label, shortcut, run, enabled }`). Menü, Tastenkürzel, Kontextmenü und Befehlspalette (Strg+K) nutzen dieselbe Liste. Das behebt B5 nebenbei.
4. **Eingabe-Erkennung zentral:** Eine Funktion `isTypingTarget(event)`, die `input`, `textarea` und `contenteditable` erkennt, für alle Tastenkürzel (A8).
5. **Dateiformat:** Bilder aus dem JSON lösen (ZIP-Container oder Ordner). Beim Laden Migrationen versionieren (3 → 4).
6. **Tests ergänzen** (die Testbasis ist gut, aber deckt die Fehler oben nicht ab):
   - Ein Unit-Test pro Fehler in A (Regressionstests).
   - Property-Test: zufällige Folge von Aktionen → `validateDocument` ist immer ok, Rückgängig/Wiederholen ergibt wieder den Ausgangszustand.
   - E2E: Zwischenablage, Dateien hineinziehen, Kontextmenü, Strg+A, Wiederherstellen und Weiterarbeiten.
   - Leistungstest: 400 Karten + 10 Bilder, Tippen mit < 16 ms pro Taste.
   - Bildvergleich (Playwright `toHaveScreenshot`) für Hell/Dunkel.
7. **Abhängigkeiten:** `npm audit` meldet 7 Schwachstellen (5 mittel, 2 hoch), prüfen und aktualisieren.
8. **Auf echter Windows-Hardware testen** (steht so auch in `BAU_UND_TESTS.md`): Touchpad-Gesten, Stift, 150 % Skalierung, mehrere Monitore.

---

## F. Vorschlag für die Reihenfolge

| Etappe | Inhalt | Ergebnis |
|---|---|---|
| **0.4.1 – Stabil** | A1–A13, B4, B6, B7, B10 | Keine bekannten Fehler, kein Datenverlust. |
| **0.5 – Fühlt sich richtig an** | D1 komplett (Zwischenablage, Kontextmenü, Bilder ziehen/einfügen), Auto-Höhe, Werkzeugleiste mit Beschriftung, Toasts mit Rückgängig, B1–B3 (Tempo) | Grundgesten wie in jeder Board-App. |
| **0.6 – Milanote-Gefühl** | Link-Karte, Datei-Karte, Unterboard-Vorschau + Karten in Boards ziehen, Linien-Griffe und Kurven, Textformatierung, Hilfslinien, Startseite mit zuletzt verwendeten Boards, automatisches Speichern | Ernsthaft nutzbar für Projekte. |
| **0.7 – Mehr Werkzeuge** | Suche, Vorlagen, Export PNG/PDF, Formen, Zeichnen, Farbfeld, Kommentar, Tabelle | Funktionsumfang nahe Milanote (ohne Cloud). |
| **1.0** | Dateizuordnung, Updates, Signatur, Einstellungen, Papierkorb, Barrierefreiheit geprüft | Weitergabe an andere. |

---

## G. Abnahme-Checkliste („es muss einfach funktionieren“)

Vor jeder Version einmal von Hand oder automatisiert durchgehen:

- [ ] App abstürzen lassen (Prozess beenden) → nach dem Neustart ist alles bis maximal 2 s vor dem Absturz wieder da, auch wenn beim vorigen Start der Wiederherstellen-Hinweis ignoriert wurde.
- [ ] 30 Zeilen in eine Notiz → die Karte wächst mit, kein Scrollbalken.
- [ ] Liste: 10× Enter tippen → jeder Eintrag landet in der richtigen Zeile; alle löschen → man kann sofort wieder tippen.
- [ ] Liste in Spalte wachsen lassen → nichts überlappt.
- [ ] Linie markieren → Klick daneben, Escape oder Boardwechsel blendet die Leiste aus; Entf löscht die Linie.
- [ ] Strg+A, Strg+C, Strg+V, Strg+D, Entf, Strg+Z/Y funktionieren auf Karten, auch über das Menü „Bearbeiten“.
- [ ] Bild aus dem Explorer ziehen und Screenshot mit Strg+V einfügen → Bildkarte im richtigen Seitenverhältnis.
- [ ] „Mehr“ bzw. alle Menüs sind bei 1024×680 und bei 150 % Skalierung vollständig sichtbar und klickbar.
- [ ] Thema umschalten → kein Eintrag im Rückgängig-Verlauf, Datei bleibt „gespeichert“.
- [ ] Board mit 10 Bildern à 5 MB → Tippen ohne spürbare Verzögerung.
- [ ] Speichern während der Datenträger voll ist → Fehlermeldung, alte Datei unbeschädigt.

---

### Anhang: So wurde geprüft
- `npm test` (33 bestanden), `npm run build`, die vorhandenen Playwright-Tests mit Electron (9 bestanden).
- Ein eigenes Prüfskript (nicht eingecheckt) hat die Abläufe aus Abschnitt A in der echten App nachgestellt und Bildschirmfotos gemacht (Hell, Dunkel, Liste in Spalte, lange Notiz, Linien-Leiste auf leerem Unterboard, leere Liste, „Mehr“-Menü).
- Laufzeitmessung von `JSON.stringify`/`structuredClone` mit drei 8-MB-Bildern unter Node 22.

### Anhang: Bildschirmfotos (`docs/feedback-0.4/`)
| Datei | Zeigt |
|---|---|
| `demo-light.png` / `demo-dark.png` | Ausgangszustand, Linie unter den Karten (A13), Werkzeugleiste ohne Beschriftung (C1), Zoom-Feld (C9) |
| `more-menu.png` | „Mehr“-Menü abgeschnitten, Scrollbalken unten links (A2) |
| `column-todo-overlap.png` | Liste in Spalte von Notiz überdeckt (A5) |
| `note-long.png` | Scrollbalken in Notiz (A11), leere Notiz mit Platzhalter (A10), Strg+A markiert die Oberfläche (A7) |
| `todo-empty.png` | Liste mit 0 Einträgen, nicht mehr befüllbar (A3) |
| `subboard-stale-toolbar.png` | Linien-Leiste auf leerem Unterboard (A6) |
