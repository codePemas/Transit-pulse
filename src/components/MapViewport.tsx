'use client';

import React, { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import 'leaflet/dist/leaflet.css';
import { Radio, Gauge, Clock, MapPin } from 'lucide-react';
import { RouteItem, BusTelemetry, computePredictedEta } from '@/types/transit';

const MapContainer = dynamic(
  () => import('react-leaflet').then((mod) => mod.MapContainer),
  { ssr: false }
);
const TileLayer = dynamic(
  () => import('react-leaflet').then((mod) => mod.TileLayer),
  { ssr: false }
);
const Marker = dynamic(
  () => import('react-leaflet').then((mod) => mod.Marker),
  { ssr: false }
);
const Popup = dynamic(
  () => import('react-leaflet').then((mod) => mod.Popup),
  { ssr: false }
);
const Polyline = dynamic(
  () => import('react-leaflet').then((mod) => mod.Polyline),
  { ssr: false }
);
const CircleMarker = dynamic(
  () => import('react-leaflet').then((mod) => mod.CircleMarker),
  { ssr: false }
);

const MapController = dynamic(
  () =>
    import('react-leaflet').then((mod) => {
      const { useMap } = mod;
      return function Controller({
        bounds,
        center,
        followMode,
      }: {
        bounds: [number, number][] | null;
        center: [number, number] | null;
        followMode: boolean;
      }) {
        const map = useMap();
        const lastBoundsKeyRef = useRef<string>('');
        const lastPanTimeRef = useRef<number>(0);

        useEffect(() => {
          if (!bounds || bounds.length <= 1) return;
          const key = JSON.stringify(bounds);
          if (key === lastBoundsKeyRef.current) return;
          lastBoundsKeyRef.current = key;
          try {
            map.flyToBounds(bounds, { padding: [40, 40], duration: 0.9 });
          } catch {
            // Ignore map transition errors during unmount
          }
        }, [bounds, map]);

        useEffect(() => {
          if (!followMode || !center) return;
          const now = Date.now();
          if (now - lastPanTimeRef.current < 1500) return;
          lastPanTimeRef.current = now;
          try {
            map.panTo(center, { animate: true, duration: 0.7 });
          } catch {
            // Ignore pan errors during unmount
          }
        }, [center, followMode, map]);

        return null;
      };
    }),
  { ssr: false }
);

interface MapViewportProps {
  activeRoute: RouteItem;
  activeBus: BusTelemetry;
  buses: BusTelemetry[];
  breadcrumbs: [number, number][];
  mapBounds: [number, number][] | null;
  followBus: boolean;
  wsLive: boolean;
  routeDelayMinutes: number;
  onToggleFollow: () => void;
  onSelectBus: (bus: BusTelemetry) => void;
}

export default function MapViewport({
  activeRoute,
  activeBus,
  buses,
  breadcrumbs,
  mapBounds,
  followBus,
  wsLive,
  routeDelayMinutes,
  onToggleFollow,
  onSelectBus,
}: MapViewportProps) {
  const [busIcon, setBusIcon] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    import('leaflet').then((L) => {
      if (!active) return;
      const icon = L.divIcon({
        className: 'custom-bus-marker',
        html: `
          <div style="position:relative;display:flex;align-items:center;justify-content:center;width:36px;height:36px;">
            <div style="position:relative;width:30px;height:30px;border-radius:9999px;background:#2563eb;border:2.5px solid #ffffff;box-shadow:0 4px 12px rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;color:white;font-weight:800;font-size:10px;">
              BUS
            </div>
          </div>
        `,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });
      setBusIcon(icon);
    });
    return () => {
      active = false;
    };
  }, []);

  const safeSpeed = typeof activeBus?.speed === 'number' ? activeBus.speed : 0;
  const safeLat =
    typeof activeBus?.latitude === 'number' ? activeBus.latitude : -32.92;
  const safeLng =
    typeof activeBus?.longitude === 'number' ? activeBus.longitude : 27.9;
  const firstStop = activeRoute?.stops?.[0];
  const liveEtaMinutes = firstStop
    ? computePredictedEta(firstStop, 0, safeSpeed, routeDelayMinutes)
    : 5;

  return (
    <div className="flex-1 min-h-[300px] relative w-full h-full">
      {activeBus && (
        <div className="absolute bottom-3 left-3 right-3 sm:bottom-auto sm:left-auto sm:top-4 sm:right-4 z-[1000] bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-2xl p-3 sm:p-4 shadow-2xl sm:w-80">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <Radio
                className={`w-4 h-4 shrink-0 ${
                  wsLive ? 'text-emerald-400 animate-pulse' : 'text-blue-400'
                }`}
              />
              <span className="font-bold text-xs sm:text-sm text-white truncate">
                {activeBus.vehicle_plate}
              </span>
            </div>
            <span className="text-[11px] sm:text-xs font-mono px-2 py-0.5 rounded bg-blue-600 text-white font-semibold shrink-0">
              {activeBus.route_code}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-1.5 sm:gap-2 text-center">
            <div className="bg-slate-950/80 rounded-lg p-1.5 sm:p-2 border border-slate-800">
              <Gauge className="w-3.5 h-3.5 text-emerald-400 mx-auto mb-0.5" />
              <p className="text-xs font-bold font-mono text-white">
                {safeSpeed.toFixed(1)}
              </p>
              <p className="text-[10px] text-slate-400">km/h</p>
            </div>
            <div className="bg-slate-950/80 rounded-lg p-1.5 sm:p-2 border border-slate-800">
              <Clock className="w-3.5 h-3.5 text-blue-400 mx-auto mb-0.5" />
              <p className="text-xs font-bold font-mono text-white">
                {liveEtaMinutes} min
              </p>
              <p className="text-[10px] text-slate-400">AI ETA</p>
            </div>
            <div className="bg-slate-950/80 rounded-lg p-1.5 sm:p-2 border border-slate-800">
              <MapPin className="w-3.5 h-3.5 text-amber-400 mx-auto mb-0.5" />
              <p className="text-xs font-bold font-mono text-white">
                {activeBus.occupancy || 'N/A'}
              </p>
              <p className="text-[10px] text-slate-400">Load</p>
            </div>
          </div>

          <div className="mt-2.5 pt-2 border-t border-slate-800 flex items-center justify-between gap-2 text-[10px] sm:text-[11px] text-slate-400 font-mono">
            <span className="truncate">
              GPS: {safeLat.toFixed(4)}, {safeLng.toFixed(4)}
            </span>
            <button
              type="button"
              onClick={onToggleFollow}
              className={`min-h-[28px] px-2.5 py-1 rounded font-sans font-semibold shrink-0 transition ${
                followBus
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {followBus ? 'Following' : 'Free Pan'}
            </button>
          </div>
        </div>
      )}

      <MapContainer
        center={[-32.92, 27.9]}
        zoom={11}
        scrollWheelZoom={true}
        style={{ width: '100%', height: '100%', background: '#020617' }}
        attributionControl={false}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        <MapController
          bounds={mapBounds}
          center={activeBus ? [safeLat, safeLng] : null}
          followMode={followBus}
        />

        {Array.isArray(activeRoute?.coordinates) &&
          activeRoute.coordinates.length > 1 && (
            <Polyline
              positions={activeRoute.coordinates}
              color={activeRoute.color || '#3b82f6'}
              weight={6}
              opacity={0.85}
            />
          )}

        {Array.isArray(breadcrumbs) && breadcrumbs.length > 1 && (
          <Polyline
            positions={breadcrumbs}
            color="#ef4444"
            weight={4}
            dashArray="6 8"
            opacity={0.9}
          />
        )}

        {Array.isArray(activeRoute?.stops) &&
          activeRoute.stops.map((stop, idx) => {
            const eta = computePredictedEta(
              stop,
              idx,
              safeSpeed,
              routeDelayMinutes
            );
            return (
              <CircleMarker
                key={`${stop.name}-${idx}`}
                center={stop.coords}
                radius={6}
                pathOptions={{
                  color: '#ffffff',
                  weight: 2,
                  fillColor: activeRoute.color || '#3b82f6',
                  fillOpacity: 1,
                }}
              >
                <Popup>
                  <div className="text-slate-900 font-sans">
                    <p className="font-bold text-xs">{stop.name}</p>
                    <p className="text-[11px] text-blue-600 font-semibold mt-0.5">
                      AI Predicted Arrival: {eta} mins ({stop.confidence}% conf.)
                    </p>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}

        {Boolean(busIcon) &&
          Array.isArray(buses) &&
          buses.map((bus) => {
            if (
              typeof bus.latitude !== 'number' ||
              typeof bus.longitude !== 'number'
            ) {
              return null;
            }
            return (
              <Marker
                key={bus.trip_id}
                position={[bus.latitude, bus.longitude]}
                icon={busIcon as never}
                eventHandlers={{
                  click: () => onSelectBus(bus),
                }}
              >
                <Popup>
                  <div className="p-1 text-slate-900 font-sans">
                    <p className="font-bold text-sm">{bus.vehicle_plate}</p>
                    <p className="text-xs text-slate-600">{bus.route_name}</p>
                    <p className="text-xs font-mono font-semibold text-blue-600 mt-1">
                      Speed: {(typeof bus.speed === 'number' ? bus.speed : 0).toFixed(1)}{' '}
                      km/h | Load: {bus.occupancy || 'N/A'}
                    </p>
                  </div>
                </Popup>
              </Marker>
            );
          })}
      </MapContainer>
    </div>
  );
}