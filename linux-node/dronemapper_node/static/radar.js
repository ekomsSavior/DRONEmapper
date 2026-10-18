// Church of Malware / saviorSEC. AGPL-3.0-or-later.
export function contactPoint(contact, mode, range = 2000) {
  if (mode === 'positions') {
    if (!Number.isFinite(contact.bearing) || !Number.isFinite(contact.distance_m) || contact.distance_m < 0) return null;
    if (!Number.isFinite(range) || range <= 0) range = 2000;
    const radius = Math.min(202, Math.max(0, contact.distance_m / range * 202));
    const angle = contact.bearing * Math.PI / 180;
    return {x: 250 + Math.sin(angle) * radius, y: 250 - Math.cos(angle) * radius,
      outside: contact.distance_m > range};
  }
  // Layout angle is intentionally not a bearing. Signal strength has no distance scale.
  let hash = 2166136261;
  for (const c of contact.key) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  const angle = (hash >>> 0) % 360 * Math.PI / 180;
  const rssi = Number.isFinite(contact.rssi_dbm) ? contact.rssi_dbm : -100;
  const radius = 48 + Math.min(1, Math.max(0, (-rssi - 30) / 70)) * 152;
  return {x: 250 + Math.sin(angle) * radius, y: 250 - Math.cos(angle) * radius, outside: false};
}
