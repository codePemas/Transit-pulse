'use client';

import React, { useState } from 'react';
import {
  Activity,
  DollarSign,
  Ticket,
  AlertTriangle,
  CheckCircle,
  Bus,
  CheckCheck,
  Gauge,
  Radio,
  Send,
  ShieldCheck,
  MapPin,
} from 'lucide-react';
import { FleetIncident, BusTelemetry, RouteItem } from '@/types/transit';

interface AdminPortalProps {
  token: string;
  routes?: RouteItem[];
  totalFareRevenue: number;
  ticketsSoldToday: number;
  incidents: FleetIncident[];
  buses: BusTelemetry[];
  onSelectBus: (bus: BusTelemetry) => void;
  onIncidentResolved: () => void;
}

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:8000';

const CORRIDOR_CODES = ['RT-01', 'RT-02', 'RT-03'];

export default function AdminPortal({
  token,
  routes = [],
  totalFareRevenue,
  ticketsSoldToday,
  incidents,
  buses,
  onSelectBus,
  onIncidentResolved,
}: AdminPortalProps) {
  const [adminTab, setAdminTab] = useState<'overview' | 'incidents' | 'fleet'>(
    'overview'
  );
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [routeCode, setRouteCode] = useState<string>(CORRIDOR_CODES[0]);
  const [vehiclePlate, setVehiclePlate] = useState<string>(
    buses[0]?.vehicle_plate || 'HXX 452 EC'
  );
  const [severity, setSeverity] = useState<'Moderate' | 'Heavy'>('Heavy');
  const [delayMinutes, setDelayMinutes] = useState<number>(8);
  const [description, setDescription] = useState<string>(
    'Control room schedule adjustment on corridor.'
  );
  const [statusMessage, setStatusMessage] = useState<{
    type: 'ok' | 'err';
    text: string;
  } | null>(null);

  const isAnyBusy = busyKey !== null;
  const activeIncidents = incidents.filter((i) => i.is_active);

  const avgSpeed =
    buses.length > 0
      ? (
          buses.reduce((acc, b) => acc + Number(b.speed || 0), 0) / buses.length
        ).toFixed(1)
      : '0.0';

  const avgLoadPct =
    buses.length > 0
      ? Math.round(
          buses.reduce((acc, b) => {
            const parsed = parseInt(
              String(b.occupancy || '0').replace('%', ''),
              10
            );
            return acc + (Number.isNaN(parsed) ? 0 : parsed);
          }, 0) / buses.length
        )
      : 0;

  const handleResolve = async (incidentId: number) => {
    const key = `resolve-${incidentId}`;
    if (isAnyBusy) return;
    setBusyKey(key);
    setStatusMessage(null);
    try {
      const res = await fetch(
        `${API_BASE}/ops/incidents/${incidentId}/resolve`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (res.ok) {
        setStatusMessage({
          type: 'ok',
          text: `Incident #${incidentId} resolved.`,
        });
        onIncidentResolved();
      } else {
        setStatusMessage({
          type: 'err',
          text: `Failed to resolve incident #${incidentId}.`,
        });
      }
    } catch {
      setStatusMessage({
        type: 'err',
        text: 'Backend unreachable while resolving alert.',
      });
    } finally {
      setBusyKey(null);
    }
  };

  const handleResolveAll = async () => {
    if (activeIncidents.length === 0 || isAnyBusy) return;
    setBusyKey('clear-all');
    setStatusMessage(null);
    try {
      await Promise.all(
        activeIncidents.map((inc) =>
          fetch(`${API_BASE}/ops/incidents/${inc.id}/resolve`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
          })
        )
      );
      setStatusMessage({
        type: 'ok',
        text: 'All active corridor incidents cleared.',
      });
      onIncidentResolved();
    } catch {
      setStatusMessage({
        type: 'err',
        text: 'Error clearing active incidents.',
      });
    } finally {
      setBusyKey(null);
    }
  };

  const handleBroadcastDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim() || isAnyBusy) return;
    setBusyKey('broadcast');
    setStatusMessage(null);
    try {
      const res = await fetch(`${API_BASE}/ops/incidents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          route_code: routeCode,
          vehicle_plate: vehiclePlate.trim() || 'BCM-CTRL',
          severity,
          delay_minutes: Math.min(90, Math.max(1, Number(delayMinutes) || 5)),
          description: description.trim(),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setStatusMessage({
          type: 'err',
          text: data?.detail || 'Unable to broadcast control room alert.',
        });
      } else {
        setStatusMessage({
          type: 'ok',
          text: `Broadcasted +${delayMinutes}m alert on ${routeCode}.`,
        });
        onIncidentResolved();
      }
    } catch {
      setStatusMessage({
        type: 'err',
        text: 'Backend unreachable while broadcasting alert.',
      });
    } finally {
      setBusyKey(null);
    }
  };

  const availableRoutes =
    routes.length > 0
      ? routes
      : CORRIDOR_CODES.map((code, idx) => ({
          id: idx + 1,
          tripId: idx + 1,
          code,
          name: `${code} Municipal Corridor`,
          color: '#3b82f6',
          fareZar: 0,
          congestionLevel: 'Low' as const,
          trafficMultiplier: 1,
          coordinates: [],
          stops: [],
        }));

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <div className="grid grid-cols-3 p-2 sm:p-2.5 gap-1.5 border-b border-slate-800 bg-slate-950/40 shrink-0">
        <button
          type="button"
          onClick={() => setAdminTab('overview')}
          className={`min-h-[40px] py-2 px-2 rounded-lg text-[11px] font-bold transition flex items-center justify-center gap-1 ${
            adminTab === 'overview'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
              : 'bg-slate-800/70 text-slate-400 hover:text-white'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Overview</span>
        </button>
        <button
          type="button"
          onClick={() => setAdminTab('incidents')}
          className={`min-h-[40px] py-2 px-2 rounded-lg text-[11px] font-bold transition flex items-center justify-center gap-1 ${
            adminTab === 'incidents'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
              : 'bg-slate-800/70 text-slate-400 hover:text-white'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Alerts ({activeIncidents.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setAdminTab('fleet')}
          className={`min-h-[40px] py-2 px-2 rounded-lg text-[11px] font-bold transition flex items-center justify-center gap-1 ${
            adminTab === 'fleet'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
              : 'bg-slate-800/70 text-slate-400 hover:text-white'
          }`}
        >
          <Bus className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Fleet ({buses.length})</span>
        </button>
      </div>

      {statusMessage && (
        <div
          className={`mx-3.5 sm:mx-4 mt-3 p-2.5 rounded-xl border text-xs flex items-start gap-2 shrink-0 ${
            statusMessage.type === 'ok'
              ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-200'
              : 'bg-rose-500/15 border-rose-500/35 text-rose-200'
          }`}
        >
          {statusMessage.type === 'ok' ? (
            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          )}
          <span className="leading-snug">{statusMessage.text}</span>
        </div>
      )}

      {adminTab === 'overview' && (
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-4 space-y-4">
          <div className="grid grid-cols-2 gap-2.5">
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 min-w-0">
              <div className="flex items-center gap-1.5 text-slate-400 text-[11px] mb-1">
                <DollarSign className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="truncate">Fare Revenue</span>
              </div>
              <p className="text-sm sm:text-base font-bold font-mono text-white truncate">
                R{' '}
                {Number(totalFareRevenue || 0).toLocaleString('en-ZA', {
                  minimumFractionDigits: 2,
                })}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 min-w-0">
              <div className="flex items-center gap-1.5 text-slate-400 text-[11px] mb-1">
                <Ticket className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <span className="truncate">Tickets Today</span>
              </div>
              <p className="text-sm sm:text-base font-bold font-mono text-white truncate">
                {Number(ticketsSoldToday || 0).toLocaleString()}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 min-w-0">
              <div className="flex items-center gap-1.5 text-slate-400 text-[11px] mb-1">
                <Gauge className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span className="truncate">Fleet Avg Speed</span>
              </div>
              <p className="text-sm sm:text-base font-bold font-mono text-cyan-300">
                {avgSpeed} km/h
              </p>
            </div>
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 min-w-0">
              <div className="flex items-center gap-1.5 text-slate-400 text-[11px] mb-1">
                <Radio className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="truncate">Avg Cabin Load</span>
              </div>
              <p className="text-sm sm:text-base font-bold font-mono text-amber-300">
                {avgLoadPct}%
              </p>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              Corridor Health Status
            </h3>
            <div className="space-y-2">
              {availableRoutes.map((route) => {
                const routeBuses = buses.filter(
                  (b) => b.route_code === route.code
                );
                const routeIncidents = activeIncidents.filter(
                  (i) => i.route_code === route.code
                );
                const routeDelay = routeIncidents.reduce(
                  (sum, i) => sum + i.delay_minutes,
                  0
                );
                return (
                  <div
                    key={route.code}
                    className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white truncate">
                        {route.code}{' '}
                        <span className="text-slate-300 font-medium">
                          {route.name}
                        </span>
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {routeBuses.length} active{' '}
                        {routeBuses.length === 1 ? 'bus' : 'buses'}
                      </p>
                    </div>
                    {routeDelay > 0 ? (
                      <span className="text-[11px] font-mono font-bold px-2 py-1 rounded-lg bg-rose-500/15 text-rose-300 border border-rose-500/30 shrink-0">
                        +{routeDelay}m ({routeIncidents.length})
                      </span>
                    ) : (
                      <span className="text-[11px] font-semibold px-2 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shrink-0">
                        On Time
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                Active Incidents ({activeIncidents.length})
              </h3>
              {activeIncidents.length > 1 && (
                <button
                  type="button"
                  disabled={isAnyBusy}
                  onClick={handleResolveAll}
                  className="min-h-[32px] text-[11px] font-bold px-2.5 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 disabled:opacity-50 border border-emerald-500/30 text-emerald-300 flex items-center gap-1 transition shrink-0"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>
                    {busyKey === 'clear-all' ? 'Clearing...' : 'Clear All'}
                  </span>
                </button>
              )}
            </div>
            {activeIncidents.length === 0 ? (
              <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-400 flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>All East London corridors operating within schedule.</span>
              </div>
            ) : (
              <div className="space-y-2">
                {activeIncidents.map((inc) => (
                  <div
                    key={inc.id}
                    className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-rose-300 truncate">
                        {inc.route_code} {inc.vehicle_plate} (+
                        {inc.delay_minutes}m)
                      </span>
                      <button
                        type="button"
                        disabled={isAnyBusy}
                        onClick={() => handleResolve(inc.id)}
                        className="min-h-[32px] px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-[11px] font-bold transition flex items-center gap-1 shrink-0"
                      >
                        <CheckCircle className="w-3 h-3" />
                        <span>
                          {busyKey === `resolve-${inc.id}`
                            ? 'Saving...'
                            : 'Resolve'}
                        </span>
                      </button>
                    </div>
                    <p className="text-xs text-rose-100/90 leading-snug">
                      {inc.description}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {adminTab === 'incidents' && (
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-4 space-y-4">
          <form
            onSubmit={handleBroadcastDispatch}
            className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-3"
          >
            <p className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Dispatch Control Room Advisory
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase mb-1">
                  Corridor
                </label>
                <select
                  value={routeCode}
                  onChange={(e) => setRouteCode(e.target.value)}
                  className="min-h-[40px] w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-2 text-xs text-white"
                >
                  {CORRIDOR_CODES.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase mb-1">
                  Delay (Mins)
                </label>
                <input
                  type="number"
                  min={1}
                  max={90}
                  value={delayMinutes}
                  onChange={(e) => setDelayMinutes(Number(e.target.value))}
                  className="min-h-[40px] w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-2 text-xs font-mono text-white"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase mb-1">
                  Vehicle Plate
                </label>
                <input
                  type="text"
                  value={vehiclePlate}
                  onChange={(e) => setVehiclePlate(e.target.value)}
                  className="min-h-[40px] w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-2 text-xs font-mono text-white"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase mb-1">
                  Severity
                </label>
                <select
                  value={severity}
                  onChange={(e) =>
                    setSeverity(e.target.value as 'Moderate' | 'Heavy')
                  }
                  className="min-h-[40px] w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-2 text-xs text-white"
                >
                  <option value="Moderate">Moderate</option>
                  <option value="Heavy">Heavy</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-400 uppercase mb-1">
                Advisory Message
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="min-h-[40px] w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white"
              />
            </div>
            <button
              type="submit"
              disabled={isAnyBusy || !description.trim()}
              className="min-h-[42px] w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white text-xs font-bold transition flex items-center justify-center gap-2"
            >
              <Send className="w-3.5 h-3.5 shrink-0" />
              <span>
                {busyKey === 'broadcast'
                  ? 'Broadcasting...'
                  : 'Push Advisory to Network'}
              </span>
            </button>
          </form>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Active Queue ({activeIncidents.length})
              </span>
              {activeIncidents.length > 0 && (
                <button
                  type="button"
                  disabled={isAnyBusy}
                  onClick={handleResolveAll}
                  className="min-h-[32px] text-[11px] font-bold px-2.5 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 disabled:opacity-50 border border-emerald-500/30 text-emerald-300 flex items-center gap-1"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>Clear All</span>
                </button>
              )}
            </div>

            {activeIncidents.map((inc) => (
              <div
                key={inc.id}
                className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-start justify-between gap-2"
              >
                <div className="min-w-0">
                  <p className="text-xs font-bold text-rose-300">
                    {inc.route_code} {inc.vehicle_plate} (+{inc.delay_minutes}m)
                  </p>
                  <p className="text-xs text-slate-300 mt-0.5 leading-snug">
                    {inc.description}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-1">
                    {inc.reporter_name} • {inc.severity}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={isAnyBusy}
                  onClick={() => handleResolve(inc.id)}
                  className="min-h-[32px] px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-[11px] font-bold shrink-0"
                >
                  Resolve
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {adminTab === 'fleet' && (
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-4 space-y-2.5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
            Municipal Fleet Units ({buses.length})
          </h3>
          {buses.map((bus) => (
            <button
              key={bus.trip_id}
              type="button"
              onClick={() => onSelectBus(bus)}
              className="w-full p-3.5 rounded-xl bg-slate-950/80 hover:bg-slate-900 border border-slate-800 hover:border-blue-500/40 flex items-center justify-between gap-2 text-left transition"
            >
              <div className="min-w-0">
                <p className="text-xs font-bold text-white truncate">
                  {bus.vehicle_plate}{' '}
                  <span className="text-blue-400">{bus.route_code}</span>
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                  {bus.route_name}
                </p>
                <p className="text-[10px] font-mono text-slate-500 mt-1">
                  {Number(bus.latitude).toFixed(4)},{' '}
                  {Number(bus.longitude).toFixed(4)}
                </p>
              </div>
              <div className="text-right font-mono shrink-0">
                <p className="text-xs font-bold text-emerald-400">
                  {Number(bus.speed || 0).toFixed(1)} km/h
                </p>
                <p className="text-[11px] text-amber-400 mt-0.5">
                  {bus.occupancy} load
                </p>
                <p className="text-[10px] text-blue-400 mt-1">
                  Track on Map →
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}