import { BUSINESSES } from '../config/businesses.js';
import { useStore } from '../store/store.jsx';
import { go } from '../hooks/hooks.js';

export default function BusinessList() {
  const { profile } = useStore();
  return (
    <>
      <section className="hero">
        <h1>Здравейте, {profile.fullName.split(' ')[0]}!</h1>
        <p className="muted">Изберете бизнес, отговорете на няколко въпроса и вижте всички свободни дати и часове за следващите 12 месеца.</p>
      </section>
      <div className="biz-grid">
        {BUSINESSES.map((b) => (
          <button key={b.id} className="biz-card" style={{ '--accent': b.accent }} onClick={() => go(`/b/${b.id}`)}>
            <span className="biz-icon">{b.icon}</span>
            <span className="biz-cat">{b.category}</span>
            <strong>{b.name}</strong>
            <span className="muted small">{b.tagline}</span>
            <span className="biz-cta">Резервирай →</span>
          </button>
        ))}
      </div>
    </>
  );
}
