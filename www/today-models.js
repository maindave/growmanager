/* Presentation-only derivations. No persistence or device actions. */
(() => {
  'use strict';
  function dayKey(value = new Date()) {
    const date = new Date(value);
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  }
  function lotAge(lot, now = new Date()) {
    if (!lot.timelineStartedOn) return 'Sin fecha de inicio';
    const start = Date.parse(`${lot.timelineStartedOn}T12:00:00`);
    const today = Date.parse(`${dayKey(now)}T12:00:00`);
    if (!Number.isFinite(start)) return 'Sin fecha de inicio';
    if (start > today) return 'Inicio previsto';
    const days = Math.round((today-start)/86400000);
    return `Día ${days+1} · semana ${Math.floor(days/7)+1}`;
  }
  function actionable(event) {
    return !event.archivedAt && !['completed','cancelled'].includes(event.status);
  }
  function overdue(events, now = new Date()) {
    // A recurrence has no per-occurrence completion state. Do not invent overdue instances.
    return events.filter(e => actionable(e) && (!e.recurrence || e.recurrence==='none') && new Date(e.endsAt || e.startsAt) < now);
  }
  function upcoming(events, occurrences, now = new Date()) {
    const end = new Date(now); end.setDate(end.getDate()+120);
    return events.filter(actionable).flatMap(e=>occurrences(e,now,end))
      .sort((a,b)=>a.occurrenceStart-b.occurrenceStart).slice(0,4);
  }
  function alerts(rows) { return rows.filter(r=>r.severity && r.severity!=='info' && !r.resolvedAt && !r.archivedAt); }
  globalThis.TodayModels = Object.freeze({dayKey,lotAge,actionable,overdue,upcoming,alerts});
})();
