import { forwardRef } from 'react';
import type { WantedItem } from '../../shared/types.ts';

interface Props {
  wanted: WantedItem[];
  onHaveOne: (item: WantedItem | null) => void;
}

/** The cardboard "BUYING" sign propped up at the front of the table. */
export const WantedSign = forwardRef<HTMLElement, Props>(function WantedSign({ wanted, onHaveOne }, ref) {
  const groups = [
    { title: 'Singles', items: wanted.filter((w) => w.kind === 'single') },
    { title: 'Sealed', items: wanted.filter((w) => w.kind === 'sealed') },
  ].filter((g) => g.items.length);

  return (
    <section className="wanted" aria-labelledby="wanted-title" ref={ref} id="buying">
      <div className="wanted-sign">
        <span className="sign-tape sign-tape-l" aria-hidden />
        <span className="sign-tape sign-tape-r" aria-hidden />
        <header className="wanted-head">
          <h2 id="wanted-title">Buying!</h2>
          <p>Got any of these? I pay cash or trade.</p>
        </header>

        <div className={`wanted-cols${groups.length === 1 ? ' is-single' : ''}`}>
          {groups.map((g) => (
            <div key={g.title} className="wanted-col">
              <h3>{g.title}</h3>
              <ul>
                {g.items.map((w) => (
                  <li key={w.id}>
                    <button type="button" className="wanted-row" onClick={() => onHaveOne(w)} aria-label={`I have ${w.name}`}>
                      {w.image ? (
                        <img src={w.image} alt="" loading="lazy" className={w.kind === 'sealed' ? 'is-sealed' : ''} />
                      ) : (
                        <span className="wanted-dot" aria-hidden>
                          ★
                        </span>
                      )}
                      <span className="wanted-text">
                        <strong>{w.name}</strong>
                        {w.detail && <span>{w.detail}</span>}
                        {w.note && <em>{w.note}</em>}
                      </span>
                      <span className="wanted-cta" aria-hidden>
                        I have one →
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="wanted-foot">
          <button type="button" className="btn btn-primary" onClick={() => onHaveOne(null)}>
            Sell or trade me something
          </button>
        </div>
      </div>
    </section>
  );
});
