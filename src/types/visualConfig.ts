export type PayloadParamValueType = 'string' | 'number' | 'boolean' | 'json';
export type PayloadParamValidationErrorCode =
  | 'payload_invalid_number'
  | 'payload_invalid_boolean'
  | 'payload_invalid_json';

export type VisualConfigFieldPath =
  | 'port'
  | 'logsMaxTotalSizeMb'
  | 'requestRetry'
  | 'maxRetryCredentials'
  | 'maxRetryInterval'
  | 'authRuntime.unauthorizedDeleteThreshold'
  | 'authRuntime.unauthorizedDeleteWindowSeconds'
  | 'authMaintenance.scanIntervalSeconds'
  | 'authMaintenance.deleteIntervalSeconds'
  | 'authMaintenance.deleteStatusCodes'
  | 'authMaintenance.disableStatusCodes'
  | 'authMaintenance.quotaStrikeThreshold'
  | 'authMaintenance.codexMaxRequestCount'
  | 'authMaintenance.codexQuotaCheckRequestInterval'
  | 'streaming.keepaliveSeconds'
  | 'streaming.bootstrapRetries'
  | 'streaming.nonstreamKeepaliveInterval';

export type VisualConfigValidationErrorCode =
  | 'port_range'
  | 'non_negative_integer'
  | 'status_code_list';

export type VisualConfigValidationErrors = Partial<
  Record<VisualConfigFieldPath, VisualConfigValidationErrorCode>
>;

export type PayloadParamEntry = {
  id: string;
  path: string;
  valueType: PayloadParamValueType;
  value: string;
};

export type PayloadModelEntry = {
  id: string;
  name: string;
  protocol?: string;
};

export type PayloadRule = {
  id: string;
  models: PayloadModelEntry[];
  params: PayloadParamEntry[];
};

export type PayloadFilterRule = {
  id: string;
  models: PayloadModelEntry[];
  params: string[];
};

export interface StreamingConfig {
  keepaliveSeconds: string;
  bootstrapRetries: string;
  nonstreamKeepaliveInterval: string;
}

export interface AuthRuntimeConfig {
  unauthorizedDeleteThreshold: string;
  unauthorizedDeleteWindowSeconds: string;
}

export interface AuthMaintenanceConfig {
  enable: boolean;
  scanIntervalSeconds: string;
  deleteIntervalSeconds: string;
  deleteStatusCodes: string;
  disableStatusCodes: string;
  deleteQuotaExceeded: boolean;
  quotaStrikeThreshold: string;
  disableCodexUsageLimitReached: boolean;
  codexMaxRequestCount: string;
  codexQuotaCheckRequestInterval: string;
}

export type RoutingStrategy = 'round-robin' | 'fill-first' | 'success-rate' | 'simhash';

export type VisualConfigValues = {
  host: string;
  port: string;
  tlsEnable: boolean;
  tlsCert: string;
  tlsKey: string;
  rmAllowRemote: boolean;
  rmSecretKey: string;
  rmDisableControlPanel: boolean;
  rmPanelRepo: string;
  authDir: string;
  apiKeysText: string;
  debug: boolean;
  commercialMode: boolean;
  loggingToFile: boolean;
  logsMaxTotalSizeMb: string;
  usageStatisticsEnabled: boolean;
  proxyUrl: string;
  forceModelPrefix: boolean;
  requestRetry: string;
  maxRetryCredentials: string;
  maxRetryInterval: string;
  quotaSwitchProject: boolean;
  quotaSwitchPreviewModel: boolean;
  routingStrategy: RoutingStrategy;
  wsAuth: boolean;
  payloadDefaultRules: PayloadRule[];
  payloadDefaultRawRules: PayloadRule[];
  payloadOverrideRules: PayloadRule[];
  payloadOverrideRawRules: PayloadRule[];
  payloadFilterRules: PayloadFilterRule[];
  streaming: StreamingConfig;
  authRuntime: AuthRuntimeConfig;
  authMaintenance: AuthMaintenanceConfig;

  // 新增超时配置（字符串类型用于输入框）
  apiTimeout: string; // 通用API超时（秒）
  authFilesTimeout: string; // 认证文件列表专用超时（秒）
};

export const makeClientId = () => {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
};

export const DEFAULT_VISUAL_VALUES: VisualConfigValues = {
  host: '',
  port: '',
  tlsEnable: false,
  tlsCert: '',
  tlsKey: '',
  rmAllowRemote: false,
  rmSecretKey: '',
  rmDisableControlPanel: false,
  rmPanelRepo: '',
  authDir: '',
  apiKeysText: '',
  debug: false,
  commercialMode: false,
  loggingToFile: false,
  logsMaxTotalSizeMb: '',
  usageStatisticsEnabled: false,
  proxyUrl: '',
  forceModelPrefix: false,
  requestRetry: '',
  maxRetryCredentials: '',
  maxRetryInterval: '',
  quotaSwitchProject: true,
  quotaSwitchPreviewModel: true,
  routingStrategy: 'round-robin',
  wsAuth: false,
  payloadDefaultRules: [],
  payloadDefaultRawRules: [],
  payloadOverrideRules: [],
  payloadOverrideRawRules: [],
  payloadFilterRules: [],
  streaming: {
    keepaliveSeconds: '',
    bootstrapRetries: '',
    nonstreamKeepaliveInterval: '',
  },
  authRuntime: {
    unauthorizedDeleteThreshold: '3',
    unauthorizedDeleteWindowSeconds: '600',
  },
  authMaintenance: {
    enable: true,
    scanIntervalSeconds: '30',
    deleteIntervalSeconds: '5',
    deleteStatusCodes: '',
    disableStatusCodes: '',
    deleteQuotaExceeded: false,
    quotaStrikeThreshold: '6',
    disableCodexUsageLimitReached: true,
    codexMaxRequestCount: '0',
    codexQuotaCheckRequestInterval: '0',
  },

  // 默认值：30秒通用，60秒认证文件列表
  apiTimeout: '30',
  authFilesTimeout: '60',
};
