import { useState } from 'react';
import { authApi, setToken } from '../api/auth';

// Combined login / register screen.
export default function Login({ onAuthed }) {
  const [mode, setMode] = useState('login'); // login | register
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const fn = mode === 'login' ? authApi.login : authApi.register;
      const { token, user } = await fn(username.trim(), password);
      setToken(token);
      onAuthed(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-sm mx-auto mt-16">
      <div className="bg-slate-800 rounded-2xl border border-slate-700 shadow-xl p-8">
        <h2 className="font-pixel text-sm text-yellow-300 text-center mb-6">
          {mode === 'login' ? 'Trainer Login' : 'New Trainer'}
        </h2>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-[10px] text-slate-400 mb-1">Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              placeholder="ash_ketchum"
              className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-[10px] text-slate-400 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              placeholder="••••••"
              className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-sm"
            />
          </div>

          {error && <p className="text-red-400 text-xs">⚠ {error}</p>}

          <button
            type="submit"
            disabled={busy || !username || !password}
            className="w-full py-2.5 rounded-lg bg-yellow-400 text-black font-pixel text-[10px] hover:bg-yellow-300 disabled:opacity-40"
          >
            {busy ? '…' : mode === 'login' ? 'Log In' : 'Create Account'}
          </button>
        </form>

        <p className="text-center text-xs text-slate-400 mt-5">
          {mode === 'login' ? "No account yet?" : 'Already have an account?'}{' '}
          <button
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login');
              setError(null);
            }}
            className="text-yellow-300 hover:underline"
          >
            {mode === 'login' ? 'Register' : 'Log in'}
          </button>
        </p>
      </div>
    </div>
  );
}
