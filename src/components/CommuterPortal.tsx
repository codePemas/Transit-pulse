'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  MapPin,
  Clock,
  Navigation,
  Sparkles,
  Wallet,
  QrCode,
  Plus,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  ArrowUpRight,
  ArrowDownLeft,
  WifiOff,
  RefreshCw
} from 'lucide-react';
import {
  RouteItem,
  BusTelemetry,
  FleetIncident
} from '@/types/transit';

interface WalletTicketItem {
  id?: number | string;
  ticket_code: string;
  route_code: string;
  route_name?: string;
  fare_zar?: number;
  fare?: number;
  status: string;
  issued_at?: string;
  validated_at?: string | null;
}

interface WalletTransactionItem {
  id: number | string;
  tx_type: 'TOPUP' | 'TICKET_PURCHASE' | string;
  title: string;
  amount_zar: number;
  created_at: string;
}

interface CommuterWalletPayload {
  balance_zar: number;
  tickets: WalletTicketItem[];
  transactions: WalletTransactionItem[];
}

interface CommuterPortalProps {
  token: string;
  routes: RouteItem[];
  buses: BusTelemetry[];
  incidents: FleetIncident[];
  selectedRoute: RouteItem;
  activeBus: BusTelemetry;
  trackedTripId: number;
  onSelectRoute: (route: RouteItem) => void;
  onSelectBus: (bus: BusTelemetry) => void;
  onWalletMutated: () => void;
}

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:8000';

export default function CommuterPortal({
  token,
  routes,
  buses,
  incidents,
  selectedRoute,
  activeBus,
  trackedTripId,
  onSelectRoute,
  onSelectBus,
  onWalletMutated
}: CommuterPortalProps) {
  const [activeTab, setActiveTab] = useState<'map' | 'wallet'>('map');
  const [walletData, setWalletData] = useState<CommuterWalletPayload | null>(null);
  const [loadingWallet, setLoadingWallet] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [backendOffline, setBackendOffline] = useState(false);

  const isAnyBusy = busyAction !== null;

  const getRouteFare = (route: RouteItem): number => {
    const raw =
      (route as unknown as Record<string, unknown>).fare_zar ??
      (route as unknown as Record<string, unknown>).fare;
    return typeof raw === 'number' && raw > 0 ? raw : 15;
  };

  const getRouteFrequency = (route: RouteItem): string => {
    const raw = (route as unknown as Record<string, unknown>).frequency;
    return typeof raw === 'string' && raw.trim() ? raw : 'Peak every 15 mins';
  };

  const getStopBaseEta = (stop: unknown, index: number): number => {
    if (stop && typeof stop === 'object') {
      const rec = stop as Record<string, unknown>;
      if (typeof rec.baseEta === 'number') return rec.baseEta;
      if (typeof rec.eta_minutes === 'number') return rec.eta_minutes;
      if (typeof rec.eta === 'number') return rec.eta;
    }
    return (index + 1) * 6;
  };

  const fetchWallet = useCallback(
    async (silent = false) => {
      if (!silent) setLoadingWallet(true);
      try {
        const res = await fetch(`${API_BASE}/ops/wallet`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) {
          setBackendOffline(true);
          return;
        }
        const data = await res.json();
        setBackendOffline(false);
        setWalletData({
          balance_zar: typeof data.balance_zar === 'number' ? data.balance_zar : 0,
          tickets: Array.isArray(data.tickets) ? data.tickets : [],
          transactions: Array.isArray(data.transactions) ? data.transactions : []
        });
      } catch {
        setBackendOffline(true);
      } finally {
        if (!silent) setLoadingWallet(false);
      }
    },
    [token]
  );

  useEffect(() => {
    fetchWallet();
  }, [fetchWallet]);

  // Keep passes & balance synced while user is on the Wallet tab (e.g. after driver validation)
  useEffect(() => {
    if (activeTab !== 'wallet') return;
    fetchWallet(true);
    const interval = setInterval(() => {
      fetchWallet(true);
    }, 4000);
    return () => clearInterval(interval);
  }, [activeTab, fetchWallet]);

  const handleTopUp = async (amountZar: number) => {
    const actionKey = `topup-${amountZar}`;
    if (isAnyBusy) return;
    setBusyAction(actionKey);
    setFeedback(null);
    try {
      const res = await fetch(`${API_BASE}/ops/wallet/topup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ amount_zar: amountZar })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const detailText =
          typeof data?.detail === 'string'
            ? data.detail
            : Array.isArray(data?.detail)
            ? data.detail.map((d: { msg?: string }) => d.msg).join(', ')
            : `HTTP ${res.status}`;
        setFeedback({ type: 'err', text: `Top-up failed (${res.status}): ${detailText}` });
        return;
      }
      setBackendOffline(false);
      await fetchWallet(true);
      onWalletMutated();
      setFeedback({ type: 'ok', text: `Added R${amountZar.toFixed(2)} to Transit Pulse Pay.` });
    } catch {
      setBackendOffline(true);
      setFeedback({ type: 'err', text: 'Backend unreachable while processing top-up.' });
    } finally {
      setBusyAction(null);
    }
  };

  const handleBuyTicket = async (route: RouteItem) => {
    const actionKey = `buy-${route.code}`;
    if (isAnyBusy) return;
    const fareZar = getRouteFare(route);
    setBusyAction(actionKey);
    setFeedback(null);
    try {
      const res = await fetch(`${API_BASE}/ops/tickets/buy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          route_code: route.code,
          route_name: route.name,
          fare_zar: fareZar
        })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const detailText =
          typeof data?.detail === 'string'
            ? data.detail
            : Array.isArray(data?.detail)
            ? data.detail.map((d: { msg?: string }) => d.msg).join(', ')
            : 'Unable to issue digital ticket.';
        setFeedback({ type: 'err', text: detailText });
      } else {
        setBackendOffline(false);
        await fetchWallet(true);
        onWalletMutated();
        const issuedCode = data?.ticket?.ticket_code || 'PASS-ISSUED';
        setFeedback({ type: 'ok', text: `Pass ${issuedCode} ready for ${route.code}.` });
      }
    } catch {
      setBackendOffline(true);
      setFeedback({ type: 'err', text: 'Backend unreachable while issuing pass.' });
    } finally {
      setBusyAction(null);
    }
  };

  const handleValidateTicket = async (ticketCode: string) => {
    const actionKey = `validate-${ticketCode}`;
    if (isAnyBusy) return;
    setBusyAction(actionKey);
    setFeedback(null);
    try {
      const res = await fetch(`${API_BASE}/ops/tickets/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ ticket_code: ticketCode })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setFeedback({ type: 'err', text: data?.detail || 'Validation error' });
      } else {
        setBackendOffline(false);
        await fetchWallet(true);
        setFeedback({
          type: 'ok',
          text: `Boarded! Pass ${ticketCode} validated at ${data?.validated_at ?? 'now'}.`
        });
      }
    } catch {
      setBackendOffline(true);
      setFeedback({ type: 'err', text: 'Unable to validate pass right now.' });
    } finally {
      setBusyAction(null);
    }
  };

  const handleCopyCode = (code: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(code).catch(() => {});
    }
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const activeRouteIncidents = incidents.filter(
    (inc) => inc.is_active && inc.route_code === selectedRoute.code
  );
  const routeDelay = activeRouteIncidents.reduce((sum, inc) => sum + inc.delay_minutes, 0);

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {backendOffline && (
        <div className="px-3 py-2 bg-amber-500/15 border-b border-amber-500/35 text-amber-200 text-[11px] flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 font-medium">
            <WifiOff className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            Live backend paused — showing latest cached state.
          </span>
          <button
            onClick={() => fetchWallet(true)}
            className="px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-100 font-semibold shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {/* Thumb-friendly Mode Switcher */}
      <div className="grid grid-cols-2 p-2.5 sm:p-3 gap-2 border-b border-slate-800 bg-slate-950/40 shrink-0">
        <button
          onClick={() => setActiveTab('map')}
          className={`min-h-[42px] py-2 px-3 rounded-xl text-xs font-semibold transition flex items-center justify-center gap-2 ${
            activeTab === 'map'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
              : 'bg-slate-800/70 text-slate-400 hover:text-white'
          }`}
        >
          <Navigation className="w-3.5 h-3.5 shrink-0" />
          <span>Live Map & ETA</span>
        </button>
        <button
          onClick={() => setActiveTab('wallet')}
          className={`min-h-[42px] py-2 px-3 rounded-xl text-xs font-semibold transition flex items-center justify-center gap-2 ${
            activeTab === 'wallet'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
              : 'bg-slate-800/70 text-slate-400 hover:text-white'
          }`}
        >
          <Wallet className="w-3.5 h-3.5 shrink-0" />
          <span>Fare Wallet & QR</span>
        </button>
      </div>

      {activeTab === 'map' ? (
        <div className="flex-1 overflow-y-auto divide-y divide-slate-800/80">
          {/* Corridors */}
          <div className="p-3.5 sm:p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2.5">
              Municipal Corridors
            </h2>
            <div className="space-y-2">
              {routes.map((route, rIdx) => {
                const isSelected = route.id === selectedRoute.id;
                const corridorIncidents = incidents.filter(
                  (i) => i.is_active && i.route_code === route.code
                );
                const corridorDelay = corridorIncidents.reduce(
                  (s, i) => s + i.delay_minutes,
                  0
                );
                const fare = getRouteFare(route);

                return (
                  <button
                    key={`${route.id}-${route.code}-${rIdx}`}
                    onClick={() => onSelectRoute(route)}
                    className={`w-full text-left p-3 sm:p-3.5 rounded-xl border transition-all ${
                      isSelected
                        ? 'bg-slate-800/90 border-blue-500/60 shadow-md'
                        : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span
                        className="text-xs font-bold px-2 py-0.5 rounded"
                        style={{ backgroundColor: `${route.color}25`, color: route.color }}
                      >
                        {route.code}
                      </span>
                      <div className="flex items-center gap-1.5 flex-wrap justify-end">
                        {corridorDelay > 0 && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30">
                            +{corridorDelay}m ({corridorIncidents.length})
                          </span>
                        )}
                        <span className="text-xs font-mono text-slate-300 font-semibold">
                          R{fare.toFixed(2)}
                        </span>
                      </div>
                    </div>
                    <p className="font-medium text-sm text-slate-100 leading-snug">{route.name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{getRouteFrequency(route)}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Live Fleet */}
          <div className="p-3.5 sm:p-4 bg-slate-900/40">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2.5 flex items-center gap-1.5">
              <Navigation className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              Live Municipal Fleet
            </h2>
            <div className="grid grid-cols-1 xs:grid-cols-3 sm:grid-cols-3 gap-2">
              {buses.map((bus, bIdx) => {
                const isSelected = bus.trip_id === trackedTripId;
                return (
                  <button
                    key={`${bus.trip_id}-${bus.vehicle_plate}-${bIdx}`}
                    onClick={() => onSelectBus(bus)}
                    className={`min-h-[56px] p-2.5 rounded-xl border text-left transition flex flex-col justify-between ${
                      isSelected
                        ? 'bg-blue-600/20 border-blue-500 text-white'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <p className="text-[11px] font-bold text-slate-200 truncate">
                      {bus.vehicle_plate}
                    </p>
                    <div className="flex items-center justify-between gap-1 mt-1">
                      <span className="text-[10px] font-mono text-blue-400">{bus.route_code}</span>
                      <span className="text-[10px] text-slate-500">{bus.occupancy}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Aggregated Corridor Advisories & Stop ETAs */}
          <div className="p-3.5 sm:p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                Live Stop ETAs
              </h2>
              <span className="text-[11px] font-mono text-blue-400 font-medium truncate">
                {activeBus.vehicle_plate}
              </span>
            </div>

            {activeRouteIncidents.length > 0 && (
              <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/35 text-rose-200 text-xs space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 font-bold text-rose-300">
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>Combined Corridor Delay: +{routeDelay} mins</span>
                  </div>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-200">
                    {activeRouteIncidents.length}{' '}
                    {activeRouteIncidents.length === 1 ? 'alert' : 'alerts'}
                  </span>
                </div>
                <div className="space-y-1.5 pt-1 border-t border-rose-500/20">
                  {activeRouteIncidents.map((inc) => (
                    <div
                      key={inc.id}
                      className="flex items-start justify-between gap-2 text-[11px] text-rose-100/90"
                    >
                      <span className="leading-snug">{inc.description}</span>
                      <span className="font-mono font-bold text-rose-300 shrink-0">
                        +{inc.delay_minutes}m
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              {selectedRoute.stops.map((stop, index) => (
                <div
                  key={`${stop.name}-${index}`}
                  className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-6 h-6 rounded-full bg-slate-800 text-xs font-bold flex items-center justify-center text-slate-300 border border-slate-700 shrink-0">
                      {index + 1}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-200 truncate">{stop.name}</p>
                      <p className="text-[11px] font-mono text-slate-500 flex items-center gap-1 mt-0.5 truncate">
                        <MapPin className="w-3 h-3 shrink-0" />
                        {stop.coords[0].toFixed(3)}, {stop.coords[1].toFixed(3)}
                      </p>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 text-xs font-mono font-semibold border border-emerald-500/20 shrink-0">
                    <Clock className="w-3 h-3" />
                    {getStopBaseEta(stop, index) + routeDelay}m
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-4 space-y-4">
          {feedback && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
                feedback.type === 'ok'
                  ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-200'
                  : 'bg-rose-500/15 border-rose-500/35 text-rose-200'
              }`}
            >
              {feedback.type === 'ok' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              )}
              <span className="leading-snug">{feedback.text}</span>
            </div>
          )}

          {/* Wallet Card */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-xl">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider font-semibold text-blue-100">
                Transit Pulse Pay (ZAR)
              </span>
              <button
                type="button"
                disabled={isAnyBusy}
                onClick={() => fetchWallet(false)}
                title="Refresh wallet"
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-blue-100 transition"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingWallet ? 'animate-spin' : ''}`} />
              </button>
            </div>
            <p className="text-2xl sm:text-3xl font-bold font-mono mt-2">
              R {walletData ? walletData.balance_zar.toFixed(2) : '...'}
            </p>
            <div className="grid grid-cols-2 gap-2 mt-4">
              <button
                type="button"
                disabled={isAnyBusy}
                onClick={() => handleTopUp(50)}
                className="min-h-[42px] py-2 px-3 rounded-xl bg-white/15 hover:bg-white/25 disabled:opacity-50 text-xs font-bold transition flex items-center justify-center gap-1"
              >
                <Plus className="w-3.5 h-3.5 shrink-0" />
                <span>{busyAction === 'topup-50' ? 'Adding...' : 'R50 Top Up'}</span>
              </button>
              <button
                type="button"
                disabled={isAnyBusy}
                onClick={() => handleTopUp(100)}
                className="min-h-[42px] py-2 px-3 rounded-xl bg-white text-blue-700 hover:bg-blue-50 disabled:opacity-50 text-xs font-bold transition flex items-center justify-center gap-1"
              >
                <Plus className="w-3.5 h-3.5 shrink-0" />
                <span>{busyAction === 'topup-100' ? 'Adding...' : 'R100 Top Up'}</span>
              </button>
            </div>
          </div>

          {/* Buy Single-Trip Digital Ticket */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2.5">
              Buy Single-Trip Digital Ticket
            </h3>
            <div className="space-y-2">
              {routes.map((route, rIdx) => {
                const fare = getRouteFare(route);
                const buyingThis = busyAction === `buy-${route.code}`;
                return (
                  <div
                    key={`buy-${route.id}-${route.code}-${rIdx}`}
                    className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white leading-snug">
                        {route.code} • {route.name}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Valid on any municipal bus on corridor
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={isAnyBusy}
                      onClick={() => handleBuyTicket(route)}
                      className="min-h-[38px] w-full sm:w-auto px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold transition shrink-0"
                    >
                      {buyingThis ? 'Issuing...' : `Buy R${fare.toFixed(2)}`}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Active & Recent Passes */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2.5">
              Active & Recent Passes
            </h3>
            {loadingWallet && !walletData ? (
              <p className="text-xs text-slate-500">Syncing passes...</p>
            ) : !walletData || walletData.tickets.length === 0 ? (
              <p className="text-xs text-slate-500">No passes purchased yet.</p>
            ) : (
              <div className="space-y-2">
                {walletData.tickets.map((t: WalletTicketItem, tIdx: number) => {
                  const ticketFare = Number(t.fare_zar ?? t.fare ?? 15);
                  const validatingThis = busyAction === `validate-${t.ticket_code}`;
                  return (
                    <div
                      key={`ticket-${t.id ?? 'na'}-${t.ticket_code}-${tIdx}`}
                      className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-white flex items-center gap-1.5">
                          <QrCode className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                          <span>
                            {t.route_code} — R{ticketFare.toFixed(2)}
                          </span>
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase shrink-0 ${
                            t.status === 'ACTIVE'
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {t.status}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] font-mono text-slate-300 truncate">
                          {t.ticket_code}
                        </p>
                        <button
                          type="button"
                          onClick={() => handleCopyCode(t.ticket_code)}
                          className="min-h-[30px] px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[10px] font-semibold text-slate-300 flex items-center gap-1 shrink-0"
                        >
                          {copiedCode === t.ticket_code ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400" /> Copied
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" /> Copy
                            </>
                          )}
                        </button>
                      </div>

                      {t.status === 'ACTIVE' && (
                        <button
                          type="button"
                          disabled={isAnyBusy}
                          onClick={() => handleValidateTicket(t.ticket_code)}
                          className="min-h-[38px] w-full py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 disabled:opacity-50 border border-blue-500/40 text-blue-300 text-xs font-semibold transition"
                        >
                          {validatingThis ? 'Validating...' : 'Tap Self-Check-In Scanner'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Recent ZAR Wallet Transactions */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2.5">
              Recent Wallet Activity
            </h3>
            {!walletData || walletData.transactions.length === 0 ? (
              <p className="text-xs text-slate-500">No transactions recorded yet.</p>
            ) : (
              <div className="space-y-1.5">
                {walletData.transactions.slice(0, 6).map((tx) => {
                  const isTopup = tx.tx_type === 'TOPUP' || Number(tx.amount_zar) > 0;
                  return (
                    <div
                      key={tx.id}
                      className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/80 flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                            isTopup
                              ? 'bg-emerald-500/15 text-emerald-400'
                              : 'bg-blue-500/15 text-blue-400'
                          }`}
                        >
                          {isTopup ? (
                            <ArrowDownLeft className="w-3.5 h-3.5" />
                          ) : (
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-slate-200 truncate">{tx.title}</p>
                          <p className="text-[10px] font-mono text-slate-500">{tx.created_at}</p>
                        </div>
                      </div>
                      <span
                        className={`text-xs font-mono font-bold shrink-0 ${
                          isTopup ? 'text-emerald-400' : 'text-slate-300'
                        }`}
                      >
                        {isTopup ? '+' : '-'}R{Math.abs(Number(tx.amount_zar)).toFixed(2)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}