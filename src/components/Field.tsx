import { useEffect, useState } from 'react';
import { formatLength, parseLength } from '../domain/units';
interface FieldProps {
  label: string;
  value: number;
  onCommit: (value: number) => boolean | void;
  units?: 'metric' | 'imperial';
  min?: number;
  max?: number;
  step?: number;
}
export function NumberField({ label, value, onCommit, units, min, max, step = 0.1 }: FieldProps) {
  const format = (number: number) => (units ? formatLength(number, units) : String(number));
  const [draft, setDraft] = useState(format(value)),
    [error, setError] = useState(false);
  useEffect(() => {
    setDraft(units ? formatLength(value, units) : String(value));
    setError(false);
  }, [value, units]);
  const commit = () => {
    const parsed = units ? parseLength(draft, units) : draft.trim() ? Number(draft) : null;
    if (
      parsed === null ||
      !Number.isFinite(parsed) ||
      (min !== undefined && parsed < min) ||
      (max !== undefined && parsed > max)
    ) {
      setError(true);
      return;
    }
    if (onCommit(parsed) === false) {
      setError(true);
      return;
    }
    setDraft(format(parsed));
    setError(false);
  };
  return (
    <label className="field">
      <span>
        {label}
        {units && <small>{units === 'metric' ? 'mm' : 'ft / in'}</small>}
      </span>
      <input
        aria-label={label}
        aria-invalid={error}
        value={draft}
        inputMode={units ? 'text' : 'decimal'}
        step={step}
        onChange={(event) => {
          setDraft(event.target.value);
          setError(false);
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
            event.currentTarget.blur();
          }
          if (event.key === 'Escape') {
            setDraft(format(value));
            setError(false);
          }
        }}
      />
      {error && (
        <small className="field-error">
          Enter a valid{' '}
          {min !== undefined ? `value from ${min}${max ? ` to ${max}` : ''}` : 'measurement'}.
        </small>
      )}
    </label>
  );
}
export function TextField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: string;
  onCommit: (value: string) => boolean | void;
}) {
  const [draft, setDraft] = useState(value),
    [error, setError] = useState(false);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed.length > 100 || onCommit(trimmed) === false) {
      setError(true);
      return;
    }
    setError(false);
  };
  return (
    <label className="field">
      <span>{label}</span>
      <input
        aria-label={label}
        aria-invalid={error}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
      />
      {error && <small className="field-error">Use 1–100 plain text characters.</small>}
    </label>
  );
}
