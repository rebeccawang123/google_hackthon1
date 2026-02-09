export type UserRole = 'Landlord' | 'Merchant' | 'Tenant' | 'Guest';

export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string;
  role?: UserRole;
  isAuthenticated: boolean;
  accessToken?: string;
  embeddedWallet?: string;
  did?: string;
  eigenCreditScore?: number;
  slashableValue?: string;
}

export enum AgentType {
  SAFETY_SENTINEL = 'SAFETY_SENTINEL',
  SPATIAL_ARCHITECT = 'SPATIAL_ARCHITECT',
  REPUTATION_STEWARD = 'REPUTATION_STEWARD',
  MERCHANT_PULSE = 'MERCHANT_PULSE',
  TENANT_CONCIERGE = 'TENANT_CONCIERGE',
  INFRA_JANITOR = 'INFRA_JANITOR',
  SETTLEMENT_MEDIATOR = 'SETTLEMENT_MEDIATOR',
  CITY_CORE = 'CITY_CORE'
}

export interface Agent {
  id: AgentType;
  name: string;
  role: string;
  color: string;
  description: string;
  icon: string;
  avatar: string;
  did: string;
  walletAddress: string;
  status: 'ACTIVE' | 'HIBERNATING' | 'SYNCING';
  creditScore: number;
  embodiedTask: string;
  jsonFeatures: string[];
}

export interface Message {
  id: string;
  sender: AgentType | 'USER';
  text: string;
  timestamp: Date;
  metadata?: any;
}

export interface BuildingData {
  id: string;
  name: string;
  address: string;
  coordinates: { lat: number; lng: number };
  specs: {
    height: string;
    units: number;
    occupancy: string;
  };
  safetyScore: number;
  // 新增字段
  category?: 'RESIDENTIAL' | 'LANDMARK' | 'SIGHTSEEING';
  yearBuilt?: number;
  description?: string;
  securityLevel?: 'HIGH' | 'MEDIUM' | 'LOW';
  nearbyFacilities?: string[];
  rent?: string;
  availability?: boolean;
}

export interface SearchResultPoint {
  id: string;
  label: string;
  lat: number;
  lng: number;
  type: 'SEARCH_RESULT';
  address?: string;
  securityLevel?: 'HIGH' | 'MEDIUM' | 'LOW';
  footTraffic?: number;
  nearbyFacilities?: string[];
}

export interface ResolutionResult {
  id: string;
  address: string;
  privateKey: string;
  email: string;
  description: string;
  timestamp: string;
  network: string;
  // Renamed from tokenId to agentId
  agentId?: number;
  metadata?: {
    derivationPath: string;
    accountIndex: number;
    persona?: string;
    suggestedRole?: string;
    registrationTx?: string;
    agentId?: number;
    // Added field to store the full AI-generated metadata profile
    registrationMetadata?: any;
  };
}

export interface ApiError {
  message: string;
  code?: string;
}

