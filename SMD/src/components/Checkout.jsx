import { useState } from 'react';
import { money, pluralNights } from '../config/format.js';
import { go } from '../hooks/hooks.js';
import { fromISO, fmtDate } from '../engine/time.js';

export function Review({ cfg, profile, when, lines, price, extra, onBack, onConfirm, error }) {
  return (
    <div className="card review">
      <h2>Преглед на резервацията</h2>
      {error && <div className="notice warn">{error}</div>}
      <div className="review-cols">
        <div>
          <h4>{cfg.icon} {cfg.name}</h4>
          <dl>
            {cfg.mode === 'stay' ? (
              <>
                <dt>Настаняване</dt><dd>{when.checkIn}</dd>
                <dt>Напускане</dt><dd>{when.checkOut}</dd>
              </>
            ) : (
              <>
                <dt>Дата</dt><dd>{when.date}</dd>
                <dt>Час</dt><dd>{when.time}</dd>
              </>
            )}
            {extra.map((x) => (
              <span key={x.label} className="contents"><dt>{x.label}</dt><dd>{x.value}</dd></span>
            ))}
            {lines.map((l) => (
              <span key={l.label} className="contents"><dt>{l.label}</dt><dd>{l.value}</dd></span>
            ))}
            {price !== null && (<><dt>{cfg.price.label}</dt><dd className="price">{money(price)}</dd></>)}
          </dl>
        </div>
        <div>
          <h4>👤 Вашите данни</h4>
          <dl>
            <dt>Име</dt><dd>{profile.fullName}</dd>
            <dt>Телефон</dt><dd>{profile.phone}</dd>
            <dt>Имейл</dt><dd>{profile.email}</dd>
            <dt>Адрес</dt><dd>{profile.address}</dd>
            <dt>SMS потвърждение</dt><dd>{profile.sms === 'yes' ? 'Да' : 'Не'}</dd>
            <dt>Напомняне</dt><dd>{profile.reminder === 'yes' ? `Да, ${profile.reminderBefore.replace('h', ' часа')} преди` : 'Не'}</dd>
          </dl>
          <a href="#/profile" className="small">Промени данните</a>
        </div>
      </div>
      <div className="actions">
        <button className="btn ghost" onClick={onBack}>← Назад</button>
        <button className="btn primary" onClick={onConfirm}>Потвърди резервацията</button>
      </div>
    </div>
  );
}

export function Payment({ cfg, record, onPaid }) {
  const [method, setMethod] = useState('');
  return (
    <div className="card payment">
      <div className="success-head">
        <div className="big-icon">✅</div>
        <h2>Резервацията е направена!</h2>
        <p>Код на резервацията: <b className="code">{record.code}</b></p>
      </div>
      <h3>Как желаете да платите?</h3>
      <div className="pay-options">
        <button type="button" className={method === 'cash' ? 'pay on' : 'pay'} onClick={() => setMethod('cash')}>
          <span className="pay-icon">💵</span>
          <b>В брой на място</b>
          <span className="muted small">Плащате при посещението{cfg.mode === 'stay' ? ' (на рецепцията при настаняване)' : ''}.</span>
        </button>
        <button type="button" className={method === 'bank' ? 'pay on' : 'pay'} onClick={() => setMethod('bank')}>
          <span className="pay-icon">🏦</span>
          <b>По банков път</b>
          <span className="muted small">Превод по сметката на {cfg.name}.</span>
        </button>
      </div>
      {method === 'bank' && (
        <div className="bank">
          <dl>
            <dt>Получател</dt><dd>{cfg.name}</dd>
            <dt>Банка</dt><dd>{cfg.payment.bankName}</dd>
            <dt>IBAN</dt><dd className="mono">{cfg.payment.iban}</dd>
            <dt>BIC</dt><dd className="mono">{cfg.payment.bic}</dd>
            <dt>Основание</dt><dd className="mono">Резервация {record.code}</dd>
            <dt>Сума</dt><dd className="price">{money(record.price ?? 0)}</dd>
          </dl>
          <p className="muted small">Демо реквизити — не превеждайте реални средства. Моля, преведете до 3 работни дни; при неполучено плащане резервацията може да бъде освободена.</p>
        </div>
      )}
      <div className="actions">
        <button className="btn primary" disabled={!method} onClick={() => onPaid(method)}>
          Потвърди начина на плащане
        </button>
      </div>
    </div>
  );
}

export function Done({ cfg, record, profile, onNew }) {
  const startText = record.mode === 'stay' ? `${fmtDate(fromISO(record.checkIn))} от ${cfg.checkInTime} ч.` : `${fmtDate(fromISO(record.date))} в ${record.time}`;
  return (
    <div className="card done">
      <div className="success-head">
        <div className="big-icon">🎉</div>
        <h2>Всичко е готово!</h2>
        <p>{cfg.name} ви очаква на {startText}.</p>
      </div>
      <ul className="notify">
        <li>📧 Потвърждение е изпратено на <b>{profile.email}</b> (симулирано).</li>
        {profile.sms === 'yes' && <li>📱 SMS потвърждение е изпратено на <b>{profile.phone}</b> (симулирано).</li>}
        {profile.reminder === 'yes' && <li>⏰ Ще получите напомняне {profile.reminderBefore.replace('h', ' часа')} преди посещението{profile.sms === 'yes' ? ' по SMS и имейл' : ' по имейл'}.</li>}
        <li>{record.payment?.method === 'bank' ? '🏦 Начин на плащане: банков превод (очаква се плащане).' : '💵 Начин на плащане: в брой на място.'}</li>
        {record.nights ? <li>🛏️ {pluralNights(record.nights)} · напускане до {cfg.checkOutTime} ч.</li> : null}
      </ul>
      <div className="actions">
        <button className="btn ghost" onClick={() => go('/my')}>Моите резервации</button>
        <button className="btn primary" onClick={onNew}>Нова резервация</button>
      </div>
    </div>
  );
}
