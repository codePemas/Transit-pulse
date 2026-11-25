export type UserRole = 'commuter' | 'driver' | 'admin';

export interface AuthUser {
  id: number;
  full_name: string;
  email: string;
  role: UserRole;
}

export interface StopPrediction {
  name: string;
  coords: [number, number];
  baseMinutes: number;
  congestionDelay: number;
  confidence: number;
}

export interface FleetIncident {
  id: number;
  route_code: string;
  vehicle_plate: string;
  reporter_name: string;
  severity: 'Moderate' | 'Heavy' | string;
  delay_minutes: number;
  description: string;
  is_active: boolean;
  created_at: string;
}

export interface RouteItem {
  id: number;
  tripId: number;
  name: string;
  code: string;
  color: string;
  fareZar: number;
  congestionLevel: 'Low' | 'Moderate' | 'Heavy';
  trafficMultiplier: number;
  coordinates: [number, number][];
  stops: StopPrediction[];
}

export interface BusTelemetry {
  trip_id: number;
  vehicle_plate: string;
  route_name: string;
  route_code: string;
  latitude: number;
  longitude: number;
  speed: number;
  heading: number;
  occupancy: string;
}

export interface BoardingPass {
  ticket_code: string;
  route_code: string;
  route_name: string;
  fare_zar: number;
  issued_at: string;
  status: 'ACTIVE' | 'VALIDATED';
}

export interface WalletTx {
  id: number;
  tx_type: 'TOPUP' | 'TICKET_PURCHASE' | string;
  title: string;
  amount_zar: number;
  created_at: string;
}

export const CORRIDOR_DATA: RouteItem[] = [
  {
    id: 1,
    tripId: 1,
    name: 'Campus to Downtown Corridor',
    code: 'RT-01',
    color: '#3b82f6',
    fareZar: 18.5,
    congestionLevel: 'Low',
    trafficMultiplier: 1.05,
    coordinates: [
      [-32.7875, 27.9116],
      [-32.8120, 27.9145],
      [-32.8450, 27.9130],
      [-32.8980, 27.9080],
      [-32.9650, 27.9040],
      [-33.0153, 27.9116]
    ],
    stops: [
      { name: 'University Main Gate', coords: [-32.7875, 27.9116], baseMinutes: 2, congestionDelay: 0, confidence: 98 },
      { name: 'Beacon Bay Junction', coords: [-32.9650, 27.9040], baseMinutes: 11, congestionDelay: 2, confidence: 94 },
      { name: 'East London CBD Terminal', coords: [-33.0153, 27.9116], baseMinutes: 19, congestionDelay: 3, confidence: 91 }
    ]
  },
  {
    id: 2,
    tripId: 2,
    name: 'Mdantsane Express Link',
    code: 'RT-02',
    color: '#10b981',
    fareZar: 22.0,
    congestionLevel: 'Heavy',
    trafficMultiplier: 1.32,
    coordinates: [
      [-32.9480, 27.7710],
      [-32.9560, 27.8050],
      [-32.9680, 27.8420],
      [-32.9890, 27.8790],
      [-33.0153, 27.9116]
    ],
    stops: [
      { name: 'Mdantsane Highway Hub', coords: [-32.9480, 27.7710], baseMinutes: 3, congestionDelay: 1, confidence: 96 },
      { name: 'Amalinda Crossing (N2)', coords: [-32.9890, 27.8790], baseMinutes: 12, congestionDelay: 5, confidence: 89 },
      { name: 'East London CBD Terminal', coords: [-33.0153, 27.9116], baseMinutes: 18, congestionDelay: 6, confidence: 87 }
    ]
  },
  {
    id: 3,
    tripId: 3,
    name: 'Gonubie Coastal Loop',
    code: 'RT-03',
    color: '#f59e0b',
    fareZar: 20.0,
    congestionLevel: 'Moderate',
    trafficMultiplier: 1.15,
    coordinates: [
      [-32.9360, 28.0120],
      [-32.9480, 27.9750],
      [-32.9650, 27.9400],
      [-32.9920, 27.9260],
      [-33.0153, 27.9116]
    ],
    stops: [
      { name: 'Gonubie Main Road', coords: [-32.9360, 28.0120], baseMinutes: 4, congestionDelay: 1, confidence: 95 },
      { name: 'Nahoon Beach Turnoff', coords: [-32.9920, 27.9260], baseMinutes: 10, congestionDelay: 2, confidence: 93 },
      { name: 'East London CBD Terminal', coords: [-33.0153, 27.9116], baseMinutes: 16, congestionDelay: 2, confidence: 92 }
    ]
  }
];

export function computePredictedEta(
  stop: StopPrediction,
  stopIndex: number,
  busSpeed: number,
  activeIncidentDelay: number
): number {
  const speedFactor = busSpeed > 0 ? Math.max(0.75, Math.min(1.4, 45 / busSpeed)) : 1.0;
  const incidentImpact = stopIndex === 0 ? Math.ceil(activeIncidentDelay * 0.5) : activeIncidentDelay;
  const predicted = Math.round((stop.baseMinutes + stop.congestionDelay + incidentImpact) * speedFactor);
  return Math.max(1, predicted);
}