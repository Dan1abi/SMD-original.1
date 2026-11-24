import { useState } from 'react';
import { useStore } from '../store/store.jsx';
import { go } from '../hooks/hooks.js';

const empty = { address: '', phone: '', email: '', fullName: '', sms: '', reminder: '', reminderBefore: '24h' };

export function validateProfile(p) {
  const e = {};
  if (p.address.trim().length < 6) e.address = 'Въведете пълен адрес (улица, номер, град).';
  const phone = p.phone.replace(/[\s\-()]/g, '');
  if (!/^(\+359|0)\d{8,9}$/.test(phone)) e.phone = 'Въведете български номер, напр. 0888 123 456 или +359 888 123 456.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(p.email.trim())) e.email = 'Невалиден имейл адрес.';
  const names = p.fullName.trim().split(/\s+/);
  if (names.length !== 3 || names.some((n) => !/^[\p{L}-]{2,}$/u.test(n))) e.fullName = 'Въведете три имена: собствено, бащино и фамилия.';
  if (!p.sms) e.sms = 'Изберете отговор.';
  if (!p.reminder) e.reminder = 'Изберете отговор.';
  return e;
}

function Choice({ name, value, onChange, options }) {
  return (
    <div className="seg" role="radiogroup">
      {options.map((o) => (
        <button type="button" key={o.value} role="radio" aria-checked={value === o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(name, o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function Onboarding({ editing = false }) {
  const { profile, dispatch } = useStore();
  const [p, setP] = useState(() => ({ ...empty, ...(profile || {}) }));
  const [touched, setTouched] = useState(false);
  const errors = validateProfile(p);
  const set = (k, v) => setP((x) => ({ ...x, [k]: v }));
  const onInput = (e) => set(e.target.name, e.target.value);

  const submit = (e) => {
    e.preventDefault();
    setTouched(true);
    if (Object.keys(errors).length) return;
    const clean = { ...p, phone: p.phone.replace(/[\s\-()]/g, ''), email: p.email.trim(), fullName: p.fullName.trim().replace(/\s+/g, ' '), address: p.address.trim() };
    dispatch({ type: 'profile', profile: clean });
    go(editing ? '/my' : '/');
  };
  const err = (k) => touched && errors[k] && <span className="err">{errors[k]}</span>;

  return (
    <div className={editing ? '' : 'onboard-wrap'}>
      <form className="card onboard" onSubmit={submit} noValidate>
        {!editing && (
          <div className="onboard-head">
            <div className="big-icon">📅</div>
            <h1>Добре дошли в Резервирай.бг</h1>
            <p className="muted">Една система — ресторанти, хотели, салони, клиники и още. Преди да започнем, моля, отговорете на няколко въпроса. Данните се пазят само във вашия браузър.</p>
          </div>
        )}
        {editing && <h2>Моят профил</h2>}

        <label className="field">
          <span>1. Въведете адрес</span>
          <input name="address" value={p.address} onChange={onInput} placeholder="ул. „Примерна“ 1, София" autoComplete="street-address" />
          {err('address')}
        </label>
        <label className="field">
          <span>2. Телефонен номер</span>
          <input name="phone" value={p.phone} onChange={onInput} placeholder="0888 123 456" inputMode="tel" autoComplete="tel" />
          {err('phone')}
        </label>
        <label className="field">
          <span>3. Имейл адрес</span>
          <input name="email" value={p.email} onChange={onInput} placeholder="ime@primer.bg" type="email" autoComplete="email" />
          {err('email')}
        </label>
        <label className="field">
          <span>4. Три имена</span>
          <input name="fullName" value={p.fullName} onChange={onInput} placeholder="Иван Петров Иванов" autoComplete="name" />
          {err('fullName')}
        </label>
        <div className="field">
          <span>5. Желаете ли потвърждение чрез SMS?</span>
          <Choice name="sms" value={p.sms} onChange={set} options={[{ value: 'yes', label: 'Да, изпращайте SMS' }, { value: 'no', label: 'Не, само имейл' }]} />
          {err('sms')}
        </div>
        <div className="field">
          <span>6. Искате ли да получите напомняне преди посещението?</span>
          <Choice name="reminder" value={p.reminder} onChange={set} options={[{ value: 'yes', label: 'Да' }, { value: 'no', label: 'Не' }]} />
          {err('reminder')}
          {p.reminder === 'yes' && (
            <div className="sub">
              <span className="muted small">Кога да ви напомним?</span>
              <Choice name="reminderBefore" value={p.reminderBefore} onChange={set} options={[{ value: '2h', label: '2 часа преди' }, { value: '24h', label: '24 часа преди' }, { value: '48h', label: '48 часа преди' }]} />
            </div>
          )}
        </div>

        <button className="btn primary wide" type="submit">
          {editing ? 'Запази промените' : 'Продължи към резервациите →'}
        </button>
        {editing && (
          <button type="button" className="btn ghost wide" onClick={() => go('/')}>
            Отказ
          </button>
        )}
      </form>
    </div>
  );
}
