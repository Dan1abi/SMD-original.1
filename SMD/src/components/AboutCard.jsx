import { hoursRows, money } from '../config/format.js';

export default function AboutCard({ cfg }) {
  const a = cfg.about;
  return (
    <div className="about">
      <section className="card">
        <h2>{a.title}</h2>
        <p>{a.story}</p>
        <div className="contact-grid">
          <div>📍 <b>Адрес:</b> {a.address}</div>
          <div>📞 <b>Телефон:</b> {a.phone}</div>
          <div>✉️ <b>Имейл:</b> {a.email}</div>
        </div>
      </section>

      <div className="about-cols">
        <section className="card">
          <h3>Работно време</h3>
          {cfg.mode === 'stay' ? (
            <>
              <p>Рецепция: денонощно</p>
              <p>🕐 Настаняване: <b>от {cfg.checkInTime} ч.</b></p>
              <p>🕚 Напускане: <b>до {cfg.checkOutTime} ч.</b></p>
            </>
          ) : (
            <table className="hours">
              <tbody>
                {hoursRows(cfg).map((r) => (
                  <tr key={r.day}>
                    <td>{r.day}</td>
                    <td>{r.text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <section className="card">
          <h3>Предимства</h3>
          <ul>{a.features.map((f) => <li key={f}>{f}</li>)}</ul>
        </section>
        <section className="card">
          <h3>Условия</h3>
          <ul>{a.policies.map((f) => <li key={f}>{f}</li>)}</ul>
        </section>
        <section className="card">
          <h3>Екип</h3>
          <ul>{a.team.map((f) => <li key={f}>{f}</li>)}</ul>
        </section>
      </div>

      {cfg.mode === 'stay' && (
        <section className="card">
          <h3>Стаи</h3>
          <table className="hours">
            <thead>
              <tr><th>Тип</th><th>Описание</th><th>Макс. гости</th><th>Цена/нощ</th></tr>
            </thead>
            <tbody>
              {cfg.roomTypes.map((r) => (
                <tr key={r.id}><td>{r.name}</td><td>{r.desc}</td><td>{r.capacity}</td><td>{money(r.price)}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="card">
        <h3>Често задавани въпроси</h3>
        {cfg.faq.map((f) => (
          <details key={f.a}>
            <summary>{f.q}</summary>
            <p>{f.a}</p>
          </details>
        ))}
        <p className="muted small">Имате друг въпрос? Попитайте AI асистента долу вдясно.</p>
      </section>
    </div>
  );
}
