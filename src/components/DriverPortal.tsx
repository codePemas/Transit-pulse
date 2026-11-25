'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Bus,
  Radio,
  AlertTriangle,
  Play,
  Square,
  MapPin,
  QrCode,
  CheckCircle2,
  Users,
  Trash2,
  UserPlus,
  UserMinus,
  Navigation,
  Clock,
  ShieldAlert
} from 'lucide-react';
import { BusTelemetry, FleetIncident, RouteItem } from '@/types/transit';

interface DriverPortalProps {
  token: string;
  routes: RouteItem[];
  incidents: FleetIncident[];
  activeBus: BusTelemetry;
  driverName: string;
  onSelectTrip: (tripId: number) => void;
  onIncidentCreated: () => void;
}

const API_BASE = 'http://127.0.0.1:8000';
const BUS_CAPACITY = 60;

const QUICK_INCIDENT_PRESETS = [
  { label: 'N2 / Settlers Congestion', text: 'Heavy traffic congestion along N2 / Settlers Way approach.', delay: 8 },
  { label: 'Oxford St Roadworks', text: 'Lane closure & municipal roadworks near Oxford Street CBD.', delay: 10 },
  { label: 'Peak Boarding Queue', text: 'High commuter boarding volume at interchange—minor schedule hold.', delay: 5 },
  { label: 'Weather / Wet Road', text: 'Reduced visibility & wet road conditions along coastal corridor.', delay: 6 }
];

function interpolatePath(coords: [number, number][], stepsPerSegment = 12): [number, number][] {
  if (coords.length < 2) return coords;
  const dense: [number, number][] = [];
  for (let i = 0; i < coords.length - 1; i++) {
    const [lat1, lng1] = coords[i];
    const [lat2, lng2] = coords[i + 1];
    for (let s = 0; s < stepsPerSegment; s++) {
      const t = s / stepsPerSegment;
      dense.push([lat1 + (lat2 - lat1) * t, lng1 + (lng2 - lng1) * t]);
    }
  }
  dense.push(coords[coords.length - 1]);
  return dense;
}

function computeHeading(from: [number, number], to: [number, number]): number {
  const dLng = ((to[1] - from[1]) * Math.PI) / 180;
  const lat1 = (from[0] * Math.PI) / 180;
  const lat2 = (to[0] * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return Math.round(((Math.atan2(y, x) * 180) / Math.PI + 360) % 360);
}

export default function DriverPortal({
  token,
  routes,
  incidents,
  activeBus,
  driverName,
  onSelectTrip,
  onIncidentCreated
}: DriverPortalProps) {
  const [driverTab, setDriverTab] = useState<'dispatch' | 'boarding' | 'alerts'>('dispatch');
  const [shiftActive, setShiftActive] = useState(true);
  const [tripRunning, setTripRunning] = useState(false);

  const currentRoute =
    routes.find((r) => r.code === activeBus.route_code) || routes[0];

  const smoothPath = useMemo(
    () => interpolatePath(currentRoute.coordinates, 14),
    [currentRoute]
  );

  const [stopIndex, setStopIndex] = useState(0);
  const [passengersOnBoard, setPassengersOnBoard] = useState<number>(() => {
    const pct = parseInt(String(activeBus.occupancy).replace('%', ''), 10) || 65;
    return Math.round((pct / 100) * BUS_CAPACITY);
  });

  const [incidentText, setIncidentText] = useState(QUICK_INCIDENT_PRESETS[0].text);
  const [delayMinutes, setDelayMinutes] = useState(QUICK_INCIDENT_PRESETS[0].delay);
  const [alertFeedback, setAlertFeedback] = useState<string | null>(null);
  const [submittingAlert, setSubmittingAlert] = useState(false);

  const [ticketCodeInput, setTicketCodeInput] = useState('');
  const [scanResult, setScanResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [scanning, setScanning] = useState(false);

  const simSocketRef = useRef<WebSocket | null>(null);
  const pathCursorRef = useRef<number>(0);

  useEffect(() => {
    setStopIndex(0);
    pathCursorRef.current = 0;
    setAlertFeedback(null);
    setScanResult(null);
  }, [activeBus.trip_id]);

  const occupancyPct = Math.min(100, Math.max(0, Math.round((passengersOnBoard / BUS_CAPACITY) * 100)));

  const transmitFrame = (
    lat: number,
    lng: number,
    speedKmh: number,
    headingDeg: number,
    loadPct: number
  ) => {
    const payload = JSON.stringify({
      latitude: Number(lat.toFixed(5)),
      longitude: Number(lng.toFixed(5)),
      speed: Number(speedKmh.toFixed(1)),
      heading: headingDeg,
      occupancy: `${loadPct}%`
    });

    if (simSocketRef.current && simSocketRef.current.readyState === WebSocket.OPEN) {
      simSocketRef.current.send(payload);
      return;
    }

    const tempWs = new WebSocket(`ws://127.0.0.1:8000/ws/track/${activeBus.trip_id}`);
    tempWs.onopen = () => {
      tempWs.send(payload);
      setTimeout(() => tempWs.close(), 200);
    };
  };

  useEffect(() => {
    if (!shiftActive || !tripRunning) {
      if (simSocketRef.current) {
        simSocketRef.current.close();
        simSocketRef.current = null;
      }
      return;
    }

    const ws = new WebSocket(`ws://127.0.0.1:8000/ws/track/${activeBus.trip_id}`);
    simSocketRef.current = ws;

    const emitNextStep = () => {
      if (ws.readyState !== WebSocket.OPEN || smoothPath.length === 0) return;
      const idx = pathCursorRef.current % smoothPath.length;
      const nextIdx = (idx + 1) % smoothPath.length;
      const currentPt = smoothPath[idx];
      const nextPt = smoothPath[nextIdx];
      const heading = computeHeading(currentPt, nextPt);
      const realisticSpeed = 44 + ((idx % 5) * 2.4);

      ws.send(
        JSON.stringify({
          latitude: Number(currentPt[0].toFixed(5)),
          longitude: Number(currentPt[1].toFixed(5)),
          speed: Number(realisticSpeed.toFixed(1)),
          heading,
          occupancy: `${occupancyPct}%`
        })
      );

      // Sync active stop checkpoint automatically as cursor progresses along corridor
      const progressRatio = idx / smoothPath.length;
      const derivedStop = Math.min(
        currentRoute.stops.length - 1,
        Math.floor(progressRatio * currentRoute.stops.length)
      );
      setStopIndex(derivedStop);

      pathCursorRef.current += 1;
    };

    ws.onopen = emitNextStep;
    const timer = setInterval(emitNextStep, 1200);

    return () => {
      clearInterval(timer);
      ws.close();
      simSocketRef.current = null;
    };
  }, [shiftActive, tripRunning, activeBus.trip_id, smoothPath, currentRoute.stops.length, occupancyPct]);

  const handleAdjustPassengers = (delta: number) => {
    const nextCount = Math.min(BUS_CAPACITY, Math.max(0, passengersOnBoard + delta));
    setPassengersOnBoard(nextCount);
    const nextPct = Math.round((nextCount / BUS_CAPACITY) * 100);
    transmitFrame(
      activeBus.latitude,
      activeBus.longitude,
      tripRunning ? activeBus.speed : 0,
      activeBus.heading || 140,
      nextPct
    );
  };

  const handleCheckInStop = (targetStopIdx: number) => {
    setStopIndex(targetStopIdx);
    const stop = currentRoute.stops[targetStopIdx];
    if (!stop) return;
    const ratio = targetStopIdx / Math.max(1, currentRoute.stops.length - 1);
    pathCursorRef.current = Math.min(
      smoothPath.length - 1,
      Math.floor(ratio * (smoothPath.length - 1))
    );
    transmitFrame(stop.coords[0], stop.coords[1], 0, activeBus.heading || 140, occupancyPct);
  };

  const routeActiveIncidents = incidents.filter(
    (inc) => inc.is_active && inc.route_code === activeBus.route_code
  );

  const handleBroadcastIncident = async (customText?: string, customDelay?: number) => {
    const textToSend = (customText ?? incidentText).trim();
    const delayToSend = Number(customDelay ?? delayMinutes) || 5;
    if (!textToSend || submittingAlert) return;

    const duplicate = routeActiveIncidents.some(
      (inc) => inc.description.trim().toLowerCase() === textToSend.toLowerCase()
    );
    if (duplicate) {
      setAlertFeedback('This alert is already live on your corridor.');
      return;
    }

    setSubmittingAlert(true);
    setAlertFeedback(null);
    try {
      const res = await fetch(`${API_BASE}/ops/incidents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          route_code: activeBus.route_code,
          vehicle_plate: activeBus.vehicle_plate,
          severity: delayToSend >= 10 ? 'Critical' : 'Heavy',
          delay_minutes: delayToSend,
          description: textToSend
        })
      });
      if (!res.ok) {
        setAlertFeedback('Dispatch rejected alert. Check driver session.');
        return;
      }
      setAlertFeedback(`Broadcasted +${delayToSend}m delay to commuters & control room.`);
      onIncidentCreated();
    } catch {
      setAlertFeedback('Backend unreachable — check Uvicorn on port 8000.');
    } finally {
      setSubmittingAlert(false);
    }
  };

  const handleClearAlert = async (incidentId: number) => {
    setAlertFeedback(null);
    try {
      const res = await fetch(`${API_BASE}/ops/incidents/${incidentId}/resolve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        setAlertFeedback('Could not clear alert.');
        return;
      }
      setAlertFeedback('Corridor alert cleared.');
      onIncidentCreated();
    } catch {
      setAlertFeedback('Backend unreachable — check Uvicorn on port 8000.');
    }
  };

  const handleVerifyPassengerPass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketCodeInput.trim() || scanning) return;
    setScanning(true);
    setScanResult(null);
    try {
      const res = await fetch(`${API_BASE}/ops/tickets/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ ticket_code: ticketCodeInput.trim().toUpperCase() })
      });
      const data = await res.json();
      if (!res.ok) {
        setScanResult({ ok: false, message: data.detail || 'Invalid or already used ticket.' });
      } else {
        setScanResult({
          ok: true,
          message: `VALID PASS • ${data.ticket_code} boarded at ${data.validated_at}`
        });
        setTicketCodeInput('');
        handleAdjustPassengers(1);
      }
    } catch {
      setScanResult({ ok: false, message: 'Ticket service offline.' });
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Driver Duty Header */}
      <div className="p-3 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between">
        <div>
          <p className="text-xs font-bold text-white">{driverName}</p>
          <p className="text-[11px] font-mono text-slate-400">
            Unit {activeBus.vehicle_plate} • {passengersOnBoard}/{BUS_CAPACITY} seats
          </p>
        </div>
        <button
          onClick={() => {
            const next = !shiftActive;
            setShiftActive(next);
            if (!next) setTripRunning(false);
          }}
          className={`text-xs font-bold px-3 py-1.5 rounded-lg transition ${
            shiftActive
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
          }`}
        >
          {shiftActive ? '● On Shift' : '○ Off Shift'}
        </button>
      </div>

      {/* Console Mode Tabs */}
      <div className="grid grid-cols-3 p-2.5 gap-1.5 border-b border-slate-800 bg-slate-950/30">
        <button
          onClick={() => setDriverTab('dispatch')}
          className={`py-2 px-2 rounded-lg text-[11px] font-bold transition flex items-center justify-center gap-1.5 ${
            driverTab === 'dispatch'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/25'
              : 'bg-slate-800/70 text-slate-400 hover:text-white'
          }`}
        >
          <Navigation className="w-3.5 h-3.5" />
          Dispatch
        </button>
        <button
          onClick={() => setDriverTab('boarding')}
          className={`py-2 px-2 rounded-lg text-[11px] font-bold transition flex items-center justify-center gap-1.5 ${
            driverTab === 'boarding'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/25'
              : 'bg-slate-800/70 text-slate-400 hover:text-white'
          }`}
        >
          <QrCode className="w-3.5 h-3.5" />
          Boarding
        </button>
        <button
          onClick={() => setDriverTab('alerts')}
          className={`py-2 px-2 rounded-lg text-[11px] font-bold transition flex items-center justify-center gap-1.5 ${
            driverTab === 'alerts'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/25'
              : 'bg-slate-800/70 text-slate-400 hover:text-white'
          }`}
        >
          <ShieldAlert className="w-3.5 h-3.5" />
          Alerts ({routeActiveIncidents.length})
        </button>
      </div>

      {/* TAB 1: LIVE DISPATCH & STOP TIMELINE */}
      {driverTab === 'dispatch' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              Assigned Corridor
            </label>
            <select
              value={activeBus.trip_id}
              onChange={(e) => {
                setTripRunning(false);
                onSelectTrip(Number(e.target.value));
              }}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
            >
              {routes.map((r) => (
                <option key={r.id} value={r.tripId}>
                  {r.code} — {r.name}
                </option>
              ))}
            </select>
          </div>

          {/* Primary Trip Engine Control */}
          <button
            disabled={!shiftActive}
            onClick={() => setTripRunning(!tripRunning)}
            className={`w-full py-3.5 rounded-xl font-bold text-xs transition flex items-center justify-center gap-2 ${
              tripRunning
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white shadow-lg shadow-blue-600/25'
            }`}
          >
            {tripRunning ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            {tripRunning ? 'Pause Active Trip Broadcast' : 'Start Active Corridor Trip'}
          </button>

          {/* Live Telemetry Status Strip */}
          <div className="grid grid-cols-3 gap-2">
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-center">
              <p className="text-[10px] text-slate-400 uppercase">Speed</p>
              <p className="text-sm font-mono font-bold text-white mt-0.5">
                {tripRunning ? `${activeBus.speed.toFixed(0)} km/h` : '0 km/h'}
              </p>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-center">
              <p className="text-[10px] text-slate-400 uppercase">Load</p>
              <p className="text-sm font-mono font-bold text-amber-400 mt-0.5">{occupancyPct}%</p>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-center">
              <p className="text-[10px] text-slate-400 uppercase">Uplink</p>
              <p className={`text-sm font-bold mt-0.5 ${tripRunning ? 'text-emerald-400' : 'text-slate-500'}`}>
                {tripRunning ? 'LIVE' : 'IDLE'}
              </p>
            </div>
          </div>

          {/* Corridor Stop-by-Stop Check-In Timeline */}
          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                Corridor Stop Sequence
              </span>
              <span className="text-[11px] font-mono text-slate-400">
                Stop {stopIndex + 1}/{currentRoute.stops.length}
              </span>
            </div>

            <div className="space-y-1.5 pt-1">
              {currentRoute.stops.map((stop, idx) => {
                const isCurrent = idx === stopIndex;
                const isPassed = idx < stopIndex;
                return (
                  <button
                    key={stop.name}
                    disabled={!shiftActive}
                    onClick={() => handleCheckInStop(idx)}
                    className={`w-full text-left px-3 py-2 rounded-lg border text-xs transition flex items-center justify-between ${
                      isCurrent
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200 font-semibold'
                        : isPassed
                        ? 'bg-slate-900/60 border-slate-800/80 text-slate-500'
                        : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <span className="truncate pr-2">
                      {idx + 1}. {stop.name}
                    </span>
                    <span className="text-[10px] font-mono uppercase shrink-0">
                      {isCurrent ? 'AT STOP' : isPassed ? 'PASSED' : 'CHECK IN'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: DOOR BOARDING COUNTER & QR PASS VALIDATOR */}
      {driverTab === 'boarding' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-amber-400" />
                Live Seat Occupancy
              </span>
              <span className="text-xs font-mono font-bold text-amber-400">
                {passengersOnBoard} / {BUS_CAPACITY} ({occupancyPct}%)
              </span>
            </div>

            <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
              <div
                className={`h-full transition-all ${
                  occupancyPct >= 85
                    ? 'bg-rose-500'
                    : occupancyPct >= 60
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
                }`}
                style={{ width: `${occupancyPct}%` }}
              />
            </div>

            <div className="grid grid-cols-3 gap-2 pt-1">
              <button
                disabled={!shiftActive || passengersOnBoard === 0}
                onClick={() => handleAdjustPassengers(-1)}
                className="py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 disabled:opacity-40 text-xs font-bold text-slate-200 flex items-center justify-center gap-1"
              >
                <UserMinus className="w-3.5 h-3.5 text-rose-400" />
                -1 Alight
              </button>
              <button
                disabled={!shiftActive || passengersOnBoard >= BUS_CAPACITY}
                onClick={() => handleAdjustPassengers(1)}
                className="py-2.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 disabled:opacity-40 text-xs font-bold text-emerald-300 flex items-center justify-center gap-1"
              >
                <UserPlus className="w-3.5 h-3.5" />
                +1 Board
              </button>
              <button
                disabled={!shiftActive || passengersOnBoard >= BUS_CAPACITY}
                onClick={() => handleAdjustPassengers(5)}
                className="py-2.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 disabled:opacity-40 text-xs font-bold text-blue-300 flex items-center justify-center gap-1"
              >
                <UserPlus className="w-3.5 h-3.5" />
                +5 Group
              </button>
            </div>
          </div>

          <form
            onSubmit={handleVerifyPassengerPass}
            className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3"
          >
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Scan / Verify Commuter Ticket Code
            </label>
            <input
              type="text"
              placeholder="e.g. TP-RT-01-A4B9C2"
              value={ticketCodeInput}
              onChange={(e) => setTicketCodeInput(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2.5 text-xs font-mono text-white uppercase focus:outline-none focus:border-emerald-500"
            />
            <button
              type="submit"
              disabled={scanning || !ticketCodeInput.trim()}
              className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-bold transition"
            >
              {scanning ? 'Validating Ticket...' : 'Validate & Board Passenger'}
            </button>
            {scanResult && (
              <div
                className={`p-2.5 rounded-lg text-xs flex items-center gap-2 ${
                  scanResult.ok
                    ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-500/15 border border-rose-500/30 text-rose-300'
                }`}
              >
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{scanResult.message}</span>
              </div>
            )}
          </form>
        </div>
      )}

      {/* TAB 3: ONE-TAP CORRIDOR INCIDENTS */}
      {driverTab === 'alerts' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {alertFeedback && (
            <div className="p-3 rounded-xl bg-blue-500/15 border border-blue-500/35 text-xs text-blue-200">
              {alertFeedback}
            </div>
          )}

          <div className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              One-Tap Quick Dispatch ({activeBus.route_code})
            </p>
            <div className="grid grid-cols-2 gap-2">
              {QUICK_INCIDENT_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  disabled={submittingAlert}
                  onClick={() => {
                    setIncidentText(preset.text);
                    setDelayMinutes(preset.delay);
                    handleBroadcastIncident(preset.text, preset.delay);
                  }}
                  className="p-2.5 rounded-xl bg-slate-950 hover:bg-rose-950/40 border border-slate-800 hover:border-rose-500/40 text-left transition"
                >
                  <p className="text-[11px] font-bold text-white leading-tight">{preset.label}</p>
                  <p className="text-[10px] font-mono text-rose-400 mt-1 flex items-center gap-1">
                    <Clock className="w-3 h-3" />+{preset.delay} mins
                  </p>
                </button>
              ))}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5">
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Custom Delay Note
            </label>
            <input
              type="text"
              value={incidentText}
              onChange={(e) => setIncidentText(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-slate-400">Delay (mins):</span>
              <input
                type="number"
                min={1}
                max={60}
                value={delayMinutes}
                onChange={(e) => setDelayMinutes(Number(e.target.value))}
                className="w-20 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white"
              />
            </div>
            <button
              disabled={submittingAlert || !incidentText.trim()}
              onClick={() => handleBroadcastIncident()}
              className="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white font-bold text-xs transition flex items-center justify-center gap-2"
            >
              <AlertTriangle className="w-4 h-4" />
              {submittingAlert ? 'Sending...' : 'Broadcast Custom Alert'}
            </button>
          </div>

          <div className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Live Alerts on {activeBus.route_code} ({routeActiveIncidents.length})
            </p>
            {routeActiveIncidents.length === 0 ? (
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-400">
                Corridor clear — no active alerts.
              </div>
            ) : (
              routeActiveIncidents.map((inc) => (
                <div
                  key={inc.id}
                  className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-100 flex items-start justify-between gap-2"
                >
                  <div>
                    <p className="font-bold text-rose-300">+{inc.delay_minutes} min delay</p>
                    <p className="text-rose-200/85 mt-0.5">{inc.description}</p>
                  </div>
                  <button
                    onClick={() => handleClearAlert(inc.id)}
                    title="Clear Alert"
                    className="p-1.5 rounded-lg bg-slate-900 hover:bg-emerald-600 text-slate-300 hover:text-white transition shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}