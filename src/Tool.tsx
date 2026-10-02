// Keepsake: snap a receipt and get a nudge before the return window or the warranty runs out.
import { useEffect, useState } from "react";
import { idbDel, idbGet, idbSet, shrinkImage } from "./lib/idb";
import { downloadIcs, localDate } from "./lib/ics";
import { moneyFmt } from "./lib/money";
import { uid, useStored } from "./lib/store";
import { addDays, todayISO } from "./lib/time";
import { CurrencySelect, Section, Stat, Stats } from "./ui/kit";

const T = "keepsake";
type Receipt = { id: string; item: string; store: string; date: string; price: number; returnDays: number; warrantyMonths: number; serial: string; photo: boolean; returned?: boolean };
const plusMonths = (d: string, m: number) => { const x = new Date(d + "T12:00:00Z"); x.setUTCMonth(x.getUTCMonth() + m); return x.toISOString().slice(0, 10); };
const daysTo = (d: string) => Math.ceil((new Date(d + "T12:00:00Z").getTime() - new Date(todayISO() + "T12:00:00Z").getTime()) / 86400000);
const SAMPLE: Receipt[] = [
  { id: "r1", item: "Wireless headphones", store: "Mytek", date: addDays(todayISO(), -9), price: 349, returnDays: 14, warrantyMonths: 12, serial: "WH1000-88231", photo: false },
  { id: "r2", item: "Washing machine", store: "Batam", date: addDays(todayISO(), -400), price: 1299, returnDays: 7, warrantyMonths: 24, serial: "", photo: false },
  { id: "r3", item: "Running shoes", store: "Decathlon", date: addDays(todayISO(), -3), price: 189, returnDays: 30, warrantyMonths: 0, serial: "", photo: false },
  { id: "r4", item: "Laptop", store: "Tunisianet", date: addDays(todayISO(), -700), price: 2450, returnDays: 7, warrantyMonths: 24, serial: "5CD1234XYZ", photo: false },
];

function Photo({ id }: { id: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => { idbGet(`${T}:${id}`).then(v => setSrc(v ?? "")); }, [id]);
  return src ? <a href={src} target="_blank" rel="noreferrer"><img src={src} alt="Receipt" className="ks-photo" /></a> : null;
}

export default function Keepsake() {
  const [items, setItems] = useStored<Receipt[]>(T, "items", SAMPLE);
  const [cur, setCur] = useStored(T, "cur", "TND");
  const [d, setD] = useState({ item: "", store: "", date: todayISO(), price: "", returnDays: "14", warrantyMonths: "12", serial: "" });
  const [file, setFile] = useState<File | null>(null);
  const [q, setQ] = useState("");
  const money = moneyFmt(cur);
  const rows = items.map(r => ({ ...r, retEnd: addDays(r.date, r.returnDays), warEnd: r.warrantyMonths ? plusMonths(r.date, r.warrantyMonths) : "" }))
    .map(r => ({ ...r, retLeft: daysTo(r.retEnd), warLeft: r.warEnd ? daysTo(r.warEnd) : -1 }));
  const returnable = rows.filter(r => r.retLeft >= 0 && !r.returned);
  const covered = rows.filter(r => r.warLeft >= 0);
  const shown = rows.filter(r => !q || `${r.item} ${r.store} ${r.serial}`.toLowerCase().includes(q.toLowerCase())).sort((a, b) => b.date.localeCompare(a.date));

  const add = async (e: React.FormEvent) => {
    e.preventDefault(); if (!d.item.trim()) return;
    const id = uid();
    let photo = false;
    if (file) { await idbSet(`${T}:${id}`, await shrinkImage(file, 1200, 0.8)); photo = true; }
    setItems([{ id, item: d.item.trim(), store: d.store, date: d.date, price: parseFloat(d.price) || 0, returnDays: parseInt(d.returnDays) || 0, warrantyMonths: parseInt(d.warrantyMonths) || 0, serial: d.serial, photo }, ...items]);
    setD({ ...d, item: "", store: "", price: "", serial: "" }); setFile(null);
  };
  const reminders = () => downloadIcs("keepsake-reminders.ics", rows.flatMap(r => [
    ...(r.retLeft > 1 && !r.returned ? [{ title: `Last days to return: ${r.item} (${r.store})`, start: localDate(addDays(r.retEnd, -2)), allDay: true, alarmMinutes: 0 }] : []),
    ...(r.warLeft > 14 ? [{ title: `Warranty ends in 2 weeks: ${r.item}`, start: localDate(addDays(r.warEnd, -14)), allDay: true }] : []),
  ]), "Receipts and warranties");
  const badge = (left: number, kind: string) => left < 0 ? <span className="pill">{kind} over</span> : <span className={"pill " + (left <= 3 ? "bad" : left <= 14 ? "warn" : "good")}>{kind}: {left === 0 ? "last day" : left > 90 ? `${Math.round(left / 30)} months` : `${left} days`}</span>;

  return (
    <div className="stack">
      <Section title="Your receipts" aside={<><CurrencySelect id="ks-cur" value={cur} onChange={setCur} /><button className="btn small primary" style={{ alignSelf: "flex-end" }} onClick={reminders}>Calendar reminders</button></>}>
        <Stats><Stat value={items.length} label="Receipts" /><Stat value={returnable.length} label="Still returnable" tone={returnable.some(r => r.retLeft <= 3) ? "bad" : undefined} /><Stat value={covered.length} label="Under warranty" /><Stat value={money(covered.reduce((a, r) => a + r.price, 0))} label="Value covered" tone="good" /></Stats>
      </Section>
      {returnable.filter(r => r.retLeft <= 7).length > 0 && <Section title="Decide soon">
        {returnable.filter(r => r.retLeft <= 7).map(r => <div key={r.id} className="ks-row"><strong style={{ flex: 1 }}>{r.item} <span className="note">{r.store}</span></strong>{badge(r.retLeft, "Return")}<button className="btn small" onClick={() => setItems(items.map(x => x.id === r.id ? { ...x, returned: true } : x))}>I returned it</button><button className="btn ghost small" onClick={() => setItems(items.map(x => x.id === r.id ? { ...x, returnDays: 0 } : x))}>Keeping it</button></div>)}
      </Section>}
      <Section title="Add a receipt">
        <form className="stack" style={{ gap: 10 }} onSubmit={add}>
          <div className="row"><label className="field" style={{ flexGrow: 2 }}><span>Item</span><input id="ks-i" className="input" value={d.item} onChange={e => setD({ ...d, item: e.target.value })} /></label><label className="field"><span>Store</span><input id="ks-s" className="input" value={d.store} onChange={e => setD({ ...d, store: e.target.value })} /></label><label className="field"><span>Price</span><input id="ks-p" className="input num" value={d.price} onChange={e => setD({ ...d, price: e.target.value })} /></label></div>
          <div className="row" style={{ alignItems: "flex-end" }}>
            <label className="field"><span>Bought on</span><input id="ks-d" type="date" className="input" value={d.date} onChange={e => setD({ ...d, date: e.target.value })} /></label>
            <label className="field"><span>Return window (days)</span><input id="ks-r" className="input num" value={d.returnDays} onChange={e => setD({ ...d, returnDays: e.target.value })} /></label>
            <label className="field"><span>Warranty (months)</span><input id="ks-w" className="input num" value={d.warrantyMonths} onChange={e => setD({ ...d, warrantyMonths: e.target.value })} /></label>
            <label className="field"><span>Serial number</span><input id="ks-sn" className="input" value={d.serial} onChange={e => setD({ ...d, serial: e.target.value })} /></label>
          </div>
          <div className="row" style={{ alignItems: "center" }}><label className="btn small">{file ? `Photo: ${file.name}` : "Add a photo of the receipt"}<input type="file" accept="image/*" capture="environment" hidden onChange={e => setFile(e.target.files?.[0] ?? null)} /></label><button className="btn primary" type="submit">Save receipt</button></div>
        </form>
      </Section>
      <Section title="All receipts" aside={<input id="ks-q" type="search" className="input" style={{ width: 220 }} placeholder="Search" value={q} onChange={e => setQ(e.target.value)} aria-label="Search receipts" />}>
        <div className="ks-grid">{shown.map(r => (
          <article key={r.id} className="ks-card" style={{ opacity: r.returned ? 0.5 : 1 }}>
            {r.photo && <Photo id={r.id} />}
            <strong>{r.item}</strong><p className="note">{r.store} · {r.date} · {money(r.price)}</p>
            {r.serial && <p className="note" style={{ fontFamily: "var(--mono)" }}>S/N {r.serial}</p>}
            <div className="row" style={{ gap: 6 }}>{r.returned ? <span className="pill">Returned</span> : r.returnDays > 0 && badge(r.retLeft, "Return")}{r.warrantyMonths > 0 && badge(r.warLeft, "Warranty")}</div>
            <button className="btn ghost small danger" style={{ alignSelf: "flex-start" }} onClick={() => { setItems(items.filter(x => x.id !== r.id)); idbDel(`${T}:${r.id}`); }}>Delete</button>
          </article>
        ))}</div>
      </Section>
      <style>{`.ks-row{display:flex;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid var(--line);flex-wrap:wrap}.ks-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px}.ks-card{border:1px solid var(--line);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:6px}.ks-photo{width:100%;height:140px;object-fit:cover;border-radius:6px}`}</style>
    </div>
  );
}
