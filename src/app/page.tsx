'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Compass, LogOut, Map as MapIcon, SlidersHorizontal } from 'lucide-react';
import {
  AuthUser,
  CORRIDOR_DATA,
  RouteItem,
  BusTelemetry,
  FleetIncident,
} from '@/types/transit';
import AuthGate from '@/components/AuthGate';
import CommuterPortal from '@/components/CommuterPortal';
import DriverPortal from '@/components/DriverPortal';
import AdminPortal from '@/components/AdminPortal';
import MapViewport from '@/components/MapViewport';
import ErrorBoundary from '@/components/ErrorBoundary';

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:8000';

function getWsBase(apiBase: string): string {
  if (apiBase.startsWith('https://')) {
    return apiBase.replace('https://', 'wss://');
  }
  if (apiBase.startsWith('http://')) {
    return apiBase.replace('http://', 'ws://');
  }
  return 'ws://127.0.0.1:8000';
}

export default function HomePage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [mobileView, setMobileView] = useState<'portal' | 'map'>('portal');

  const [routes] = useState<RouteItem[]>(CORRIDOR_DATA);
  const [selectedRouteId, setSelectedRouteId] = useState<number>(1);
  const [mapBounds, setMapBounds] = useState<[number, number][] | null>(
    CORRIDOR_DATA[0].coordinates
  );
  const [followBus, setFollowBus] = useState<boolean>(true);
  const [wsLive, setWsLive] = useState<boolean>(false);

  const [totalFareRevenue, setTotalFareRevenue] = useState<number>(71040.0);
  const [ticketsSoldToday, setTicketsSoldToday] = useState<number>(3840);
  const [incidents, setIncidents] = useState<FleetIncident[]>([]);

  const [buses, setBuses] = useState<BusTelemetry[]>([
    {
      trip_id: 1,
      vehicle_plate: 'HXX 452 EC',
      route_name: 'Campus to Downtown Corridor',
      route_code: 'RT-01',
      latitude: -32.7875,
      longitude: 27.9116,
      speed: 48.5,
      heading: 165,
      occupancy: '68%',
    },
    {
      trip_id: 2,
      vehicle_plate: 'KZN 819 EC',
      route_name: 'Mdantsane Express Link',
      route_code: 'RT-02',
      latitude: -32.9560,
      longitude: 27.8050,
      speed: 54.0,
      heading: 115,
      occupancy: '82%',
    },
    {
      trip_id: 3,
      vehicle_plate: 'JLP 304 EC',
      route_name: 'Gonubie Coastal Loop',
      route_code: 'RT-03',
      latitude: -32.9650,
      longitude: 27.9400,
      speed: 39.2,
      heading: 210,
      occupancy: '45%',
    },
  ]);

  const [trackedTripId, setTrackedTripId] = useState<number>(1);
  const [breadcrumbs, setBreadcrumbs] = useState<[number, number][]>([
    [-32.7875, 27.9116],
  ]);

  const wsTrackRef = useRef<WebSocket | null>(null);
  const wsEventsRef = useRef<WebSocket | null>(null);

  const refreshSummary = async (authToken: string) => {
    try {
      const res = await fetch(`${API_BASE}/ops/summary`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      if (typeof data.total_fare_revenue === 'number') {
        setTotalFareRevenue(data.total_fare_revenue);
      }
      if (typeof data.tickets_sold_today === 'number') {
        setTicketsSoldToday(data.tickets_sold_today);
      }
      if (Array.isArray(data.incidents)) {
        setIncidents(data.incidents);
      }
    } catch {
      // Keep current UI state if backend is momentarily sleeping or unreachable
    }
  };

  useEffect(() => {
    const savedToken = sessionStorage.getItem('tp_jwt');
    if (!savedToken) {
      setCheckingSession(false);
      return;
    }

    fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${savedToken}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error('Expired session');
        return res.json();
      })
      .then((verifiedUser: AuthUser) => {
        setUser(verifiedUser);
        setToken(savedToken);
        refreshSummary(savedToken);
      })
      .catch(() => {
        sessionStorage.removeItem('tp_jwt');
        sessionStorage.removeItem('tp_user');
      })
      .finally(() => setCheckingSession(false));
  }, []);

  useEffect(() => {
    if (!user || !token) return;
    const wsBase = getWsBase(API_BASE);

    const trackWs = new WebSocket(`${wsBase}/ws/track/${trackedTripId}`);
    wsTrackRef.current = trackWs;
    trackWs.onopen = () => setWsLive(true);
    trackWs.onclose = () => setWsLive(false);
    trackWs.onerror = () => setWsLive(false);
    trackWs.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setBuses((prev) =>
          prev.map((b) =>
            b.trip_id === trackedTripId
              ? {
                  ...b,
                  latitude:
                    typeof data.latitude === 'number'
                      ? data.latitude
                      : b.latitude,
                  longitude:
                    typeof data.longitude === 'number'
                      ? data.longitude
                      : b.longitude,
                  speed: typeof data.speed === 'number' ? data.speed : b.speed,
                  heading:
                    typeof data.heading === 'number' ? data.heading : b.heading,
                  occupancy: data.occupancy ?? b.occupancy,
                }
              : b
          )
        );
        if (
          typeof data.latitude === 'number' &&
          typeof data.longitude === 'number'
        ) {
          setBreadcrumbs((prev) => [
            ...prev.slice(-25),
            [data.latitude, data.longitude],
          ]);
        }
      } catch {
        // Ignore malformed telemetry packet
      }
    };

    const eventsWs = new WebSocket(`${wsBase}/ws/events`);
    wsEventsRef.current = eventsWs;
    eventsWs.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (typeof msg.total_fare_revenue === 'number') {
          setTotalFareRevenue(msg.total_fare_revenue);
        }
        if (typeof msg.tickets_sold_today === 'number') {
          setTicketsSoldToday(msg.tickets_sold_today);
        }
        if (Array.isArray(msg.incidents)) {
          setIncidents(msg.incidents);
        }
      } catch {
        // Ignore malformed event packet
      }
    };

    return () => {
      trackWs.close();
      eventsWs.close();
    };
  }, [user, token, trackedTripId]);

  const handleLogout = () => {
    sessionStorage.removeItem('tp_jwt');
    sessionStorage.removeItem('tp_user');
    setUser(null);
    setToken(null);
  };

  if (checkingSession) {
    return (
      <div className="flex flex-1 min-h-screen w-full items-center justify-center bg-slate-950 text-slate-400 text-xs font-mono">
        Verifying cryptographic session...
      </div>
    );
  }

  if (!user || !token) {
    return (
      <ErrorBoundary>
        <AuthGate
          onAuthenticated={(authenticatedUser, jwtToken) => {
            setUser(authenticatedUser);
            setToken(jwtToken);
            refreshSummary(jwtToken);
          }}
        />
      </ErrorBoundary>
    );
  }

  const activeRoute =
    routes.find((r) => r.id === selectedRouteId) || routes[0];
  const activeBus =
    buses.find((b) => b.trip_id === trackedTripId) || buses[0];
  const routeDelayMinutes = incidents
    .filter((inc) => inc.is_active && inc.route_code === activeRoute.code)
    .reduce((sum, inc) => sum + inc.delay_minutes, 0);

  const handleSelectRoute = (route: RouteItem) => {
    setSelectedRouteId(route.id);
    setFollowBus(false);
    setMapBounds([...route.coordinates]);
    const matchingBus = buses.find((b) => b.route_code === route.code);
    if (matchingBus) {
      setTrackedTripId(matchingBus.trip_id);
      setBreadcrumbs([[matchingBus.latitude, matchingBus.longitude]]);
    }
  };

  const handleSelectBus = (bus: BusTelemetry) => {
    setTrackedTripId(bus.trip_id);
    setFollowBus(true);
    setBreadcrumbs([[bus.latitude, bus.longitude]]);
    const matchingRoute = routes.find((r) => r.code === bus.route_code);
    if (matchingRoute) {
      setSelectedRouteId(matchingRoute.id);
    }
  };

  const handleSelectTripById = (tripId: number) => {
    const bus = buses.find((b) => b.trip_id === tripId);
    if (bus) handleSelectBus(bus);
  };

  return (
    <ErrorBoundary>
      <div className="flex flex-col md:flex-row flex-1 min-h-[calc(100dvh-42px)] w-full bg-slate-950 text-slate-100 overflow-hidden font-sans">
        {/* Portal / Controls Panel */}
        <div
          className={`w-full md:w-[430px] md:shrink-0 flex flex-col border-b md:border-b-0 md:border-r border-slate-800 bg-slate-900 z-20 shadow-2xl ${
            mobileView === 'map'
              ? 'hidden md:flex md:h-[calc(100dvh-42px)]'
              : 'flex flex-1 md:flex-initial md:h-[calc(100dvh-42px)] min-h-0'
          }`}
        >
          <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2.5 bg-blue-600 rounded-xl text-white shadow-lg shadow-blue-600/30 shrink-0">
                <Compass className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="font-bold text-base sm:text-lg tracking-tight text-white truncate">
                    Transit Pulse
                  </h1>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase bg-blue-500/20 text-blue-400 border border-blue-500/30 shrink-0">
                    {user.role}
                  </span>
                </div>
                <p className="text-xs text-slate-400 truncate">
                  {user.full_name}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              title="Sign Out"
              className="min-h-[38px] min-w-[38px] p-2 rounded-xl bg-slate-800 hover:bg-rose-500/20 hover:text-rose-400 text-slate-400 transition flex items-center justify-center shrink-0"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>

          {/* Mobile View Switcher: Controls/Wallet vs Full Map */}
          <div className="grid grid-cols-2 gap-1.5 p-2 bg-slate-950 border-b border-slate-800/80 md:hidden shrink-0">
            <button
              type="button"
              onClick={() => setMobileView('portal')}
              className={`min-h-[38px] rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                mobileView === 'portal'
                  ? 'bg-slate-800 text-white border border-slate-700'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Portal &amp; Wallet</span>
            </button>
            <button
              type="button"
              onClick={() => setMobileView('map')}
              className={`min-h-[38px] rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                mobileView === 'map'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <MapIcon className="w-3.5 h-3.5" />
              <span>Full Live Map</span>
            </button>
          </div>

          <ErrorBoundary>
            {user.role === 'commuter' && (
              <CommuterPortal
                token={token}
                routes={routes}
                buses={buses}
                incidents={incidents}
                selectedRoute={activeRoute}
                activeBus={activeBus}
                trackedTripId={trackedTripId}
                onSelectRoute={handleSelectRoute}
                onSelectBus={handleSelectBus}
                onWalletMutated={() => refreshSummary(token)}
              />
            )}

            {user.role === 'driver' && (
              <DriverPortal
                token={token}
                routes={routes}
                incidents={incidents}
                activeBus={activeBus}
                driverName={user.full_name}
                onSelectTrip={handleSelectTripById}
                onIncidentCreated={() => refreshSummary(token)}
              />
            )}

            {user.role === 'admin' && (
              <AdminPortal
                token={token}
                totalFareRevenue={totalFareRevenue}
                ticketsSoldToday={ticketsSoldToday}
                incidents={incidents}
                buses={buses}
                onSelectBus={handleSelectBus}
                onIncidentResolved={() => refreshSummary(token)}
              />
            )}
          </ErrorBoundary>
        </div>

        {/* Live Map Viewport */}
        <div
          className={`flex-1 flex flex-col min-h-0 relative ${
            mobileView === 'map'
              ? 'flex h-[calc(100dvh-42px)]'
              : 'hidden md:flex md:h-[calc(100dvh-42px)]'
          }`}
        >
          <div className="md:hidden absolute top-3 left-3 z-[1001]">
            <button
              type="button"
              onClick={() => setMobileView('portal')}
              className="min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-900/95 hover:bg-slate-800 text-white border border-slate-700 text-xs font-bold shadow-xl flex items-center gap-1.5"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-blue-400" />
              <span>Portal &amp; Wallet</span>
            </button>
          </div>

          <ErrorBoundary>
            <MapViewport
              activeRoute={activeRoute}
              activeBus={activeBus}
              buses={buses}
              breadcrumbs={breadcrumbs}
              mapBounds={mapBounds}
              followBus={followBus}
              wsLive={wsLive}
              routeDelayMinutes={routeDelayMinutes}
              onToggleFollow={() => setFollowBus(!followBus)}
              onSelectBus={handleSelectBus}
            />
          </ErrorBoundary>
        </div>
      </div>
    </ErrorBoundary>
  );
}