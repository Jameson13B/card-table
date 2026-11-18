import { forwardRef, useRef, useState } from 'react';
import type { Intent, PublicItem } from '../../shared/types.ts';
import { formatPrice } from '../../shared/types.ts';
import { conditionLabel, mailtoHref, sellMailtoHref, sendInquiry, subtitle } from '../lib.ts';
import { useDialog } from './useDialog.ts';

/** The little stack of picked-out cards sitting at the corner of the table. */
export const PileButton = forwardRef<HTMLButtonElement, { items: PublicItem[]; onOpen: () => void }>(function PileButton(
  { items, onOpen },
  ref,
) {
  const top = items.slice(-3);
  return (
    <button type="button" className={`pile-button${items.length ? '' : ' is-empty'}`} onClick={onOpen} ref={ref}>
      <span className="pile-stack" aria-hidden>
        {top.length === 0 && <span className="pile-ghost" />}
        {top.map((item, i) => (
          <img key={item.id} src={item.imageSmall} alt="" style={{ '--i': i - top.length + 1 } as React.CSSProperties} />
        ))}
      </span>
      <span className="pile-text">
        <strong>Your pile</strong>
        <span>{items.length ? `${items.length} item${items.length === 1 ? '' : 's'}` : 'empty'}</span>
      </span>
      {items.length > 0 && <span className="pile-badge">{items.length}</span>}
    </button>
  );
});

interface DrawerProps {
  items: PublicItem[];
  email: string;
  tableName: string;
  onRemove: (id: string) => void;
  onClear: () => void;
  onClose: () => void;
  /** Opened from the Buying sign: they're selling to you, so the pile stays out of it. */
  sell?: { message: string } | null;
}

export function PileDrawer({ items, email, tableName, onRemove, onClear, onClose, sell }: DrawerProps) {
  const ref = useRef<HTMLDivElement>(null);
  useDialog(ref, onClose);

  if (sell) {
    return (
      <div className="overlay overlay-drawer" role="dialog" aria-modal="true" aria-labelledby="pile-title" ref={ref}>
        <div className="overlay-backdrop" onClick={onClose} />
        <aside className="drawer">
          <header className="drawer-head">
            <h2 id="pile-title">Sell or trade to me</h2>
            <button type="button" className="btn-close" onClick={onClose} aria-label="Close">
              ×
            </button>
          </header>
          <p className="hint">Tell me what you’ve got, its condition, and what you’d want for it (cash or something off my table).</p>
          <InquiryForm items={[]} email={email} tableName={tableName} onSent={() => {}} sellMessage={sell.message} />
        </aside>
      </div>
    );
  }

  const total = items.reduce((s, i) => s + (i.price ?? 0), 0);
  const hasOffers = items.some((i) => i.price == null);

  return (
    <div className="overlay overlay-drawer" role="dialog" aria-modal="true" aria-labelledby="pile-title" ref={ref}>
      <div className="overlay-backdrop" onClick={onClose} />
      <aside className="drawer">
        <header className="drawer-head">
          <h2 id="pile-title">{items.length ? 'Your pile' : 'Talk to the vendor'}</h2>
          <button type="button" className="btn-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        {items.length > 0 ? (
          <>
            <ul className="pile-list">
              {items.map((item) => (
                <li key={item.id}>
                  <img src={item.imageSmall} alt="" className={item.sealed ? 'is-sealed' : ''} />
                  <span className="pile-info">
                    <strong>{item.name}</strong>
                    <span>{[subtitle(item), conditionLabel(item)].filter(Boolean).join(' · ')}</span>
                    {item.status !== 'available' && <span className="warn">{item.status === 'sold' ? 'Sold' : 'On hold'}</span>}
                  </span>
                  <span className="pile-price">{formatPrice(item.price)}</span>
                  <button type="button" className="pile-remove" onClick={() => onRemove(item.id)} aria-label={`Remove ${item.name}`}>
                    ×
                  </button>
                </li>
              ))}
            </ul>
            <div className="pile-total">
              <span>Total{hasOffers ? ' (plus offers)' : ''}</span>
              <strong>{formatPrice(total || null)}</strong>
            </div>
            <p className="hint">No checkout here: send me your pile and we’ll work out cash, trade or a bundle deal.</p>
          </>
        ) : (
          <p className="hint">Your pile is empty. Pick things up off the table to add them, or just send a question below.</p>
        )}

        <InquiryForm items={items} email={email} tableName={tableName} onSent={onClear} />
      </aside>
    </div>
  );
}

type FormState = { kind: 'idle' } | { kind: 'sending' } | { kind: 'sent' } | { kind: 'error'; message: string };

interface FormProps {
  items: PublicItem[];
  email: string;
  tableName: string;
  onSent: () => void;
  /** Set when selling to you: the intent is fixed and the message starts with this. */
  sellMessage?: string;
}

function InquiryForm({ items, email, tableName, onSent, sellMessage }: FormProps) {
  const selling = sellMessage != null;
  const [state, setState] = useState<FormState>({ kind: 'idle' });
  const [intent, setIntent] = useState<Intent>(selling ? 'sell' : 'either');
  const [message, setMessage] = useState(sellMessage ?? '');
  const fallbackHref = selling ? sellMailtoHref(email, tableName, message) : mailtoHref(email, items, tableName);

  if (state.kind === 'sent') {
    return (
      <div className="form-done" role="status">
        <p className="big">Sent! 🙌</p>
        <p>Thanks. I’ll get back to you soon.</p>
      </div>
    );
  }

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setState({ kind: 'sending' });
    const res = await sendInquiry({
      name: String(f.get('name') ?? ''),
      contact: String(f.get('contact') ?? ''),
      message,
      website: String(f.get('website') ?? ''),
      intent,
      itemIds: items.map((i) => i.id),
    });
    if (res.ok) {
      setState({ kind: 'sent' });
      onSent();
    } else {
      setState({ kind: 'error', message: res.error ?? 'Something went wrong.' });
    }
  };

  return (
    <form className="inquiry" onSubmit={onSubmit}>
      <h3>{selling ? 'What have you got?' : items.length ? 'Send me your pile' : 'Send a message'}</h3>
      <label>
        Name
        <input name="name" required maxLength={80} autoComplete="name" />
      </label>
      <label>
        How do I reach you?
        <input name="contact" required maxLength={120} placeholder="Email, phone or @handle" autoComplete="email" />
      </label>
      {!selling && (
        <fieldset className="intent">
          <legend>Looking to</legend>
          {(['cash', 'trade', 'either'] as const).map((v) => (
            <label key={v} className={intent === v ? 'is-on' : ''}>
              <input type="radio" name="intent" value={v} checked={intent === v} onChange={() => setIntent(v)} />
              {v === 'cash' ? 'Buy' : v === 'trade' ? 'Trade' : 'Either'}
            </label>
          ))}
        </fieldset>
      )}
      <label>
        <span>
          Message {items.length ? <span className="opt">(optional)</span> : null}
        </span>
        <textarea
          name="message"
          rows={selling ? 4 : 3}
          maxLength={2000}
          required={!items.length}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={
            selling
              ? 'What you have, condition, and your asking price or trade ask…'
              : intent === 'cash'
                ? 'Offer, bundle ask, pickup or shipping…'
                : 'What you’re offering in trade…'
          }
        />
      </label>
      {/* Honeypot: hidden from people, irresistible to bots. */}
      <input className="hp" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />

      {state.kind === 'error' && (
        <p className="form-error" role="alert">
          {state.message}
          {email && (
            <>
              {' '}
              <a href={fallbackHref}>Email me instead.</a>
            </>
          )}
        </p>
      )}

      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={state.kind === 'sending'}>
          {state.kind === 'sending' ? 'Sending…' : 'Send'}
        </button>
        {email && items.length > 0 && (
          <a className="btn btn-ghost" href={mailtoHref(email, items, tableName)}>
            Or email the list
          </a>
        )}
      </div>
    </form>
  );
}
