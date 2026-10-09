import { hasPendingChanges } from '../sync/pending';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Brand } from '../components/Brand';
import { authClient, safeReturnPath } from '../auth/client';
import { useAccount } from '../auth/AccountContext';
import { Dialog } from '../components/Dialog';
import { useSync } from '../sync/SyncContext';
import type { StoredProject } from '../persistence/database';
import { database, listProjects } from '../persistence/database';
import { downloadPlan } from '../export/planFile';
export default function SignInPage() {
  const engine = useSync(),
    [pendingSignOut, setPendingSignOut] = useState<StoredProject[] | null>(null),
    [email, setEmail] = useState(''),
    [code, setCode] = useState(''),
    [sent, setSent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [configured, setConfigured] = useState<boolean | null>(null),
    account = useAccount(),
    navigate = useNavigate(),
    [parameters] = useSearchParams();
  useEffect(() => {
    void fetch('/api/config')
      .then((response) => response.json())
      .then((config) =>
        setConfigured(
          !!config &&
            typeof config === 'object' &&
            'emailConfigured' in config &&
            config.emailConfigured === true,
        ),
      )
      .catch(() => setConfigured(false));
  }, []);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (!sent) {
        const result = await authClient.emailOtp.sendVerificationOtp({ email, type: 'sign-in' });
        if (result.error) throw new Error(result.error.message ?? 'The code could not be sent.');
        setSent(true);
      } else {
        const result = await authClient.signIn.emailOtp({ email, otp: code });
        if (result.error) throw new Error(result.error.message ?? 'Check the code and try again.');
        navigate(safeReturnPath(parameters.get('returnTo')));
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Sign-in failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };
  const finishSignOut = async () => {
    setBusy(true);
    try {
      const result = await authClient.signOut();
      if (result.error)
        throw new Error(result.error.message ?? 'Sign-out failed. Please try again.');
      await database.projects.where('partition').equals(account.partition).delete();
      navigate('/projects');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Sign-out failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };
  const signOut = async () => {
    setBusy(true);
    setError(null);
    try {
      await engine?.resume();
      const records = [
        ...(await listProjects(account.partition)),
        ...(await listProjects(account.partition, true)),
      ];
      const pending = records.filter((record) => hasPendingChanges(record));
      if (pending.length) setPendingSignOut(pending);
      else await finishSignOut();
    } catch {
      setError('Your device plans could not be checked. Download them before signing out.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="sign-in-page">
      <header className="site-header">
        <Brand />
        <Link to="/projects">Back to your rooms</Link>
      </header>
      <main className="auth-form">
        <h1>{account.email ? 'Your account.' : 'Your plans, wherever you are.'}</h1>
        {account.email ? (
          <>
            <p>Signed in as {account.email}</p>
            <button onClick={() => void signOut()} disabled={busy}>
              Sign out
            </button>
          </>
        ) : (
          <>
            <p>
              Sign in with a one-time email code to back up selected rooms online. Your device plans
              stay yours.
            </p>
            {configured === false && (
              <div className="notice">
                <strong>Local development mode</strong>
                <p>
                  Email delivery will be configured later. You can keep planning, saving on this
                  device, and exporting plan files.
                </p>
              </div>
            )}
            <form onSubmit={(event) => void submit(event)}>
              <label className="field">
                <span>Email address</span>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  disabled={sent}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>
              {sent && (
                <label className="field">
                  <span>Six-digit code</span>
                  <input
                    required
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                  />
                </label>
              )}
              <button className="primary full-width" disabled={busy || configured !== true}>
                {busy ? 'Please wait…' : sent ? 'Sign in' : 'Email me a code'}
              </button>
              {sent && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setSent(false);
                    setCode('');
                  }}
                >
                  Resend / change email
                </button>
              )}
            </form>
          </>
        )}
        {error && (
          <p role="alert" className="field-error">
            {error}
          </p>
        )}
        <Link className="text-button" to="/projects">
          Continue with device plans →
        </Link>
      </main>
      {pendingSignOut && (
        <Dialog title="Keep your unsynced changes." onClose={() => setPendingSignOut(null)}>
          <p>
            {pendingSignOut.length} account plans still have changes waiting for online backup.
            Signing out clears this account’s device cache.
          </p>
          <button
            className="primary full-width"
            disabled={busy}
            onClick={() => {
              pendingSignOut.forEach((record) => downloadPlan(record.document));
              void finishSignOut();
            }}
          >
            Download plan files and sign out
          </button>
          <button className="full-width" disabled={busy} onClick={() => void finishSignOut()}>
            Discard unsynced account changes and sign out
          </button>
          <button className="text-button" onClick={() => setPendingSignOut(null)}>
            Keep planning
          </button>
        </Dialog>
      )}
    </div>
  );
}
