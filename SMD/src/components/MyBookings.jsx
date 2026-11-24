import { useState } from 'react';
import { useStore } from '../store/store.jsx';
import { peekEngine } from '../engine/registry.js';
import { BUSINESS_BY_ID } from '../config/businesses.js';
import { fromISO, fmtDate, startOfDay } from '../engine/time.js';
import { money, pluralNights } from '../config/format.js';
import { go } from '../hooks/hooks.js';

const PAY = { on_site: '💵 В брой на място', awaiting_transfer: '🏦 Банков превод — очаква се плащане' };

function Card({ b, confirmId, setConfirmId, cancel, setPayment }) {
  const cfg = BUSINESS_BY_ID[b.bizId];
  return (
    <div className={`card booking ${b.status}`} style={{ '--accent': cfg?.accent }}>
      <div className="booking-head">
        <span className="biz-icon">{b.icon}</span>
        <div>
          <b>{b.bizName}</b>
          <div className="muted small">Код: <span className="mono">{b.code}</span></div>
        </div>
        <span className={`badge ${b.status}`}>{b.status === 'confirmed' ? 'Потвърдена' : 'Отменена'}</span>
      </div>
      <div className="booking-when">
        {b.mode === 'stay' ? (
          <>
            🛏️ {fmtDate(fromISO(b.checkIn))} от {cfg.checkInTime} ч. → {fmtDate(fromISO(b.checkOut))} до {cfg.checkOutTime} ч. · {pluralNights(b.nights)}
          </>
        ) : (
          <>
            📅 {fmtDate(fromISO(b.date))} · 🕐 {b.time} · {b.resourceNames?.join(', ')}
          </>
        )}
      </div>
      <details>
        <summary>Детайли</summary>
        <dl>
          {b.lines.map((l) => (
            <span key={l.label} className="contents"><dt>{l.label}</dt><dd>{l.value}</dd></span>
          ))}
        </dl>
      </details>
      <div className="booking-foot">
        <span>{b.price !== null && <b>{money(b.price)}</b>} {b.payment ? PAY[b.payment.status] : '⚠️ Не е избран начин на плащане'}</span>
        {b.status === 'confirmed' && (
          <span className="row-actions">
            {!b.payment && (
              <>
                <button className="btn small" onClick={() => setPayment(b, 'cash')}>В брой на място</button>
                <button className="btn small" onClick={() => setPayment(b, 'bank')}>По банков път</button>
              </>
            )}
            {confirmId === b.id ? (
              <>
                <span className="small">Сигурни ли сте?</span>
                <button className="btn small danger" onClick={() => cancel(b)}>Да, отмени</button>
                <button className="btn small ghost" onClick={() => setConfirmId(null)}>Не</button>
              </>
            ) : (
              <button className="btn small ghost" onClick={() => setConfirmId(b.id)}>Отмени резервацията</button>
            )}
          </span>
        )}
      </div>
      {b.payment?.method === 'bank' && b.status === 'confirmed' && (
        <div className="muted small">IBAN: <span className="mono">{cfg.payment.iban}</span> · основание „Резервация {b.code}“</div>
      )}
    </div>
  );
}

export default function MyBookings() {
  const { bookings, dispatch, profile } = useStore();
  const [confirmId, setConfirmId] = useState(null);
  const today = startOfDay();

  const cancel = (b) => {
    // инкрементално освобождаване: само засегнатият ден/интервал се инвалидира в двигателя
    peekEngine(b.bizId)?.remove(b.id);
    dispatch({ type: 'updateBooking', id: b.id, patch: { status: 'cancelled' } });
    setConfirmId(null);
  };
  const setPayment = (b, method) => dispatch({ type: 'updateBooking', id: b.id, patch: { payment: { method, status: method === 'cash' ? 'on_site' : 'awaiting_transfer' } } });

  const cardProps = { confirmId, setConfirmId, cancel, setPayment };
  const sorted = [...bookings].sort((a, b) => (a.date || a.checkIn).localeCompare(b.date || b.checkIn));
  const upcoming = sorted.filter((b) => b.status === 'confirmed' && fromISO(b.date || b.checkOut) >= today);
  const other = sorted.filter((b) => !upcoming.includes(b));

  return (
    <>
      <section className="hero">
        <h1>Моите резервации</h1>
        <p className="muted">
          {profile.fullName} · {profile.phone} · SMS: {profile.sms === 'yes' ? 'да' : 'не'} · напомняне: {profile.reminder === 'yes' ? profile.reminderBefore.replace('h', ' ч. преди') : 'не'} · <a href="#/profile">промени</a>
        </p>
      </section>
      {bookings.length === 0 && (
        <div className="card empty-state">
          <p>Все още нямате резервации.</p>
          <button className="btn primary" onClick={() => go('/')}>Направи резервация</button>
        </div>
      )}
      {upcoming.length > 0 && <h3>Предстоящи</h3>}
      <div className="booking-list">{upcoming.map((b) => <Card key={b.id} b={b} {...cardProps} />)}</div>
      {other.length > 0 && <h3>Минали и отменени</h3>}
      <div className="booking-list">{other.map((b) => <Card key={b.id} b={b} {...cardProps} />)}</div>
    </>
  );
}
