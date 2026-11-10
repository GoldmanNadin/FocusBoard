import { useEffect, useState } from 'react';
import { shortFolderLabel, type LibraryEntry, type PreviewCard, type PreviewLine } from '../../shared/library';

type Menu = { id: string; x: number; y: number } | null;

export function Home(props: {
  recovery: string | null;
  onOpen: (id: string) => void;
  onAdoptRecovery: () => void;
  onDismissRecovery: () => void;
}) {
  const api = window.whiteboard!;
  const [boards, setBoards] = useState<LibraryEntry[]>([]);
  const [recent, setRecent] = useState<LibraryEntry[]>([]);
  const [trash, setTrash] = useState(false);
  const [menu, setMenu] = useState<Menu>(null);
  const [folder, setFolder] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [name, setName] = useState('');

  async function reload() {
    setBoards(await api.libraryList(trash));
    setRecent(await api.libraryRecent());
    setFolder(await api.libraryFolder());
  }

  useEffect(() => {
    void reload();
    return api.onLibraryFocus(() => void reload());
  }, [trash]);

  async function create() {
    const created = await api.libraryCreate();
    if (created.ok) props.onOpen(created.id);
  }

  return (
    <div className="home" data-testid="home">
      <h2 className="home-title">{trash ? 'Papierkorb' : 'Meine Boards'}</h2>
      <div className="home-bar">
        <button type="button" data-testid="library-trash" onClick={() => setTrash((value) => !value)}>{trash ? 'Bibliothek' : 'Papierkorb'}</button>
        <button type="button" data-testid="library-folder" onClick={() => void api.libraryChoose().then(() => reload())}>Ordner</button>
        <span className="home-path" data-testid="library-path" data-path={folder} title={folder}>{shortFolderLabel(folder)}</span>
      </div>
      {props.recovery && !trash ? (
        <div className="banner" role="status" data-testid="adopt-banner">
          <span>Es gibt eine automatische Sicherung. Sie kann in die Bibliothek übernommen werden. Die Originaldatei bleibt liegen.</span>
          <button type="button" data-testid="adopt-recovery" onClick={props.onAdoptRecovery}>Übernehmen</button>
          <button type="button" onClick={props.onDismissRecovery}>Später</button>
        </div>
      ) : null}
      {!trash ? (
        <section data-testid="recent-section">
          <h2>Zuletzt verwendet</h2>
          <div className="recent-row">
            {recent.length === 0 ? <p>Noch kein Board geöffnet.</p> : recent.map((entry) => (
              <button key={entry.id} type="button" data-testid={`recent-${entry.id}`} onClick={() => props.onOpen(entry.id)}>{entry.title}</button>
            ))}
          </div>
        </section>
      ) : null}
      <section className="tile-grid" aria-label={trash ? 'Papierkorb' : 'Boards'}>
        {!trash ? (
          <button type="button" className="tile-new" data-testid="library-create" onClick={() => void create()}>+ Neues Board</button>
        ) : null}
        {boards.map((entry) => (
          <article key={entry.id} className="tile" data-testid={`tile-${entry.id}`} onContextMenu={(event) => {
            event.preventDefault();
            setMenu({ id: entry.id, x: event.clientX, y: event.clientY });
          }}>
            <button type="button" className="tile-open" onClick={() => !trash && props.onOpen(entry.id)}>
              <Preview cards={entry.preview} lines={entry.lines} />
              {renaming === entry.id ? (
                <input
                  aria-label="Board umbenennen"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      void api.libraryRename(entry.id, name).then(() => {
                        setRenaming(null);
                        void reload();
                      });
                    }
                  }}
                />
              ) : (
                <h3>{entry.title}</h3>
              )}
              <p>zuletzt bearbeitet {new Date(entry.modifiedAt).toLocaleString('de-DE')}</p>
            </button>
            <button
              type="button"
              className="tile-more"
              data-testid={`tile-more-${entry.id}`}
              aria-label="Board-Menü"
              onClick={(event) => {
                const box = event.currentTarget.getBoundingClientRect();
                setMenu({ id: entry.id, x: box.left, y: box.bottom });
              }}
            >…</button>
          </article>
        ))}
      </section>
      {menu ? (
        <div className="tile-menu" style={{ left: menu.x, top: menu.y }} role="menu" data-testid="tile-menu">
          {trash ? (
            <button type="button" data-testid="tile-restore" onClick={() => void api.libraryRestore(menu.id).then(() => { setMenu(null); void reload(); })}>Wiederherstellen</button>
          ) : (
            <>
              <button type="button" data-testid="tile-rename" onClick={() => {
                const entry = boards.find((item) => item.id === menu.id);
                setName(entry?.title ?? '');
                setRenaming(menu.id);
                setMenu(null);
              }}>Umbenennen</button>
              <button type="button" data-testid="tile-duplicate" onClick={() => void api.libraryDuplicate(menu.id).then(() => { setMenu(null); void reload(); })}>Duplizieren</button>
              <button type="button" data-testid="tile-delete" onClick={() => void api.libraryTrash(menu.id).then(() => { setMenu(null); void reload(); })}>Löschen</button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function Preview({ cards, lines }: { cards: PreviewCard[]; lines: PreviewLine[] }) {
  return (
    <div className={`tile-preview${cards.length === 0 ? ' is-empty' : ''}`} aria-hidden="true" data-cards={cards.length}>
      {cards.length === 0 ? <span className="tile-empty">Leer</span> : null}
      {cards.map((card, index) => (
        <span key={index} data-preview-card="1" style={{ left: `${card.x}%`, top: `${card.y}%`, width: `${card.w}%`, height: `${card.h}%`, background: card.fill }} />
      ))}
      {lines.length > 0 ? (
        <svg viewBox="0 0 100 100" preserveAspectRatio="none">
          {lines.map((line, index) => (
            <line key={index} x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} />
          ))}
        </svg>
      ) : null}
    </div>
  );
}
