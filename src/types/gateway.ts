export type ProviderProtocol = 'openai-compatible' | 'gemini-native';

export interface ProviderModel {
  id: string;
  name: string;
  enabled: boolean;
  priority: number; // 1 = highest
  pipelineOrder?: number; // Order index for "all-models" waterfall
  inAllModelsPool?: boolean; // Whether model participates in "all-models"
  contextWindow?: number;
  notes?: string;
}

export interface AIProvider {
  id: string;
  name: string;
  enabled: boolean;
  protocol: ProviderProtocol;
  baseUrl: string;
  apiKey: string;
  customHeaders?: Record<string, string>;
  models: ProviderModel[];
  createdAt: number;
  updatedAt: number;
}

export interface PipelineItem {
  providerId: string;
  providerName: string;
  providerProtocol: ProviderProtocol;
  modelId: string;
  modelName: string;
  pipelineOrder: number;
  inAllModelsPool: boolean;
  contextWindow?: number;
  providerEnabled: boolean;
  modelEnabled: boolean;
}

export interface ClientApiKey {
  id: string;
  name: string;
  key: string;
  enabled: boolean;
  createdAt: number;
  lastUsedAt?: number;
  totalRequests: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
}

export interface GatewaySettings {
  masterApiKey: string;
  firebaseUrl?: string; // Firebase Realtime Database URL
  firebaseSecret?: string; // Database secret or auth token
  cacheTtlSeconds: number; // In-memory cache TTL (default: 60)
  fallbackEnabled: boolean;
  maxRetries: number;
  requestTimeoutMs: number;
}

export interface FallbackAttempt {
  providerId: string;
  providerName: string;
  modelId: string;
  status: number;
  latencyMs: number;
  error?: string;
}

export interface GatewayLog {
  id: string;
  timestamp: number;
  providerId: string;
  providerName: string;
  model: string;
  status: 'success' | 'failure';
  statusCode: number;
  latencyMs: number;
  errorMessage?: string;
  errorDetails?: any;
  wasFallback: boolean;
  originalModelRequested?: string;
  stream: boolean;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  userAgent?: string;
  apiKeyId?: string;
  apiKeyName?: string;
  fallbackChain?: FallbackAttempt[];
  fallbackSequenceUsed?: string[];
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
}

export interface ChatCompletionRequest {
  model?: string;
  messages: ChatMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
}

export interface OpenAIModelItem {
  id: string;
  object: 'model';
  created: number;
  owned_by: string;
  permission: any[];
  root: string;
  parent: null;
  metadata?: {
    providerId: string;
    providerName: string;
    priority?: number;
    pipelineOrder?: number;
    inAllModelsPool?: boolean;
    isVirtual?: boolean;
    contextWindow?: number;
    protocol?: ProviderProtocol;
  };
}
