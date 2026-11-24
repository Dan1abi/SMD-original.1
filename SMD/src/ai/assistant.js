/**
 * Локален AI асистент (без мрежа): разпознаване на намерение по ключови основи на думите,
 * извличане на дата/час/брой хора от свободен текст на български и отговори,
 * изградени от КОНФИГУРАЦИЯТА на бизнеса и от ЖИВИТЕ данни на двигателя за свободни места.
 * Така асистентът винаги е синхронизиран с реалната наличност и правила — без халюцинации.
 */
import { BUSINESSES, BUSINESS_BY_ID } from '../config/businesses.js';
import { getEngine } from '../engine/registry.js';
import { defaultAnswers, computePrice, validateAnswers } from '../engine/rules.js';
import { dayToDate, dateToDay, fmtDate, fmtSlot, MONTHS_LOWER, SLOT_MIN, startOfDay } from '../engine/time.js';
import { hoursRows, money, pluralNights } from '../config/format.js';

export const norm = (s) =>
  s
    .toLowerCase()
    .replace(/[„“"'!?;()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
/** Текстът се огражда с интервали, за да могат ключове като ' маса ' да съвпадат само с цяла дума. */
const pad = (s) => ` ${s} `;
const has = (t, list) => list.some((w) => t.includes(w));

const BIZ_HINTS = {
  restaurant: ['ресторант', ' маса ', ' маси ', ' масата ', 'вечеря', 'обяд', 'синя лоза', 'хапнем'],
  hotel: ['хотел', 'стая', 'стаи', 'нощувк', 'нощув', 'панорама', 'all inclusive'],
  salon: ['салон', 'маникюр', 'педикюр', 'нокт', 'гел лак', 'бела'],
  dental: ['зъб', 'зъболекар', 'стоматолог', 'дентал', 'усмивка', 'пломб'],
  autoservice: ['сервиз', 'автомобил', 'колата', 'масло', 'спирач', 'гуми', 'мотор про'],
  fitness: ['фитнес', 'тренир', 'треньор', 'форма'],
  spa: ['спа', 'масаж', 'релакс', 'аква'],
  vet: ['ветеринар', 'куче', 'котк', 'любимец', 'лапичка', 'ваксин'],
};

export function detectBusiness(t) {
  let best = null;
  let score = 0;
  for (const [id, words] of Object.entries(BIZ_HINTS)) {
    const s = words.filter((w) => t.includes(w)).length;
    if (s > score) {
      score = s;
      best = id;
    }
  }
  return best ? BUSINESS_BY_ID[best] : null;
}

const WD = [
  ['недел', 0],
  ['понедел', 1],
  ['вторни', 2],
  ['сряда', 3],
  ['сряд', 3],
  ['четвърт', 4],
  ['петък', 5],
  ['събот', 6],
];

/** Извлича дата → индекс на ден в хоризонта. Връща { day, rest } или null. */
export function parseDate(t, now = new Date()) {
  const today = startOfDay(now);
  if (t.includes('вдругиден')) return { day: 2 };
  if (t.includes('утре')) return { day: 1 };
  if (t.includes('днес') || t.includes('довечера') || t.includes('тази вечер')) return { day: 0 };
  let m = t.match(/(\d{1,2})\s*(януари|февруари|март|април|май|юни|юли|август|септември|октомври|ноември|декември)(?:\s*(\d{4}))?/);
  if (m) {
    const month = MONTHS_LOWER.indexOf(m[2]);
    let year = m[3] ? Number(m[3]) : today.getFullYear();
    let d = new Date(year, month, Number(m[1]));
    if (!m[3] && d < today) d = new Date(year + 1, month, Number(m[1]));
    return { day: dateToDay(d), consumed: m[0] };
  }
  m = t.match(/\b(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?\b(?!\s*ч)/);
  if (m && Number(m[2]) <= 12) {
    let year = m[3] ? Number(m[3].length === 2 ? '20' + m[3] : m[3]) : today.getFullYear();
    let d = new Date(year, Number(m[2]) - 1, Number(m[1]));
    if (!m[3] && d < today) d = new Date(year + 1, Number(m[2]) - 1, Number(m[1]));
    return { day: dateToDay(d), consumed: m[0] };
  }
  for (const [stem, wd] of WD) {
    if (t.includes(stem)) {
      let diff = (wd - today.getDay() + 7) % 7;
      if (diff === 0) diff = 7;
      if (t.includes('следващ')) diff += diff < 7 ? 7 : 0;
      return { day: diff };
    }
  }
  return null;
}

/** Извлича час в минути от полунощ. */
export function parseTime(t) {
  let m = t.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = t.match(/(?:\bв|\bот|\bоколо|\bкъм)\s*([01]?\d|2[0-3])(?:[.,]([0-5]\d))?\s*(?:ч\b|часа|часът)?/);
  if (m) return Number(m[1]) * 60 + (m[2] ? Number(m[2]) : 0);
  m = t.match(/\b([01]?\d|2[0-3])\s*(?:ч\b|часа)/);
  if (m) return Number(m[1]) * 60;
  return null;
}

export function parseGuests(t) {
  const m = t.match(/(\d{1,2})\s*(души|човека|човек|гости|възрастни|лица|персони)/);
  if (m) return Number(m[1]);
  const words = { двама: 2, двамата: 2, трима: 3, четирима: 4, петима: 5, шестима: 6 };
  for (const [w, n] of Object.entries(words)) if (t.includes(w)) return n;
  return null;
}

function hoursText(cfg) {
  if (cfg.mode === 'stay') return `Рецепцията работи денонощно. Настаняване от ${cfg.checkInTime} ч., напускане до ${cfg.checkOutTime} ч.`;
  return 'Работно време на ' + cfg.name + ':\n' + hoursRows(cfg).map((r) => `• ${r.day}: ${r.text}`).join('\n');
}

function priceText(cfg) {
  if (cfg.mode === 'stay') {
    return (
      'Цени на нощувка:\n' +
      cfg.roomTypes.map((r) => `• ${r.name} (до ${r.capacity} гости) — ${money(r.price)}`).join('\n') +
      `\nХранене: закуска +${money(cfg.price.meal.breakfast)}, all inclusive +${money(cfg.price.meal.allInclusive)} на човек на нощ.`
    );
  }
  const out = [];
  for (const [qid, map] of Object.entries(cfg.price.sum || {})) {
    const q = cfg.questions.find((x) => x.id === qid);
    for (const [v, p] of Object.entries(map)) {
      const label = q.options?.find((o) => o.value === v)?.label ?? v;
      out.push(`• ${q.label.replace(/\?$/, '')}: ${label} — ${q.id === 'removal' || q.id === 'polish' || q.id === 'sauna' || q.id === 'firstVisit' || q.id === 'replacementCar' || q.id === 'format' ? '+' : ''}${money(p)}`);
    }
  }
  if (cfg.price.perAnswer) out.push(`• ${cfg.price.label}: ${money(cfg.price.perAnswer.amount)} на човек`);
  return `${cfg.price.label} в ${cfg.name}:\n${out.join('\n')}`;
}

function availability(cfg, t, ctx) {
  const engine = getEngine(cfg, ctx.bookings);
  const answers = { ...defaultAnswers(cfg), ...(ctx.biz?.id === cfg.id ? ctx.answers || {} : {}) };
  const guests = parseGuests(t);
  if (guests && cfg.questions.some((q) => q.id === 'guests')) answers.guests = guests;
  if (cfg.id === 'hotel' && guests) answers.rooms = Math.max(1, Math.ceil(guests / 2));
  if (cfg.id === 'spa' && guests === 2) answers.people = '2';
  if (cfg.id === 'autoservice' && !answers.car) answers.car = '—';
  if (cfg.id === 'vet' && !answers.petName) answers.petName = '—';
  const errs = validateAnswers(cfg, answers);
  if (Object.keys(errs).length) return `Не мога да проверя с тези параметри: ${Object.values(errs)[0]}`;

  const parsed = parseDate(t);
  const nearest = has(t, ['най-близ', 'най-ран', 'най-скоро', 'първ', 'кога има', 'кога е свободно']);
  const p = engine.prepare(answers);

  if (cfg.mode === 'stay') {
    let day = parsed?.day;
    if (day === undefined || day === null) {
      const f = engine.firstAvailable(p, 0);
      if (!f) return 'За съжаление няма свободни стаи от избрания тип в следващите 12 месеца.';
      day = f.day;
    }
    if (day < 0 || day >= engine.days) return 'Мога да проверя наличност само за следващите 12 месеца.';
    const lines = cfg.roomTypes.map((r) => `• ${r.name}: ${engine.freeRooms(r.id, day, day + 1)} свободни`);
    return `Наличност за нощувка с настаняване на ${fmtDate(dayToDate(day))} (от ${cfg.checkInTime} ч.):\n${lines.join('\n')}\nЗа да резервирате, изберете датата в календара на хотела.`;
  }

  if (!p.cand.length) return `Няма ${cfg.resourceLabel.toLowerCase()}, който да покрива избраната комбинация от услуги.`;
  if (!parsed || nearest) {
    const f = engine.firstAvailable(p, parsed?.day ?? 0);
    if (!f) return 'Няма свободни часове в следващите 12 месеца за тези изисквания.';
    const sl = engine.daySlots(p, f.day).slice(0, 8).map(fmtSlot).join(', ');
    return `Най-близкият свободен ден е ${fmtDate(dayToDate(f.day))} — свободни часове: ${sl}${engine.daySlots(p, f.day).length > 8 ? ' и още' : ''}.`;
  }
  const day = parsed.day;
  if (day < 0) return 'Тази дата вече е минала. 🙂 Попитайте за бъдеща дата.';
  if (day >= engine.days) return 'Мога да проверя наличност само за следващите 12 месеца.';
  const slots = engine.daySlots(p, day);
  const dateTxt = fmtDate(dayToDate(day)).replace(/\.$/, '');
  const time = parseTime(parsed.consumed ? t.replace(parsed.consumed, ' ') : t);
  const who = guests ? ` за ${guests} души` : '';
  if (!slots.length) {
    const f = engine.firstAvailable(p, day + 1);
    return `На ${dateTxt}${who} няма свободни часове.${f ? ` Най-близо е ${fmtDate(dayToDate(f.day))} — ${engine.daySlots(p, f.day).slice(0, 5).map(fmtSlot).join(', ')}.` : ''}`;
  }
  if (time !== null) {
    const s = time / SLOT_MIN;
    if (slots.includes(s)) return `Да! На ${dateTxt} в ${fmtSlot(s)}${who} има свободно място. ✅ Изберете го в календара, за да резервирате.`;
    const near = [...slots].sort((a, b) => Math.abs(a - s) - Math.abs(b - s)).slice(0, 4).sort((a, b) => a - b);
    return `В ${fmtSlot(Math.round(s))} на ${dateTxt} е заето. Най-близките свободни часове са: ${near.map(fmtSlot).join(', ')}.`;
  }
  return `Свободни часове на ${dateTxt}${who} (${slots.length}):\n${slots.map(fmtSlot).join(', ')}`;
}

const INTENTS = [
  { id: 'greet', k: ['здравей', 'здрасти', 'добър ден', 'добро утро', 'добър вечер', 'привет', 'хей', 'hello', 'zdr'] },
  { id: 'thanks', k: ['благодар', 'мерси', 'thanks', 'супер', 'чудесно'] },
  { id: 'bookings', k: ['моите резерв', 'мои резерв', 'резервациите ми', 'имам ли резерв', 'моята резерв'] },
  { id: 'cancel', k: ['отказ', 'откажа', 'анулир', 'отмен', 'промен', 'премести'] },
  { id: 'payment', k: ['плащан', 'платя', 'плати', 'карта', 'превод', 'в брой', 'iban', 'сметка'] },
  { id: 'checkin', k: ['настаняван', 'напускан', 'check', 'кога мога да се настаня', 'до колко часа трябва'] },
  { id: 'availability', k: ['свобод', 'има ли място', 'има ли час', 'места', 'наличн', 'заето', 'кога мога', 'най-близ', 'най-ран', 'запиша', 'резервирам за', 'има ли маса', 'има ли свободна маса', 'има ли стая'] },
  { id: 'hours', k: ['работно време', 'работното време', 'работно', 'работите', 'отворено', 'отваряте', 'затваряте', 'до колко', 'от колко', 'почивен'] },
  { id: 'address', k: ['адрес', 'къде се намира', 'къде сте', 'локация', 'как да стигна', 'намирате'] },
  { id: 'contact', k: ['телефон', 'контакт', 'имейл', 'обадя', 'връзка с'] },
  { id: 'prices', k: ['цена', 'цени', 'колко струва', 'струва', 'такса', 'ценоразпис', 'колко ще ми излезе', 'депозит'] },
  { id: 'howto', k: ['как да резерв', 'как става', 'стъпки', 'как се прави', 'помощ', 'help'] },
  { id: 'about', k: ['за вас', 'кои сте', 'разкажете', 'информация за', 'екип'] },
  { id: 'list', k: ['какви бизнес', 'какво предлаг', 'обекти', 'списък', 'кои места', 'какви услуги има'] },
  { id: 'profile', k: ['профил', 'моите данни', 'смс', 'sms', 'напомн', 'смяна на телефон'] },
  { id: 'tech', k: ['оптимиз', 'алгоритъм', 'как работи системата', 'архитектур', 'бърза'] },
];

function scoreIntents(t) {
  const out = [];
  for (const it of INTENTS) {
    const s = it.k.filter((w) => t.includes(w)).length;
    if (s) out.push([it.id, s]);
  }
  return out.sort((a, b) => b[1] - a[1]);
}

/**
 * Главна функция. ctx = { biz, answers, profile, bookings }
 * Връща { text, confident, suggestions }.
 */
export function localReply(input, ctx) {
  const t = pad(norm(input));
  const mentioned = detectBusiness(t);
  const cfg = mentioned || ctx.biz || null;
  const intents = scoreIntents(t);
  let top = intents[0]?.[0];

  // Специфични FAQ на бизнеса имат приоритет пред общите намерения
  if (cfg) {
    const faq = cfg.faq.find((f) => has(t, f.k));
    if (faq && top !== 'availability' && top !== 'prices') return { text: faq.a, confident: true };
  }
  // Ако има дата или „за N души“ — най-вероятно питат за наличност
  if (!top && cfg && (parseDate(t) || parseGuests(t))) top = 'availability';

  const ask = () => ({
    text: 'За кой бизнес става дума? ' + BUSINESSES.map((b) => `${b.icon} ${b.category}`).join(' · '),
    confident: true,
    suggestions: BUSINESSES.slice(0, 4).map((b) => `Свободно ли е утре в ${b.id === 'hotel' ? 'хотела' : b.category.toLowerCase()}?`),
  });

  switch (top) {
    case 'greet':
      return {
        text: `Здравейте${ctx.profile ? ', ' + ctx.profile.fullName.split(' ')[0] : ''}! 👋 Аз съм AI асистентът на Резервирай.бг. Мога да проверя свободни часове, работно време, цени, условия и вашите резервации${cfg ? ` в ${cfg.name}` : ''}.`,
        confident: true,
        suggestions: cfg ? ['Кога е най-близкият свободен час?', 'Какво е работното време?', 'Колко струва?'] : ['Какви бизнеси има?', 'Как да резервирам?'],
      };
    case 'thanks':
      return { text: 'Моля! Ако имате още въпроси — тук съм. 😊', confident: true };
    case 'list':
      return { text: 'В системата има:\n' + BUSINESSES.map((b) => `${b.icon} ${b.name} — ${b.tagline}`).join('\n'), confident: true };
    case 'howto':
      return {
        text: '1) Изберете бизнес от началната страница.\n2) Отговорете на въпросите (брой хора, услуга и т.н.).\n3) Календарът веднага показва всички свободни дати за годината — изберете ден и час (за хотел: настаняване и напускане).\n4) Прегледайте и потвърдете.\n5) Изберете начин на плащане: в брой на място или по банков път.',
        confident: true,
      };
    case 'bookings': {
      const list = (ctx.bookings || []).filter((b) => b.status === 'confirmed');
      if (!list.length) return { text: 'Нямате активни резервации в момента.', confident: true };
      return {
        text:
          'Вашите активни резервации:\n' +
          list.map((b) => `• ${b.icon} ${b.bizName} — ${b.mode === 'stay' ? `${b.checkIn} → ${b.checkOut} (${pluralNights(b.nights)})` : `${b.date}, ${b.time}`} · код ${b.code}`).join('\n'),
        confident: true,
      };
    }
    case 'profile':
      if (!ctx.profile) return { text: 'Още нямате профил.', confident: true };
      return {
        text: `Профил: ${ctx.profile.fullName}, ${ctx.profile.phone}, ${ctx.profile.email}. SMS потвърждение: ${ctx.profile.sms === 'yes' ? 'да' : 'не'}; напомняне: ${ctx.profile.reminder === 'yes' ? ctx.profile.reminderBefore.replace('h', ' ч. преди') : 'не'}. Можете да ги промените от „👤“ горе вдясно.`,
        confident: true,
      };
    case 'tech':
      return {
        text: 'Накратко: всяка заетост се пази в плоски типизирани масиви (битова карта по ресурс/ден/15 мин), а хотелите — в сегментно дърво (O(log n) за престой). Проверка на цялата година отнема няколко милисекунди, резултатите се кешират по ден и при промяна се инвалидира само засегнатият ден. Подробности — в страница „Оптимизация“ и в README.',
        confident: true,
      };
    default:
      break;
  }

  if (!cfg && top) return ask();
  if (!cfg) {
    return {
      text: 'Не съм сигурен, че разбрах. Мога да помогна със: свободни часове („Има ли маса утре в 20:00 за 4 души?“), работно време, адрес, цени, плащане, отказ и вашите резервации.',
      confident: false,
      suggestions: ['Какви бизнеси има?', 'Как да резервирам?', 'Моите резервации'],
    };
  }

  const a = cfg.about;
  switch (top) {
    case 'availability':
      return { text: availability(cfg, t, ctx), confident: true };
    case 'hours':
      return { text: hoursText(cfg), confident: true };
    case 'checkin':
      return cfg.mode === 'stay'
        ? { text: `Настаняването е от ${cfg.checkInTime} ч., а напускането — до ${cfg.checkOutTime} ч.`, confident: true }
        : { text: `${cfg.name} не работи с настаняване — резервирате конкретен час.`, confident: true };
    case 'address':
      return { text: `📍 ${a.address}`, confident: true };
    case 'contact':
      return { text: `📞 ${a.phone}\n✉️ ${a.email}`, confident: true };
    case 'prices': {
      let txt = priceText(cfg);
      if (ctx.biz?.id === cfg.id && ctx.answers && cfg.mode !== 'stay') {
        const p = computePrice(cfg, ctx.answers);
        if (p !== null) txt += `\n\nЗа текущо избраните опции: ${money(p)}.`;
      }
      return { text: txt, confident: true };
    }
    case 'payment':
      return {
        text: `След резервацията избирате начин на плащане:\n• 💵 В брой на място\n• 🏦 По банков път — IBAN ${cfg.payment.iban} (${cfg.payment.bankName}), основание „Резервация <код>“.`,
        confident: true,
      };
    case 'cancel':
      return { text: `Условия в ${cfg.name}:\n${a.policies.map((p) => '• ' + p).join('\n')}\nОтменяте от „Моите резервации“ — мястото се освобождава веднага.`, confident: true };
    case 'about':
      return { text: `${a.story}\n\nЕкип: ${a.team.join(', ')}.`, confident: true };
    default:
      return {
        text: `Не намерих точен отговор за ${cfg.name}. Мога да кажа: работно време, адрес, цени, свободни часове, условия за отказ. За нещо специфично се свържете с тях: ${a.phone}.`,
        confident: false,
        suggestions: ['Кога е най-близкият свободен час?', 'Работно време', 'Цени'],
      };
  }
}
