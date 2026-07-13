import type {
  AiProviderName,
  AuthorType,
  ConversationMode,
  ConversationStatus,
  MessageDirection,
  MessageStatus,
  MessageType,
  Segment,
  UserRole,
} from "./enums.js";

// DTOs retornados pela API — usados pelo dashboard

export interface UserDto {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  tenantId: string | null;
}

export interface TenantDto {
  id: string;
  name: string;
  slug: string;
  segment: Segment;
  status: string;
  timezone: string;
  description: string | null;
  address: string | null;
  phoneDisplay: string | null;
  businessHours: unknown;
  waPhoneNumberId: string | null;
  waConfigured: boolean;
  ownerWaId: string | null;
  loyaltyPointsPerReal: number;
  createdAt: string;
}

export interface AiConfigDto {
  provider: AiProviderName;
  model: string;
  hasOwnApiKey: boolean;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  enabledTools: string[];
  greetingMessage: string | null;
  escalationMessage: string | null;
  maxHistoryMessages: number;
  dailyTokenBudget: number | null;
  npsEnabled: boolean;
}

export interface ContactDto {
  id: string;
  waId: string;
  name: string | null;
  profileName: string | null;
  tags: string[];
}

export interface ConversationDto {
  id: string;
  tenantId: string;
  contact: ContactDto;
  status: ConversationStatus;
  mode: ConversationMode;
  unreadCount: number;
  lastCustomerMessageAt: string | null;
  lastMessagePreview: string | null;
  updatedAt: string;
}

export interface MessageDto {
  id: string;
  conversationId: string;
  direction: MessageDirection;
  authorType: AuthorType;
  type: MessageType;
  text: string | null;
  mediaUrl: string | null;
  status: MessageStatus;
  createdAt: string;
}

export interface CatalogItemDto {
  id: string;
  category: string;
  name: string;
  description: string | null;
  priceCents: number;
  durationMin: number | null;
  imageUrl: string | null;
  active: boolean;
  externalId: string | null;
}

export interface LoginResponse {
  token: string;
  user: UserDto;
}
