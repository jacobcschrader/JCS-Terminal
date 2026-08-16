// =====================================================================
//  Project timeline — one row per thing that happened on a project.
//  kinds: created · stage · confirmed · files · cover · lock · delivery
//         · invoice · approved · changes · proposal · accepted · reminder
//         · testimonial · note
//  actor: admin | client | system
// =====================================================================
async function logEvent(s, bookingId, kind, label, actor, meta) {
  const id = parseInt(bookingId, 10);
  if (!id) return;
  try {
    await s`INSERT INTO project_events (booking_id, kind, label, actor, meta)
            VALUES (${id}, ${String(kind || "note").slice(0, 40)}, ${String(label || "").slice(0, 400)},
                    ${String(actor || "system").slice(0, 20)}, ${meta ? String(meta).slice(0, 2000) : ""})`;
  } catch (e) { /* the timeline is never worth failing the action for */ }
}
module.exports = { logEvent };
