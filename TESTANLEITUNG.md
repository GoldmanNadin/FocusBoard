# Testanleitung Version 0.4.0

Kurze Prüfung für PC und Laptop, mit Maus und Tastatur. Die Fläche ist weiß oder schwarz, ohne Raster. Nur die Karten sind farbig. Es gibt keine Animationen. Die Bedienung aus 0.3 ist unverändert. Neu ist nur der Name FocusBoard und das Logo.

Die Datei `FocusBoard-Setup-0.4.0.exe` ist nicht signiert. Windows kann warnen: Weitere Informationen, dann Trotzdem ausführen. Es wurde kein Zertifikat gekauft. Installiert wird `FocusBoard.exe`. Startmenü, Desktop-Verknüpfung und der Eintrag zum Entfernen heißen FocusBoard. Eine vorhandene Installation von 0.3 wird ersetzt, nicht doppelt angelegt. Die automatische Sicherung bleibt im Datenordner `Digitales Whiteboard`.

## Name und Zeichen

1. Oben links steht das Brett-Zeichen und der Name FocusBoard. Im hellen Thema ist das Zeichen dunkel, im dunklen hell. Ein Klick darauf springt zum Hauptboard.
2. Die Fenstertitelzeile nennt FocusBoard. Hilfe, Über FocusBoard zeigt den Namen, die Version 0.4.0 und die MIT-Lizenz.
3. Das Programm- und Installer-Symbol ist das Brett ohne das Wort FocusBoard. Unter Linux wurde geprüft, dass die Größen 16, 24, 32, 48, 64, 128 und 256 im Symbol stecken und die EXE sie einbettet. Ob Windows den Symbol-Cache sofort aktualisiert, ist hier nicht geprüft.

Diese Fassung wurde unter Linux gebaut. Nicht auf Windows-Hardware geprüft: echte Maus, Touchpad, SmartScreen, Installation auf dem PC, Startmenü, Desktop-Verknüpfung, Monitorwechsel bei laufender App, Windows-Skalierung 100 %, 150 % und 200 %.

## Werkzeug auf die Fläche ziehen

Links liegen Auswahl, Notiz, große Überschrift, kleine Überschrift, Bild, Spalte, Aufgaben, Linie und Mehr. Mehr enthält nur Unterboard und die Sticker. Spalte, Aufgaben und Linie sind eigene Knöpfe, nicht unter Mehr.

Unten rechts: 50 %, 100 %, 200 % und Alles. Verschieben: mittlere Maustaste, oder Leertaste halten und ziehen. Mausrad senkrecht, Umschalt plus Mausrad seitlich, Strg plus Mausrad zoomt an der Maus.

1. Zoom auf 50 %, 100 % und 200 % stellen, die Fläche dazwischen verschieben, und jedes Mal eine Notiz aus der linken Leiste auf die Fläche ziehen. Die Karte sitzt dort, wo der Zeiger losgelassen wurde. Zoom und Verschieben verrücken den Punkt nicht.
2. Nach dem Loslassen steht der Cursor sofort in Notiz oder Überschrift. Tippen, auch Ä, Ö, Ü und ß. Escape beendet das Schreiben. Klick auf das Werkzeug und danach auf die Fläche bleibt möglich.
3. Bild aus der Leiste auf die Fläche ziehen. Es öffnet sich der Dateidialog an dieser Stelle. Abbrechen lässt keine leere Bildkarte zurück.
4. Eine Datei vom Desktop auf das Fenster ziehen öffnet nichts.

## Linie

Linie aus der Leiste ziehen oder das Werkzeug wählen. Der erste Punkt setzt den Anfang, der nächste Klick das Ende. Stattdessen kann man auf der Fläche ziehen und die Linie direkt zeichnen. Escape bricht einen offenen Anfang ab und legt nichts an.

Liegt ein Ende nah an einer Kartenkante, dockt es an. Es folgt, wenn die Karte gezogen oder in der Größe geändert wird, und wenn die Spalte mit der Karte wandert. Sonst bleibt das Ende frei auf der Fläche. Es entsteht keine extra Karte als Ende.

Grenze: Ein freies Ende lässt sich danach nicht anfassen und verschieben. Neu setzen geht nur mit zwei Klicks oder einem neuen Zug.

Eine Linie anklicken. Die Farben und der Schalter Pfeil erscheinen. Löschen entfernt nur die Linie. Rückgängig und Wiederholen stellen Farbe, Pfeil und die Linie wieder her.

## Spalte

1. Spalte auf die Fläche ziehen. Karten hineinziehen. Ein Strich zeigt, wo sie einsortiert wird. Herausziehen legt sie wieder frei auf die Fläche.
2. Die Spalte nur am Kopf ziehen. Die Karten darin fahren mit. Am rechten Rand des Kopfes die Breite ändern.
3. Zuklappen blendet die Karten aus und löscht sie nicht. Linien zu diesen Karten bleiben gültig. Aufklappen holt die Karten zurück.
4. Eine Spalte in eine Spalte ziehen geht nicht. Ein Unterboard bleibt ein eigener Weg über den Pfad und darf auf demselben Board in einer Spalte stehen.
5. Die Spalte löschen. Die Karten bleiben auf der Fläche und werden nicht mitgelöscht.

Ein Hineinziehen, Umsortieren oder Herausziehen ist ein Schritt für Rückgängig.

## Aufgaben

Aufgabenkarte ziehen. Den Titel ändern. In einem Eintrag Enter drücken: der nächste Eintrag entsteht. Ein Haken streicht den Text durch. Oben steht der Stand, zum Beispiel 2/5. Haken und Text sind keine Ziehpunkte. Anlegen, Text, Haken und Löschen eines leeren Eintrags mit der Rücktaste gelten für Rückgängig und Wiederholen.

## Rückgängig, Sichern, alte Datei

Rückgängig und Wiederholen, oder Strg+Z und Strg+Y, gelten für die neuen Schritte: abgelegte Karten, Linien, Spalten und Aufgaben. Während der Cursor in einem Text steht, gilt Strg+Z nur für diesen Text. Der Verlauf wird beim Beenden nicht mitgespeichert.

Datei, Speichern schreibt die gewählte JSON-Datei weiter im Format Version 3. Zusätzlich sichert die App eine Kopie nur in ihrem Datenordner `Digitales Whiteboard`. Diese Kopie überschreibt die gewählte Datei nicht. Nach einem Abbruch: Wiederherstellen oder Verwerfen.

Eine Datei aus Version 0.2 öffnen. Die Notizen bleiben. Alte Pfeile werden zu Linien. Eine Datei aus Version 0.1 öffnet die Textkarten als gelbe Notizen.

## Nicht enthalten

Kein Stift. Kein PDF. Kein Abgleich zwischen Geräten. Kein nachträgliches Ziehen eines freien Linienendes. Die EXE ist nicht signiert und hier nicht auf Windows-Hardware gelaufen.
