import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useEngine, go } from '../hooks/hooks.js';
import { useStore } from '../store/store.jsx';
import { defaultAnswers, validateAnswers, computePrice } from '../engine/rules.js';
import { dayToDate, fmtDate, fmtSlot, toISO, SLOT_MIN, fmtMin } from '../engine/time.js';
import { liveTick } from '../engine/simulate.js';
import { chatContext } from '../ai/context.js';
import { answerLines, whenText, bookingCode, money, pluralNights } from '../config/format.js';
import QuestionForm from './QuestionForm.jsx';
import YearCalendar from './YearCalendar.jsx';
import TimeSlots from './TimeSlots.jsx';
import AllDatesList from './AllDatesList.jsx';
import AboutCard from './AboutCard.jsx';
import { Review, Payment, Done } from './Checkout.jsx';

const NO_SEL = { day: null, start: null, end: null };

export default function BusinessPage({ cfg }) {
  const [engine, version] = useEngine(cfg);
  const { profile, dispatch } = useStore();
  const isStay = cfg.mode === 'stay';

  const [tab, setTab] = useState('book');
  const [view, setView] = useState('calendar');
  const [answers, setAnswers] = useState(() => defaultAnswers(cfg));
  const [sel, setSel] = useState(NO_SEL);
  const [stage, setStage] = useState('pick'); // pick → review → payment → done
  const [record, setRecord] = useState(null);
  const [error, setError] = useState('');
  const [live, setLive] = useState(false);

  // Отложена стойност: писането във формуляра остава гладко, а преизчисляването на годината
  // се случва с по-нисък приоритет (React concurrent rendering).
  const deferred = useDeferredValue(answers);
  const errors = useMemo(() => validateAnswers(cfg, answers), [cfg, answers]);
  const invalid = Object.keys(errors).length > 0;
  const req = useMemo(() => engine.prepare(deferred), [engine, deferred]);

  const { summary, ms, max } = useMemo(() => {
    const t0 = performance.now();
    const s = engine.yearSummary(req);
    let m = 1;
    for (let i = 0; i < s.length; i++) if (s[i] > m) m = s[i];
    return { summary: s, ms: performance.now() - t0, max: m };
    // version: преизчисляване след всяка промяна (кешът прави повторението евтино)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, req, version]);

  const slots = useMemo(() => (!isStay && sel.day !== null ? engine.daySlots(req, sel.day) : []), [engine, req, sel.day, version, isStay]);
  const maxOut = useMemo(() => (isStay && sel.day !== null ? engine.maxCheckout(req, sel.day) : null), [engine, req, sel.day, version, isStay]);

  // Ако изискванията или данните се променят, избраният час може да стане невалиден.
  useEffect(() => {
    if (stage !== 'pick') return;
    setSel((s) => {
      if (s.day === null) return s;
      if (summary[s.day] === 0) return NO_SEL;
      if (!isStay && s.start !== null && !engine.daySlots(req, s.day).includes(s.start)) return { ...s, start: null };
      if (isStay && s.end !== null && s.end > engine.maxCheckout(req, s.day)) return { ...s, end: null };
      return s;
    });
  }, [summary, req, engine, isStay, stage]);

  // Демонстрация на много промени: ~10 промени/сек в данните, UI остава отзивчив.
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => liveTick(engine), 100);
    return () => clearInterval(id);
  }, [live, engine]);

  // AI асистентът вижда текущите отговори (напр. „колко ще ми струва?“)
  useEffect(() => {
    chatContext.bizId = cfg.id;
    chatContext.answers = deferred;
  }, [cfg.id, deferred]);

  const onChange = useCallback((id, value) => setAnswers((a) => ({ ...a, [id]: value })), []);

  const onPickDay = useCallback(
    (d) => {
      setError('');
      if (!isStay) return setSel({ day: d, start: null, end: null });
      setSel((s) => {
        if (s.day !== null && s.end === null && d > s.day && d <= engine.maxCheckout(req, s.day)) return { ...s, end: d };
        return summary[d] > 0 ? { day: d, start: null, end: null } : s;
      });
    },
    [isStay, engine, req, summary]
  );

  const cellInfo = useCallback(
    (d) => {
      const v = summary[d];
      if (isStay && sel.day !== null) {
        if (sel.end !== null && d >= sel.day && d <= sel.end) return [d === sel.day || d === sel.end ? 'sel' : 'range', d === sel.day ? 'Настаняване' : d === sel.end ? 'Напускане' : 'Престой'];
        if (sel.end === null && d > sel.day && d <= maxOut) return ['co', `Напускане тук: ${pluralNights(d - sel.day)}`];
        if (d === sel.day) return ['sel', 'Настаняване'];
      }
      if (!isStay && d === sel.day) return ['sel', `${v} свободни часа`];
      if (!v) return ['off', 'Няма свободни места'];
      const level = Math.min(4, Math.ceil((4 * v) / max));
      return [`l${level}`, isStay ? `${v} свободни стаи` : `${v} свободни часа`];
    },
    [summary, isStay, sel, maxOut, max]
  );

  const nights = isStay && sel.end !== null ? sel.end - sel.day : 0;
  const price = isStay ? computePrice(cfg, answers, nights) : computePrice(cfg, answers);
  const ready = !invalid && sel.day !== null && (isStay ? sel.end !== null : sel.start !== null);

  const extra = useMemo(() => {
    const x = [];
    if (isStay && nights) x.push({ label: 'Нощувки', value: pluralNights(nights) });
    if (!isStay) x.push({ label: 'Продължителност', value: `${req.duration} мин.` });
    return x;
  }, [isStay, nights, req.duration]);

  const confirm = () => {
    const id = `u-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const b = isStay ? engine.book(req, sel.day, sel.end, { id }) : engine.book(req, sel.day, sel.start, { id });
    if (!b) {
      setError('За съжаление избраният час току-що беше зает. Моля, изберете друг.');
      setStage('pick');
      setSel((s) => ({ ...s, start: null, end: null }));
      return;
    }
    const rec = {
      id,
      code: bookingCode(cfg.codePrefix),
      bizId: cfg.id,
      bizName: cfg.name,
      icon: cfg.icon,
      mode: cfg.mode,
      createdAt: new Date().toISOString(),
      status: 'confirmed',
      answers,
      lines: answerLines(cfg, answers),
      price,
      payment: null,
      notify: { sms: profile.sms, reminder: profile.reminder, reminderBefore: profile.reminderBefore },
    };
    if (isStay) {
      Object.assign(rec, { checkIn: toISO(dayToDate(sel.day)), checkOut: toISO(dayToDate(sel.end)), nights, roomType: req.type, rooms: req.rooms });
    } else {
      Object.assign(rec, {
        date: toISO(dayToDate(sel.day)),
        startMin: sel.start * SLOT_MIN,
        endMin: (sel.start + req.len) * SLOT_MIN,
        time: `${fmtSlot(sel.start)} – ${fmtMin((sel.start + req.len) * SLOT_MIN)}`,
        resourceIds: b.resourceIds,
        resourceNames: b.resourceIds.map((rid) => cfg.resources.find((r) => r.id === rid).name),
      });
    }
    dispatch({ type: 'addBooking', booking: rec });
    setRecord(rec);
    setStage('payment');
  };

  const onPaid = (method) => {
    const payment = { method, status: method === 'cash' ? 'on_site' : 'awaiting_transfer' };
    dispatch({ type: 'updateBooking', id: record.id, patch: { payment } });
    setRecord((r) => ({ ...r, payment }));
    setStage('done');
  };

  const restart = () => {
    setStage('pick');
    setSel(NO_SEL);
    setRecord(null);
  };

  const st = engine.stats();
  const header = (
    <section className="biz-head">
      <button className="link" onClick={() => go('/')}>← Всички бизнеси</button>
      <div className="biz-title">
        <span className="biz-icon lg">{cfg.icon}</span>
        <div>
          <h1>{cfg.name}</h1>
          <p className="muted">{cfg.tagline}</p>
        </div>
      </div>
      <div className="tabs">
        <button className={tab === 'book' ? 'on' : ''} onClick={() => setTab('book')}>📅 Резервация</button>
        <button className={tab === 'about' ? 'on' : ''} onClick={() => setTab('about')}>ℹ️ За нас</button>
      </div>
    </section>
  );

  if (tab === 'about')
    return (
      <>
        {header}
        <AboutCard cfg={cfg} />
      </>
    );

  if (stage === 'review') {
    return (
      <>
        {header}
        <Review cfg={cfg} profile={profile} when={whenText(cfg, sel, req.len)} lines={answerLines(cfg, answers)} price={price} extra={extra} onBack={() => setStage('pick')} onConfirm={confirm} error={error} />
      </>
    );
  }
  if (stage === 'payment')
    return (
      <>
        {header}
        <Payment cfg={cfg} record={record} onPaid={onPaid} />
      </>
    );
  if (stage === 'done')
    return (
      <>
        {header}
        <Done cfg={cfg} record={record} profile={profile} onNew={restart} />
      </>
    );

  return (
    <>
      {header}
      {error && <div className="notice warn">{error}</div>}
      <div className="book-grid">
        <aside className="card">
          <h3>1. Детайли</h3>
          <QuestionForm cfg={cfg} answers={answers} errors={errors} onChange={onChange} />
        </aside>

        <section className="card cal-card">
          <div className="cal-head">
            <h3>2. {isStay ? 'Изберете настаняване и напускане' : 'Изберете дата и час'}</h3>
            <div className="seg small">
              <button className={view === 'calendar' ? 'on' : ''} onClick={() => setView('calendar')}>Календар</button>
              <button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>Всички свободни дати и часове</button>
            </div>
          </div>

          <div className="perf">
            ⚡ 365 дни × {st.resources} {isStay ? 'стаи' : 'ресурса'} проверени за <b>{ms.toFixed(2)} ms</b> · {st.bookings.toLocaleString('bg-BG')} резервации в системата
            <label className="live">
              <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} /> поток от промени (10/сек)
            </label>
          </div>

          {invalid ? (
            <div className="notice warn">Попълнете коректно детайлите вляво, за да видите свободните дати.</div>
          ) : !isStay && req.cand.length < req.qty ? (
            <div className="notice warn">Няма {cfg.resourceLabel.toLowerCase()}, който да отговаря на всички избрани изисквания. Опитайте с друга комбинация.</div>
          ) : view === 'calendar' ? (
            <>
              <div className="legend">
                <span><i className="day l4" /> много свободни</span>
                <span><i className="day l1" /> малко свободни</span>
                <span><i className="day off" /> заето / почивен ден</span>
                {isStay && <span><i className="day co" /> възможна дата на напускане</span>}
              </div>
              <YearCalendar start={engine.start} days={engine.days} cellInfo={cellInfo} onPick={onPickDay} />
            </>
          ) : (
            <AllDatesList
              engine={engine}
              req={req}
              summary={summary}
              version={version}
              mode={cfg.mode}
              onPickSlot={(d, s) => {
                setSel({ day: d, start: s, end: null });
                setView('calendar');
              }}
              onPickDay={(d) => {
                setSel({ day: d, start: null, end: null });
                setView('calendar');
              }}
            />
          )}

          {!isStay && sel.day !== null && !invalid && (
            <div className="day-panel">
              <h4>Свободни часове · {fmtDate(dayToDate(sel.day))}</h4>
              <TimeSlots slots={slots} selected={sel.start} onPick={(s) => setSel((x) => ({ ...x, start: s }))} />
            </div>
          )}
          {isStay && sel.day !== null && sel.end === null && (
            <div className="notice">Настаняване: <b>{fmtDate(dayToDate(sel.day))} от {cfg.checkInTime} ч.</b> Сега изберете дата на напускане (до {cfg.checkOutTime} ч.) — маркираните дни.</div>
          )}
        </section>
      </div>

      <div className={ready ? 'selbar ready' : 'selbar'}>
        <div>
          {sel.day === null ? (
            <span className="muted">Изберете {isStay ? 'дата на настаняване' : 'дата'} от календара.</span>
          ) : isStay ? (
            <span>
              🛏️ {fmtDate(dayToDate(sel.day))} ({cfg.checkInTime} ч.) {sel.end !== null && <>→ {fmtDate(dayToDate(sel.end))} ({cfg.checkOutTime} ч.) · {pluralNights(nights)}</>}
            </span>
          ) : (
            <span>
              📅 {fmtDate(dayToDate(sel.day))} {sel.start !== null && <>· 🕐 {fmtSlot(sel.start)} ({req.duration} мин.)</>}
            </span>
          )}
          {price !== null && ready && <span className="price"> · {cfg.price.label}: {money(price)}</span>}
        </div>
        <button className="btn primary" disabled={!ready} onClick={() => setStage('review')}>
          Продължи →
        </button>
      </div>
    </>
  );
}
