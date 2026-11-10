import { codePointLength, normalizeCardText } from '../../../shared/text';
import { MAX_TEXT_LENGTH } from '../../../shared/limits';

export function SidePanel({
  text,
  boardTitle,
  armed,
  imageBusy,
  onTextChange,
  onBoardTitleChange,
  onInsertTextCenter,
  onArmText,
  onInsertBoardCenter,
  onArmBoard,
  onPickImage,
  onCancelArm,
}: {
  text: string;
  boardTitle: string;
  armed: 'text' | 'board' | null;
  imageBusy: boolean;
  onTextChange: (value: string) => void;
  onBoardTitleChange: (value: string) => void;
  onInsertTextCenter: () => void;
  onArmText: () => void;
  onInsertBoardCenter: () => void;
  onArmBoard: () => void;
  onPickImage: () => void;
  onCancelArm: () => void;
}) {
  const textState = normalizeCardText(text);
  const count = codePointLength(text);
  return (
    <aside className="rail">
      <p className="rail-kicker">Neue Karte</p>
      <section className="rail-section">
        <h2>Textkarte</h2>
        <label htmlFor="card-text">Text, der auf der Karte steht</label>
        <textarea
          id="card-text"
          lang="de"
          value={text}
          placeholder="Zum Beispiel: Begriffe, Fragen oder ein kurzer Gedanke …"
          onChange={(event) => onTextChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              event.stopPropagation();
              onInsertTextCenter();
            }
          }}
        />
        <p className={count > MAX_TEXT_LENGTH ? 'field-error' : 'field-hint'}>
          {count} / {MAX_TEXT_LENGTH}
          {!textState.ok && text.trim().length > 0 ? ` · ${textState.error}` : ''}
        </p>
        <div className="button-row">
          <button type="button" className="btn primary" disabled={!textState.ok} onClick={onInsertTextCenter}>
            In der Mitte einfügen
          </button>
          <button
            type="button"
            className="btn ghost"
            disabled={!textState.ok}
            aria-pressed={armed === 'text'}
            onClick={() => (armed === 'text' ? onCancelArm() : onArmText())}
          >
            {armed === 'text' ? 'Klick setzen abbrechen' : 'Per Klick setzen'}
          </button>
        </div>
        <p className="field-hint">Strg+Enter setzt die Textkarte in die Mitte.</p>
      </section>

      <section className="rail-section">
        <h2>Bildkarte</h2>
        <p className="field-hint">PNG, JPEG, GIF oder WebP, höchstens 8 MB. Das Bild wird in der Datei gespeichert.</p>
        <button type="button" className="btn primary" disabled={imageBusy} onClick={onPickImage}>
          {imageBusy ? 'Bild wird gelesen …' : 'Bildkarte aus Datei …'}
        </button>
      </section>

      <section className="rail-section">
        <h2>Unterboard</h2>
        <label htmlFor="board-title">Titel</label>
        <input
          id="board-title"
          value={boardTitle}
          placeholder="Zum Beispiel: Recherche"
          onChange={(event) => onBoardTitleChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              onInsertBoardCenter();
            }
          }}
        />
        <div className="button-row">
          <button type="button" className="btn primary" onClick={onInsertBoardCenter}>
            In der Mitte anlegen
          </button>
          <button
            type="button"
            className="btn ghost"
            aria-pressed={armed === 'board'}
            onClick={() => (armed === 'board' ? onCancelArm() : onArmBoard())}
          >
            {armed === 'board' ? 'Klick setzen abbrechen' : 'Per Klick anlegen'}
          </button>
        </div>
      </section>

      <section className="rail-help">
        <h2>So bedienst du die Fläche</h2>
        <ul>
          <li>Karte anklicken, dann mit der Maus ziehen. Ecken ändern die Größe.</li>
          <li>Entf löscht die Auswahl. Ein Unterboard fragt vorher nach.</li>
          <li>Vom Punkt am Kartenrand zu einer anderen Karte ziehen zeichnet einen Pfeil.</li>
          <li>Öffnen wechselt ins Unterboard. Zurück oder der Pfad führt wieder nach oben.</li>
          <li>Mausrad zoomt. Zwei Finger auf dem Touchpad verschieben, die Pinzetten-Geste zoomt.</li>
          <li>Leertaste halten und ziehen, oder die mittlere Maustaste, verschiebt die Fläche.</li>
          <li>Text, der noch im Feld steht, wird beim Speichern als Karte in die Mitte gelegt.</li>
        </ul>
      </section>
    </aside>
  );
}
