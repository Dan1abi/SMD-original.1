import { lazy, Suspense, useState } from 'react';
import { useStore } from './store/store.jsx';
import { useRoute, go } from './hooks/hooks.js';
import { BUSINESS_BY_ID } from './config/businesses.js';
import Onboarding from './components/Onboarding.jsx';
import BusinessList from './components/BusinessList.jsx';
import BusinessPage from './components/BusinessPage.jsx';
import MyBookings from './components/MyBookings.jsx';

// Code splitting: тези части се зареждат само при нужда.
const ChatAssistant = lazy(() => import('./components/ChatAssistant.jsx'));
const Benchmark = lazy(() => import('./components/Benchmark.jsx'));

export default function App() {
  const { profile, bookings } = useStore();
  const route = useRoute();
  const [chatOpen, setChatOpen] = useState(false);

  if (!profile) return <Onboarding />;

  const [, section, id] = route.split('/');
  const biz = section === 'b' ? BUSINESS_BY_ID[id] : null;
  const active = bookings.filter((b) => b.status === 'confirmed').length;

  let page;
  if (biz) page = <BusinessPage key={biz.id} cfg={biz} />;
  else if (section === 'my') page = <MyBookings />;
  else if (section === 'profile') page = <Onboarding editing />;
  else if (section === 'bench')
    page = (
      <Suspense fallback={<div className="card">Зареждане…</div>}>
        <Benchmark />
      </Suspense>
    );
  else page = <BusinessList />;

  return (
    <div className="app" style={biz ? { '--accent': biz.accent } : undefined}>
      <header className="topbar">
        <button className="brand" onClick={() => go('/')}>
          <span className="brand-mark">📅</span>
          <span>Резервирай<span className="brand-dot">.бг</span></span>
        </button>
        <nav className="nav">
          <a href="#/" className={!section ? 'on' : ''}>Бизнеси</a>
          <a href="#/my" className={section === 'my' ? 'on' : ''}>
            Моите резервации {active > 0 && <span className="pill">{active}</span>}
          </a>
          <a href="#/bench" className={section === 'bench' ? 'on' : ''}>Оптимизация</a>
          <a href="#/profile" className={section === 'profile' ? 'on' : ''} title="Профил">
            👤 {profile.fullName.split(' ')[0]}
          </a>
        </nav>
      </header>

      <main className="main">{page}</main>

      <footer className="footer">Демо система със симулирани данни · всички имена, адреси и банкови сметки са измислени.</footer>

      {chatOpen ? (
        <Suspense fallback={null}>
          <ChatAssistant biz={biz} onClose={() => setChatOpen(false)} />
        </Suspense>
      ) : (
        <button className="chat-fab" onClick={() => setChatOpen(true)} aria-label="Отвори AI асистента">
          💬 <span>AI асистент</span>
        </button>
      )}
    </div>
  );
}
