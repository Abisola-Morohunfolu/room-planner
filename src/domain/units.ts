export function formatLength(mm: number, units: 'metric' | 'imperial', compact = false): string {
  if (units === 'metric')
    return compact ? `${Number((mm / 1000).toFixed(2))} m` : `${Number(mm.toFixed(1))} mm`;
  const total = Math.round((mm / 25.4) * 16) / 16,
    feet = Math.floor(Math.abs(total) / 12),
    inches = Number((Math.abs(total) % 12).toFixed(4));
  return `${mm < 0 ? '-' : ''}${feet}′ ${inches}″`;
}
export function parseLength(value: string, units: 'metric' | 'imperial'): number | null {
  const text = value.trim();
  if (!text) return null;
  if (units === 'metric') {
    const match = text.match(/^(-?\d+(?:\.\d+)?)\s*(mm|cm|m)?$/i);
    if (!match) return null;
    return (
      Math.round(
        Number(match[1]) * ({ mm: 1, cm: 10, m: 1000 }[match[2]?.toLowerCase() ?? 'mm'] ?? 1) * 10,
      ) / 10
    );
  }
  const match = text.match(/^(-?\d+(?:\.\d+)?)\s*(?:ft|'|′)\s*(\d+(?:\.\d+)?)?\s*(?:in|"|″)?$/i);
  let inches;
  if (match)
    inches =
      (Math.abs(Number(match[1])) * 12 + Number(match[2] ?? 0)) * (Number(match[1]) < 0 ? -1 : 1);
  else {
    const numberMatch = text.match(/^(-?\d+(?:\.\d+)?)\s*(?:in|"|″)?$/i);
    if (!numberMatch) return null;
    inches = Number(numberMatch[1]);
  }
  return Math.round(inches * 25.4 * 10) / 10;
}
