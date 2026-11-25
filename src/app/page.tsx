'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Compass, LogOut } from 'lucide-react';
import {
  AuthUser,
  CORRIDOR_DATA,
  RouteItem,
  BusTelemetry,
  FleetIncident
} from '@/types/transit';
import AuthGate from '@/components/AuthGate';
import CommuterPortal from '@/components/CommuterPortal';
import DriverPortal from '@/components/DriverPortal';
import AdminPortal from '@/components/AdminPortal';
import MapViewport from '@/components/MapViewport';

const API_BASE = 'http://127.0.0.1:8000';

export default function HomePage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  const [routes] = useState<RouteItem[]>(CORRIDOR_DATA);
  const [selectedRouteId, setSelectedRouteId] = useState<number>(1);
  const [mapBounds, setMapBounds] = useState<[number, number][] | null>(CORRIDOR_DATA[0].coordinates);
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
      occupancy: '68%'
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
      occupancy: '82%'
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
      occupancy: '45%'
    }
  ]);

  const [trackedTripId, setTrackedTripId] = useState<number>(1);
  const [breadcrumbs, setBreadcrumbs] = useState<[number, number][]>([[-32.7875, 27.9116]]);
  const wsTrackRef = useRef<WebSocket | null>(null);
  const wsEventsRef = useRef<WebSocket | null>(null);

  const refreshSummary = async (authToken: string) => {
    try {
      const res = await fetch(`${API_BASE}/ops/summary`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      if (!res.ok) return;
      const data = await res.json();
      setTotalFareRevenue(data.total_fare_revenue);
      setTicketsSoldToday(data.tickets_sold_today);
      setIncidents(data.incidents || []);
    } catch {
      // Backend offline or restarting; keep current UI state without throwing
    }
  };

  useEffect(() => {
    const savedToken = sessionStorage.getItem('tp_jwt');
    if (!savedToken) {
      setCheckingSession(false);
      return;
    }

    fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${savedToken}` }
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

    const trackWs = new WebSocket(`ws://127.0.0.1:8000/ws/track/${trackedTripId}`);
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
                  latitude: data.latitude,
                  longitude: data.longitude,
                  speed: data.speed ?? b.speed,
                  heading: data.heading ?? b.heading,
                  occupancy: data.occupancy ?? b.occupancy
                }
              : b
          )
        );
        setBreadcrumbs((prev) => [...prev.slice(-25), [data.latitude, data.longitude]]);
      } catch {
        // Ignore malformed telemetry packet
      }
    };

    const eventsWs = new WebSocket('ws://127.0.0.1:8000/ws/events');
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
      <div className="flex h-screen w-full items-center justify-center bg-slate-950 text-slate-400 text-xs font-mono">
        Verifying cryptographic session...
      </div>
    );
  }

  if (!user || !token) {
    return (
      <AuthGate
        onAuthenticated={(authenticatedUser, jwtToken) => {
          setUser(authenticatedUser);
          setToken(jwtToken);
          refreshSummary(jwtToken);
        }}
      />
    );
  }

  const activeRoute = routes.find((r) => r.id === selectedRouteId) || routes[0];
  const activeBus = buses.find((b) => b.trip_id === trackedTripId) || buses[0];
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
    <div className="flex h-screen w-full bg-slate-950 text-slate-100 overflow-hidden font-sans">
      <div className="w-[430px] flex flex-col border-r border-slate-800 bg-slate-900 z-20 shadow-2xl">
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600 rounded-xl text-white shadow-lg shadow-blue-600/30">
              <Compass className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-lg tracking-tight text-white">Transit Pulse</h1>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase bg-blue-500/20 text-blue-400 border border-blue-500/30">
                  {user.role}
                </span>
              </div>
              <p className="text-xs text-slate-400">{user.full_name}</p>
            </div>
          </div>

          <button
            onClick={handleLogout}
            title="Sign Out"
            className="p-2 rounded-xl bg-slate-800 hover:bg-rose-500/20 hover:text-rose-400 text-slate-400 transition"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>

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
      </div>

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
    </div>
  );
}