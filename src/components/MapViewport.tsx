'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import 'leaflet/dist/leaflet.css';
import { Radio, Gauge, Clock, MapPin } from 'lucide-react';
import { RouteItem, BusTelemetry, computePredictedEta } from '@/types/transit';

const MapContainer = dynamic(() => import('react-leaflet').then((mod) => mod.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then((mod) => mod.TileLayer), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then((mod) => mod.Marker), { ssr: false });
const Popup = dynamic(() => import('react-leaflet').then((mod) => mod.Popup), { ssr: false });
const Polyline = dynamic(() => import('react-leaflet').then((mod) => mod.Polyline), { ssr: false });
const CircleMarker = dynamic(() => import('react-leaflet').then((mod) => mod.CircleMarker), { ssr: false });

const MapController = dynamic(
  () =>
    import('react-leaflet').then((mod) => {
      const { useMap } = mod;
      return function Controller({
        bounds,
        center,
        followMode
      }: {
        bounds: [number, number][] | null;
        center: [number, number] | null;
        followMode: boolean;
      }) {
        const map = useMap();

        useEffect(() => {
          if (bounds && bounds.length > 1) {
            map.flyToBounds(bounds, { padding: [60, 60], duration: 1.2 });
          }
        }, [bounds, map]);

        useEffect(() => {
          if (followMode && center) {
            map.panTo(center, { animate: true, duration: 0.8 });
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
  onSelectBus
}: MapViewportProps) {
  const [busIcon, setBusIcon] = useState<any>(null);

  useEffect(() => {
    import('leaflet').then((L) => {
      const icon = L.divIcon({
        className: 'custom-bus-marker',
        html: `
          <div style="position:relative;display:flex;align-items:center;justify-content:center;width:40px;height:40px;">
            <span style="position:absolute;width:40px;height:40px;border-radius:9999px;background:rgba(59,130,246,0.35);animation:ping 1.8s cubic-bezier(0,0,0.2,1) infinite;"></span>
            <div style="position:relative;width:32px;height:32px;border-radius:9999px;background:#2563eb;border:3px solid #ffffff;box-shadow:0 4px 14px rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;color:white;font-weight:800;font-size:11px;">
              BUS
            </div>
          </div>
        `,
        iconSize: [40, 40],
        iconAnchor: [20, 20]
      });
      setBusIcon(icon);
    });
  }, []);

  const liveEtaMinutes = computePredictedEta(
    activeRoute.stops[0],
    0,
    activeBus.speed,
    routeDelayMinutes
  );

  return (
    <div className="flex-1 relative">
      {activeBus && (
        <div className="absolute top-4 right-4 z-[1000] bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-2xl p-4 shadow-2xl w-80">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2.5 mb-3">
            <div className="flex items-center gap-2">
              <Radio
                className={`w-4 h-4 ${
                  wsLive ? 'text-emerald-400 animate-pulse' : 'text-blue-400'
                }`}
              />
              <span className="font-bold text-sm text-white">{activeBus.vehicle_plate}</span>
            </div>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-blue-600 text-white font-semibold">
              {activeBus.route_code}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-slate-950/80 rounded-lg p-2 border border-slate-800">
              <Gauge className="w-3.5 h-3.5 text-emerald-400 mx-auto mb-1" />
              <p className="text-xs font-bold font-mono text-white">
                {activeBus.speed.toFixed(1)}
              </p>
              <p className="text-[10px] text-slate-400">km/h</p>
            </div>
            <div className="bg-slate-950/80 rounded-lg p-2 border border-slate-800">
              <Clock className="w-3.5 h-3.5 text-blue-400 mx-auto mb-1" />
              <p className="text-xs font-bold font-mono text-white">{liveEtaMinutes} min</p>
              <p className="text-[10px] text-slate-400">AI ETA</p>
            </div>
            <div className="bg-slate-950/80 rounded-lg p-2 border border-slate-800">
              <MapPin className="w-3.5 h-3.5 text-amber-400 mx-auto mb-1" />
              <p className="text-xs font-bold font-mono text-white">{activeBus.occupancy}</p>
              <p className="text-[10px] text-slate-400">Load</p>
            </div>
          </div>

          <div className="mt-3 pt-2.5 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400 font-mono">
            <span>
              GPS: {activeBus.latitude.toFixed(4)}, {activeBus.longitude.toFixed(4)}
            </span>
            <button
              onClick={onToggleFollow}
              className={`px-2 py-0.5 rounded font-sans font-semibold ${
                followBus ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300'
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
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} />

        <MapController
          bounds={mapBounds}
          center={activeBus ? [activeBus.latitude, activeBus.longitude] : null}
          followMode={followBus}
        />

        <Polyline
          positions={activeRoute.coordinates}
          color={activeRoute.color}
          weight={6}
          opacity={0.85}
        />

        {breadcrumbs.length > 1 && (
          <Polyline
            positions={breadcrumbs}
            color="#ef4444"
            weight={4}
            dashArray="6, 8"
            opacity={0.9}
          />
        )}

        {activeRoute.stops.map((stop, idx) => {
          const eta = computePredictedEta(stop, idx, activeBus.speed, routeDelayMinutes);
          return (
            <CircleMarker
              key={idx}
              center={stop.coords}
              radius={6}
              pathOptions={{
                color: '#ffffff',
                weight: 2,
                fillColor: activeRoute.color,
                fillOpacity: 1
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

        {busIcon &&
          buses.map((bus) => (
            <Marker
              key={bus.trip_id}
              position={[bus.latitude, bus.longitude]}
              icon={busIcon}
              eventHandlers={{
                click: () => onSelectBus(bus)
              }}
            >
              <Popup>
                <div className="p-1 text-slate-900 font-sans">
                  <p className="font-bold text-sm">{bus.vehicle_plate}</p>
                  <p className="text-xs text-slate-600">{bus.route_name}</p>
                  <p className="text-xs font-mono font-semibold text-blue-600 mt-1">
                    Speed: {bus.speed.toFixed(1)} km/h | Load: {bus.occupancy}
                  </p>
                </div>
              </Popup>
            </Marker>
          ))}
      </MapContainer>
    </div>
  );
}