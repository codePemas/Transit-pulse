'use client';

import React, { useState } from 'react';
import { Compass, Lock, User, ShieldCheck, KeyRound, AlertCircle, UserPlus } from 'lucide-react';
import { AuthUser, UserRole } from '@/types/transit';

interface AuthGateProps {
  onAuthenticated: (user: AuthUser, token: string) => void;
}

const API_BASE = 'http://127.0.0.1:8000';

export default function AuthGate({ onAuthenticated }: AuthGateProps) {
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [selectedRole, setSelectedRole] = useState<UserRole>('commuter');

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accessCode, setAccessCode] = useState('');

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);

    try {
      const endpoint = authMode === 'login' ? '/auth/login' : '/auth/register';
      const payload =
        authMode === 'login'
          ? { email, password, role: selectedRole }
          : {
              full_name: fullName,
              email,
              password,
              role: selectedRole,
              access_code: selectedRole !== 'commuter' ? accessCode : null
            };

      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || 'Authentication failed. Please check your credentials.');
      }

      sessionStorage.setItem('tp_jwt', data.access_token);
      sessionStorage.setItem('tp_user', JSON.stringify(data.user));
      onAuthenticated(data.user, data.access_token);
    } catch (err: any) {
      setErrorMsg(err.message || 'Unable to connect to authentication server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-full items-center justify-center bg-slate-950 text-slate-100 font-sans relative overflow-hidden p-4">
      <div className="absolute w-[600px] h-[600px] bg-blue-600/10 rounded-full blur-3xl pointer-events-none -top-32 -left-32" />
      <div className="absolute w-[600px] h-[600px] bg-emerald-600/10 rounded-full blur-3xl pointer-events-none -bottom-32 -right-32" />

      <div className="w-full max-w-md p-8 bg-slate-900/95 backdrop-blur-xl border border-slate-800 rounded-3xl shadow-2xl z-10">
        <div className="flex items-center gap-3.5 mb-6">
          <div className="p-3 bg-blue-600 rounded-2xl text-white shadow-lg shadow-blue-600/30">
            <Compass className="w-7 h-7" />
          </div>
          <div>
            <h1 className="font-extrabold text-xl tracking-tight text-white">Transit Pulse</h1>
            <p className="text-xs text-slate-400">Buffalo City Fleet Management OS</p>
          </div>
        </div>

        {/* Role Selector */}
        <div className="grid grid-cols-3 p-1.5 gap-1 mb-6 bg-slate-950 rounded-2xl border border-slate-800/80">
          {(['commuter', 'driver', 'admin'] as UserRole[]).map((role) => (
            <button
              key={role}
              type="button"
              onClick={() => {
                setSelectedRole(role);
                setErrorMsg(null);
              }}
              className={`py-2 px-2 rounded-xl text-xs font-bold capitalize transition ${
                selectedRole === role
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {role === 'admin' ? 'Management' : role}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between mb-5 px-1">
          <h2 className="text-sm font-bold text-white capitalize">
            {authMode === 'login'
              ? `${selectedRole === 'admin' ? 'Management' : selectedRole} Sign In`
              : `Register ${selectedRole === 'admin' ? 'Management' : selectedRole}`}
          </h2>
          <button
            type="button"
            onClick={() => {
              setAuthMode(authMode === 'login' ? 'signup' : 'login');
              setErrorMsg(null);
            }}
            className="text-xs text-blue-400 hover:underline font-semibold"
          >
            {authMode === 'login' ? 'Create an account' : 'Back to Sign In'}
          </button>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {authMode === 'signup' && (
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">Full Name</label>
              <div className="relative">
                <UserPlus className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
                <input
                  type="text"
                  required
                  minLength={2}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Liyema Vanda"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 pl-10 pr-4 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">Email Address</label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={`${selectedRole}@transitpulse.co.za`}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 pl-10 pr-4 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">
              Password {authMode === 'signup' && '(Min. 8 characters)'}
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 pl-10 pr-4 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition"
              />
            </div>
          </div>

          {authMode === 'signup' && selectedRole !== 'commuter' && (
            <div>
              <label className="block text-xs font-semibold text-amber-400 mb-1.5">
                {selectedRole === 'driver'
                  ? 'Fleet Driver Authorization Code'
                  : 'Management Security Clearance Code'}
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-amber-500 absolute left-3.5 top-3.5" />
                <input
                  type="text"
                  required
                  value={accessCode}
                  onChange={(e) => setAccessCode(e.target.value)}
                  placeholder={selectedRole === 'driver' ? 'e.g. EC-DRV-2026' : 'e.g. BCM-OPS-2026'}
                  className="w-full bg-slate-950 border border-amber-500/40 rounded-xl py-3 pl-10 pr-4 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-400 transition"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 mt-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-lg shadow-blue-600/30 transition flex items-center justify-center gap-2"
          >
            <ShieldCheck className="w-4 h-4" />
            {loading
              ? 'Verifying Credentials...'
              : authMode === 'login'
              ? `Sign In to ${selectedRole.toUpperCase()} Portal`
              : 'Create Verified Account'}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-slate-800 text-center">
          <p className="text-[11px] text-slate-500">
            Cryptographic Bcrypt & JWT Role-Based Access Control
          </p>
        </div>
      </div>
    </div>
  );
}