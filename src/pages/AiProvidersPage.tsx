import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  AmpcodeSection,
  ClaudeSection,
  CodexSection,
  GeminiSection,
  OpenAISection,
  VertexSection,
  ProviderNav,
  useProviderStats,
} from '@/components/providers';
import {
  withDisableAllModelsRule,
  withoutDisableAllModelsRule,
} from '@/components/providers/utils';
import { Input } from '@/components/ui/Input';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { ampcodeApi, providersApi } from '@/services/api';
import { useAuthStore, useConfigStore, useNotificationStore, useThemeStore } from '@/stores';
import type { GeminiKeyConfig, OpenAIProviderConfig, ProviderKeyConfig } from '@/types';
import styles from './AiProvidersPage.module.scss';

export function AiProvidersPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const showConfirmation = useNotificationStore((state) => state.showConfirmation);
  const resolvedTheme = useThemeStore((state) => state.resolvedTheme);
  const connectionStatus = useAuthStore((state) => state.connectionStatus);

  const config = useConfigStore((state) => state.config);
  const fetchConfig = useConfigStore((state) => state.fetchConfig);
  const updateConfigValue = useConfigStore((state) => state.updateConfigValue);
  const clearCache = useConfigStore((state) => state.clearCache);
  const isCacheValid = useConfigStore((state) => state.isCacheValid);

  const hasMounted = useRef(false);
  const [loading, setLoading] = useState(() => !isCacheValid());
  const [error, setError] = useState('');

  const [geminiKeys, setGeminiKeys] = useState<GeminiKeyConfig[]>(
    () => config?.geminiApiKeys || []
  );
  const [ampcodeModalLoading, setAmpcodeModalLoading] = useState(false);
  const [ampcodeLoaded, setAmpcodeLoaded] = useState(false);
  const [ampcodeMappingsDirty, setAmpcodeMappingsDirty] = useState(false);
  const [ampcodeModalError, setAmpcodeModalError] = useState('');
  const [ampcodeSaving, setAmpcodeSaving] = useState(false);
  const [openaiDiscoveryOpen, setOpenaiDiscoveryOpen] = useState(false);
  const [openaiDiscoveryEndpoint, setOpenaiDiscoveryEndpoint] = useState('');
  const [openaiDiscoveryModels, setOpenaiDiscoveryModels] = useState<ModelInfo[]>([]);
  const [openaiDiscoveryLoading, setOpenaiDiscoveryLoading] = useState(false);
  const [openaiDiscoveryError, setOpenaiDiscoveryError] = useState('');
  const [openaiDiscoverySearch, setOpenaiDiscoverySearch] = useState('');
  const [openaiDiscoverySelected, setOpenaiDiscoverySelected] = useState<Set<string>>(new Set());
  const [openaiBulkKeysText, setOpenaiBulkKeysText] = useState('');
  const [openaiTestModel, setOpenaiTestModel] = useState('');
  const [openaiTestStatus, setOpenaiTestStatus] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle');
  const [openaiTestMessage, setOpenaiTestMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [configSwitchingKey, setConfigSwitchingKey] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const disableControls = connectionStatus !== 'connected';
  const isSwitching = Boolean(configSwitchingKey);

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredGeminiKeys = useMemo(() => {
    if (!normalizedQuery) return geminiKeys.map((item, index) => ({ item, originalIndex: index }));
    return geminiKeys
      .map((item, index) => ({ item, originalIndex: index }))
      .filter(({ item }) => {
        const searchFields = [
          item.apiKey,
          item.prefix,
          item.baseUrl,
          ...(item.excludedModels || []),
          ...Object.keys(item.headers || {}),
          ...Object.values(item.headers || {}),
        ];
        return searchFields.some((field) => field?.toLowerCase().includes(normalizedQuery));
      });
  }, [geminiKeys, normalizedQuery]);

  const filteredCodexConfigs = useMemo(() => {
    if (!normalizedQuery)
      return codexConfigs.map((item, index) => ({ item, originalIndex: index }));
    return codexConfigs
      .map((item, index) => ({ item, originalIndex: index }))
      .filter(({ item }) => {
        const searchFields = [
          item.apiKey,
          item.prefix,
          item.baseUrl,
          item.proxyUrl,
          ...(item.excludedModels || []),
          ...(item.models?.map((m) => m.name) || []),
          ...(item.models?.map((m) => m.alias) || []),
          ...Object.keys(item.headers || {}),
          ...Object.values(item.headers || {}),
        ];
        return searchFields.some((field) => field?.toLowerCase().includes(normalizedQuery));
      });
  }, [codexConfigs, normalizedQuery]);

  const filteredClaudeConfigs = useMemo(() => {
    if (!normalizedQuery)
      return claudeConfigs.map((item, index) => ({ item, originalIndex: index }));
    return claudeConfigs
      .map((item, index) => ({ item, originalIndex: index }))
      .filter(({ item }) => {
        const searchFields = [
          item.apiKey,
          item.prefix,
          item.baseUrl,
          item.proxyUrl,
          ...(item.excludedModels || []),
          ...(item.models?.map((m) => m.name) || []),
          ...(item.models?.map((m) => m.alias) || []),
          ...Object.keys(item.headers || {}),
          ...Object.values(item.headers || {}),
        ];
        return searchFields.some((field) => field?.toLowerCase().includes(normalizedQuery));
      });
  }, [claudeConfigs, normalizedQuery]);

  const filteredVertexConfigs = useMemo(() => {
    if (!normalizedQuery)
      return vertexConfigs.map((item, index) => ({ item, originalIndex: index }));
    return vertexConfigs
      .map((item, index) => ({ item, originalIndex: index }))
      .filter(({ item }) => {
        const searchFields = [
          item.apiKey,
          item.prefix,
          item.baseUrl,
          item.proxyUrl,
          ...(item.models?.map((m) => m.name) || []),
          ...(item.models?.map((m) => m.alias) || []),
          ...Object.keys(item.headers || {}),
          ...Object.values(item.headers || {}),
        ];
        return searchFields.some((field) => field?.toLowerCase().includes(normalizedQuery));
      });
  }, [vertexConfigs, normalizedQuery]);

  const filteredOpenaiProviders = useMemo(() => {
    if (!normalizedQuery)
      return openaiProviders.map((item, index) => ({ item, originalIndex: index }));
    return openaiProviders
      .map((item, index) => ({ item, originalIndex: index }))
      .filter(({ item }) => {
        const searchFields = [
          item.name,
          item.prefix,
          item.baseUrl,
          item.testModel,
          ...(item.apiKeyEntries?.map((e) => e.apiKey) || []),
          ...(item.apiKeyEntries?.map((e) => e.proxyUrl) || []),
          ...(item.models?.map((m) => m.name) || []),
          ...(item.models?.map((m) => m.alias) || []),
          ...Object.keys(item.headers || {}),
          ...Object.values(item.headers || {}),
        ];
        return searchFields.some((field) => field?.toLowerCase().includes(normalizedQuery));
      });
  }, [openaiProviders, normalizedQuery]);

  const showAmpcode = useMemo(() => {
    if (!normalizedQuery) return true;
    const ampcode = config?.ampcode;
    if (!ampcode) return false;
    const searchFields = [
      ampcode.upstreamUrl,
      ampcode.upstreamApiKey,
      ...(ampcode.modelMappings?.map((m) => m.from) || []),
      ...(ampcode.modelMappings?.map((m) => m.to) || []),
    ];
    return searchFields.some((field) => field?.toLowerCase().includes(normalizedQuery));
  }, [config?.ampcode, normalizedQuery]);

  const hasSearchResults =
    filteredGeminiKeys.length > 0 ||
    filteredCodexConfigs.length > 0 ||
    filteredClaudeConfigs.length > 0 ||
    filteredVertexConfigs.length > 0 ||
    filteredOpenaiProviders.length > 0 ||
    showAmpcode;

  const shouldRenderGeminiSection = !normalizedQuery || filteredGeminiKeys.length > 0;
  const shouldRenderCodexSection = !normalizedQuery || filteredCodexConfigs.length > 0;
  const shouldRenderClaudeSection = !normalizedQuery || filteredClaudeConfigs.length > 0;
  const shouldRenderVertexSection = !normalizedQuery || filteredVertexConfigs.length > 0;
  const shouldRenderOpenaiSection = !normalizedQuery || filteredOpenaiProviders.length > 0;

  const { keyStats, usageDetails, loadKeyStats, refreshKeyStats } = useProviderStats();

  const getErrorMessage = (err: unknown) => {
    if (err instanceof Error) return err.message;
    if (typeof err === 'string') return err;
    return '';
  };

  const loadConfigs = useCallback(async () => {
    const hasValidCache = isCacheValid();
    if (!hasValidCache) {
      setLoading(true);
    }
    setError('');
    try {
      const [configResult, vertexResult, ampcodeResult] = await Promise.allSettled([
        fetchConfig(),
        providersApi.getVertexConfigs(),
        ampcodeApi.getAmpcode(),
      ]);

      if (configResult.status !== 'fulfilled') {
        throw configResult.reason;
      }

      const data = configResult.value;
      setGeminiKeys(data?.geminiApiKeys || []);
      setCodexConfigs(data?.codexApiKeys || []);
      setClaudeConfigs(data?.claudeApiKeys || []);
      setVertexConfigs(data?.vertexApiKeys || []);
      setOpenaiProviders(data?.openaiCompatibility || []);

      if (vertexResult.status === 'fulfilled') {
        setVertexConfigs(vertexResult.value || []);
        updateConfigValue('vertex-api-key', vertexResult.value || []);
        clearCache('vertex-api-key');
      }

      if (ampcodeResult.status === 'fulfilled') {
        updateConfigValue('ampcode', ampcodeResult.value);
        clearCache('ampcode');
      }
    } catch (err: unknown) {
      const message = getErrorMessage(err) || t('notification.refresh_failed');
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [clearCache, fetchConfig, isCacheValid, t, updateConfigValue]);

  useEffect(() => {
    if (hasMounted.current) return;
    hasMounted.current = true;
    loadConfigs();
    void loadKeyStats().catch(() => {});
  }, [loadConfigs, loadKeyStats]);

  useHeaderRefresh(refreshKeyStats);

  useEffect(() => {
    if (config?.geminiApiKeys) setGeminiKeys(config.geminiApiKeys);
    if (config?.codexApiKeys) setCodexConfigs(config.codexApiKeys);
    if (config?.claudeApiKeys) setClaudeConfigs(config.claudeApiKeys);
    if (config?.vertexApiKeys) setVertexConfigs(config.vertexApiKeys);
    if (config?.openaiCompatibility) setOpenaiProviders(config.openaiCompatibility);
  }, [
    config?.geminiApiKeys,
    config?.codexApiKeys,
    config?.claudeApiKeys,
    config?.vertexApiKeys,
    config?.openaiCompatibility,
  ]);

  const closeModal = () => {
    setModal(null);
    setGeminiForm({
      apiKey: '',
      prefix: '',
      baseUrl: '',
      headers: {},
      excludedModels: [],
      excludedText: '',
    });
    setProviderForm({
      apiKey: '',
      prefix: '',
      baseUrl: '',
      proxyUrl: '',
      headers: {},
      models: [],
      excludedModels: [],
      modelEntries: [{ name: '', alias: '' }],
      excludedText: '',
    });
    setOpenaiForm({
      name: '',
      prefix: '',
      baseUrl: '',
      headers: [],
      apiKeyEntries: [buildApiKeyEntry()],
      modelEntries: [{ name: '', alias: '' }],
      testModel: undefined,
    });
    setAmpcodeForm(buildAmpcodeFormState(null));
    setAmpcodeModalLoading(false);
    setAmpcodeLoaded(false);
    setAmpcodeMappingsDirty(false);
    setAmpcodeModalError('');
    setAmpcodeSaving(false);
    setOpenaiDiscoveryOpen(false);
    setOpenaiDiscoveryModels([]);
    setOpenaiDiscoverySelected(new Set());
    setOpenaiDiscoverySearch('');
    setOpenaiDiscoveryError('');
    setOpenaiDiscoveryEndpoint('');
    setOpenaiBulkKeysText('');
    setOpenaiTestModel('');
    setOpenaiTestStatus('idle');
    setOpenaiTestMessage('');
  };

  const openGeminiModal = (index: number | null) => {
    if (index !== null) {
      const entry = geminiKeys[index];
      setGeminiForm({
        ...entry,
        excludedText: excludedModelsToText(entry?.excludedModels),
      });
    }
    setModal({ type: 'gemini', index });
  };

  const openProviderModal = (type: 'codex' | 'claude', index: number | null) => {
    const source = type === 'codex' ? codexConfigs : claudeConfigs;
    if (index !== null) {
      const entry = source[index];
      setProviderForm({
        ...entry,
        modelEntries: modelsToEntries(entry?.models),
        excludedText: excludedModelsToText(entry?.excludedModels),
      });
    }
    setModal({ type, index });
  };

  const openAmpcodeModal = () => {
    setAmpcodeModalLoading(true);
    setAmpcodeLoaded(false);
    setAmpcodeMappingsDirty(false);
    setAmpcodeModalError('');
    setAmpcodeForm(buildAmpcodeFormState(config?.ampcode ?? null));
    setModal({ type: 'ampcode', index: null });

    void (async () => {
      try {
        const ampcode = await ampcodeApi.getAmpcode();
        setAmpcodeLoaded(true);
        updateConfigValue('ampcode', ampcode);
        clearCache('ampcode');
        setAmpcodeForm(buildAmpcodeFormState(ampcode));
      } catch (err: any) {
        setAmpcodeModalError(err?.message || t('notification.refresh_failed'));
      } finally {
        setAmpcodeModalLoading(false);
      }
    })();
  };

  const openOpenaiModal = (index: number | null) => {
    if (index !== null) {
      const entry = openaiProviders[index];
      const modelEntries = modelsToEntries(entry.models);
      setOpenaiForm({
        name: entry.name,
        prefix: entry.prefix ?? '',
        baseUrl: entry.baseUrl,
        headers: headersToEntries(entry.headers),
        testModel: entry.testModel,
        modelEntries,
        apiKeyEntries: entry.apiKeyEntries?.length ? entry.apiKeyEntries : [buildApiKeyEntry()],
      });
      const available = modelEntries.map((m) => m.name.trim()).filter(Boolean);
      const initialModel =
        entry.testModel && available.includes(entry.testModel)
          ? entry.testModel
          : available[0] || '';
      setOpenaiTestModel(initialModel);
    } else {
      setOpenaiTestModel('');
    }
    setOpenaiBulkKeysText('');
    setOpenaiTestStatus('idle');
    setOpenaiTestMessage('');
    setModal({ type: 'openai', index });
  };

  const closeOpenaiModelDiscovery = () => {
    setOpenaiDiscoveryOpen(false);
    setOpenaiDiscoveryModels([]);
    setOpenaiDiscoverySelected(new Set());
    setOpenaiDiscoverySearch('');
    setOpenaiDiscoveryError('');
  };

  const fetchOpenaiModelDiscovery = async ({
    allowFallback = true,
  }: { allowFallback?: boolean } = {}) => {
    const baseUrl = openaiForm.baseUrl.trim();
    if (!baseUrl) return;

    setOpenaiDiscoveryLoading(true);
    setOpenaiDiscoveryError('');
    try {
      const headers = buildHeaderObject(openaiForm.headers);
      const firstKey = openaiForm.apiKeyEntries
        .find((entry) => entry.apiKey?.trim())
        ?.apiKey?.trim();
      const hasAuthHeader = Boolean(headers.Authorization || headers['authorization']);
      const list = await modelsApi.fetchModelsViaApiCall(
        baseUrl,
        hasAuthHeader ? undefined : firstKey,
        headers
      );
      setOpenaiDiscoveryModels(list);
    } catch (err: any) {
      if (allowFallback) {
        try {
          await providersApi.deleteGeminiKey(entry.apiKey);
          const next = geminiKeys.filter((_, idx) => idx !== index);
          setGeminiKeys(next);
          updateConfigValue('gemini-api-key', next);
          clearCache('gemini-api-key');
          showNotification(t('notification.gemini_key_deleted'), 'success');
        } catch (err: unknown) {
          const message = getErrorMessage(err);
          showNotification(`${t('notification.delete_failed')}: ${message}`, 'error');
        }
      },
    });
  };

  const setConfigEnabled = async (
    provider: 'gemini' | 'codex' | 'claude' | 'vertex',
    index: number,
    enabled: boolean
  ) => {
    if (provider === 'gemini') {
      const current = geminiKeys[index];
      if (!current) return;

      const switchingKey = `${provider}:${current.apiKey}`;
      setConfigSwitchingKey(switchingKey);

      const previousList = geminiKeys;
      const nextExcluded = enabled
        ? withoutDisableAllModelsRule(current.excludedModels)
        : withDisableAllModelsRule(current.excludedModels);
      const nextItem: GeminiKeyConfig = { ...current, excludedModels: nextExcluded };
      const nextList = previousList.map((item, idx) => (idx === index ? nextItem : item));

      setGeminiKeys(nextList);
      updateConfigValue('gemini-api-key', nextList);
      clearCache('gemini-api-key');

      try {
        await providersApi.saveGeminiKeys(nextList);
        showNotification(
          enabled ? t('notification.config_enabled') : t('notification.config_disabled'),
          'success'
        );
      } catch (err: unknown) {
        const message = getErrorMessage(err);
        setGeminiKeys(previousList);
        updateConfigValue('gemini-api-key', previousList);
        clearCache('gemini-api-key');
        showNotification(`${t('notification.update_failed')}: ${message}`, 'error');
      } finally {
        setConfigSwitchingKey(null);
      }
      return;
    }

    const source =
      provider === 'codex'
        ? codexConfigs
        : provider === 'claude'
          ? claudeConfigs
          : vertexConfigs;
    const current = source[index];
    if (!current) return;

    const switchingKey = `${provider}:${current.apiKey}`;
    setConfigSwitchingKey(switchingKey);

    const previousList = source;
    const nextExcluded = enabled
      ? withoutDisableAllModelsRule(current.excludedModels)
      : withDisableAllModelsRule(current.excludedModels);
    const nextItem: ProviderKeyConfig = { ...current, excludedModels: nextExcluded };
    const nextList = previousList.map((item, idx) => (idx === index ? nextItem : item));

    if (provider === 'codex') {
      setCodexConfigs(nextList);
      updateConfigValue('codex-api-key', nextList);
      clearCache('codex-api-key');
    } else if (provider === 'claude') {
      setClaudeConfigs(nextList);
      updateConfigValue('claude-api-key', nextList);
      clearCache('claude-api-key');
    } else {
      setVertexConfigs(nextList);
      updateConfigValue('vertex-api-key', nextList);
      clearCache('vertex-api-key');
    }

    try {
      if (provider === 'codex') {
        await providersApi.saveCodexConfigs(nextList);
      } else if (provider === 'claude') {
        await providersApi.saveClaudeConfigs(nextList);
      } else {
        await providersApi.saveVertexConfigs(nextList);
      }
      showNotification(
        enabled ? t('notification.config_enabled') : t('notification.config_disabled'),
        'success'
      );
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      if (provider === 'codex') {
        setCodexConfigs(previousList);
        updateConfigValue('codex-api-key', previousList);
        clearCache('codex-api-key');
      } else if (provider === 'claude') {
        setClaudeConfigs(previousList);
        updateConfigValue('claude-api-key', previousList);
        clearCache('claude-api-key');
      } else {
        setVertexConfigs(previousList);
        updateConfigValue('vertex-api-key', previousList);
        clearCache('vertex-api-key');
      }
      showNotification(`${t('notification.update_failed')}: ${message}`, 'error');
    } finally {
      setConfigSwitchingKey(null);
    }
  };

  const saveProvider = async (type: 'codex' | 'claude') => {
    const trimmedBaseUrl = (providerForm.baseUrl ?? '').trim();
    const baseUrl = trimmedBaseUrl || undefined;
    if (type === 'codex' && !baseUrl) {
      showNotification(t('notification.codex_base_url_required'), 'error');
      return;
    }

    setSaving(true);
    try {
      const source = type === 'codex' ? codexConfigs : claudeConfigs;

      const payload: ProviderKeyConfig = {
        apiKey: providerForm.apiKey.trim(),
        prefix: providerForm.prefix?.trim() || undefined,
        baseUrl,
        proxyUrl: providerForm.proxyUrl?.trim() || undefined,
        headers: buildHeaderObject(headersToEntries(providerForm.headers as any)),
        models: entriesToModels(providerForm.modelEntries),
        excludedModels: parseExcludedModels(providerForm.excludedText),
      };

      const nextList =
        modal?.type === type && modal.index !== null
          ? source.map((item, idx) => (idx === modal.index ? payload : item))
          : [...source, payload];

      if (type === 'codex') {
        await providersApi.saveCodexConfigs(nextList);
        setCodexConfigs(nextList);
        updateConfigValue('codex-api-key', nextList);
        clearCache('codex-api-key');
        const message =
          modal?.index !== null
            ? t('notification.codex_config_updated')
            : t('notification.codex_config_added');
        showNotification(message, 'success');
      } else {
        await providersApi.saveClaudeConfigs(nextList);
        setClaudeConfigs(nextList);
        updateConfigValue('claude-api-key', nextList);
        clearCache('claude-api-key');
        const message =
          modal?.index !== null
            ? t('notification.claude_config_updated')
            : t('notification.claude_config_added');
        showNotification(message, 'success');
      }

      closeModal();
    } catch (err: any) {
      showNotification(`${t('notification.update_failed')}: ${err?.message || ''}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const deleteProviderEntry = async (type: 'codex' | 'claude', apiKey: string) => {
    if (!window.confirm(t(`ai_providers.${type}_delete_confirm` as any))) return;
    try {
      if (type === 'codex') {
        await providersApi.deleteCodexConfig(apiKey);
        const next = codexConfigs.filter((item) => item.apiKey !== apiKey);
        setCodexConfigs(next);
        updateConfigValue('codex-api-key', next);
        clearCache('codex-api-key');
        showNotification(t('notification.codex_config_deleted'), 'success');
      } else {
        await providersApi.deleteClaudeConfig(apiKey);
        const next = claudeConfigs.filter((item) => item.apiKey !== apiKey);
        setClaudeConfigs(next);
        updateConfigValue('claude-api-key', next);
        clearCache('claude-api-key');
        showNotification(t('notification.claude_config_deleted'), 'success');
      }
    } catch (err: any) {
      showNotification(`${t('notification.delete_failed')}: ${err?.message || ''}`, 'error');
    }
  };

  const saveOpenai = async () => {
    setSaving(true);
    try {
      const payload: OpenAIProviderConfig = {
        name: openaiForm.name.trim(),
        prefix: openaiForm.prefix?.trim() || undefined,
        baseUrl: openaiForm.baseUrl.trim(),
        headers: buildHeaderObject(openaiForm.headers),
        apiKeyEntries: openaiForm.apiKeyEntries.map((entry) => ({
          apiKey: entry.apiKey.trim(),
          proxyUrl: entry.proxyUrl?.trim() || undefined,
          headers: entry.headers,
        })),
      };
      if (openaiForm.testModel) payload.testModel = openaiForm.testModel.trim();
      const models = entriesToModels(openaiForm.modelEntries);
      if (models.length) payload.models = models;

      const nextList =
        modal?.type === 'openai' && modal.index !== null
          ? openaiProviders.map((item, idx) => (idx === modal.index ? payload : item))
          : [...openaiProviders, payload];

      await providersApi.saveOpenAIProviders(nextList);
      setOpenaiProviders(nextList);
      updateConfigValue('openai-compatibility', nextList);
      clearCache('openai-compatibility');
      const message =
        modal?.index !== null
          ? t('notification.openai_provider_updated')
          : t('notification.openai_provider_added');
      showNotification(message, 'success');
      closeModal();
    } catch (err: any) {
      showNotification(`${t('notification.update_failed')}: ${err?.message || ''}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const deleteOpenai = async (name: string) => {
    if (!window.confirm(t('ai_providers.openai_delete_confirm'))) return;
    try {
      await providersApi.deleteOpenAIProvider(name);
      const next = openaiProviders.filter((item) => item.name !== name);
      setOpenaiProviders(next);
      updateConfigValue('openai-compatibility', next);
      clearCache('openai-compatibility');
      showNotification(t('notification.openai_provider_deleted'), 'success');
    } catch (err: any) {
      showNotification(`${t('notification.delete_failed')}: ${err?.message || ''}`, 'error');
    }
  };

  const renderKeyEntries = (entries: ApiKeyEntry[]) => {
    const list = entries.length ? entries : [buildApiKeyEntry()];
    const updateEntry = (idx: number, field: keyof ApiKeyEntry, value: string) => {
      const next = list.map((entry, i) => (i === idx ? { ...entry, [field]: value } : entry));
      setOpenaiForm((prev) => ({ ...prev, apiKeyEntries: next }));
    };

    const removeEntry = (idx: number) => {
      const next = list.filter((_, i) => i !== idx);
      setOpenaiForm((prev) => ({
        ...prev,
        apiKeyEntries: next.length ? next : [buildApiKeyEntry()],
      }));
    };

    const addEntry = () => {
      setOpenaiForm((prev) => ({ ...prev, apiKeyEntries: [...list, buildApiKeyEntry()] }));
    };

    const importEntries = () => {
      const lines = openaiBulkKeysText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

      if (!lines.length) {
        showNotification(t('notification.openai_multi_input_required'), 'error');
        return;
      }

      const existingEntries = list.filter((entry) => entry.apiKey?.trim() || entry.proxyUrl?.trim());
      const seen = new Set(
        existingEntries.map((entry) => entry.apiKey?.trim()).filter(Boolean) as string[]
      );

      let skipped = 0;
      const appended: ApiKeyEntry[] = [];

      lines.forEach((apiKey) => {
        if (seen.has(apiKey)) {
          skipped += 1;
          return;
        }
        seen.add(apiKey);
        appended.push(buildApiKeyEntry({ apiKey }));
      });

      const next = [...existingEntries, ...appended];
      setOpenaiForm((prev) => ({
        ...prev,
        apiKeyEntries: next.length ? next : [buildApiKeyEntry()],
      }));
      setOpenaiBulkKeysText('');

      showNotification(
        t('notification.openai_multi_summary', {
          success: appended.length,
          skipped,
          failed: 0,
        }),
        appended.length > 0 ? 'success' : 'info'
      );
    };

    return (
      <div className="stack">
        <div className="form-group">
          <label>{t('ai_providers.openai_bulk_input_label')}</label>
          <div className="hint">{t('ai_providers.openai_bulk_input_hint')}</div>
          <textarea
            className="input"
            rows={5}
            value={openaiBulkKeysText}
            placeholder={t('ai_providers.openai_bulk_input_placeholder')}
            onChange={(e) => setOpenaiBulkKeysText(e.target.value)}
            disabled={saving}
          />
          <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="secondary" size="sm" onClick={importEntries} disabled={saving}>
              {t('ai_providers.openai_bulk_add_btn')}
            </Button>
          </div>
        </div>
        {list.map((entry, index) => (
          <div key={index} className="item-row">
            <div className="item-meta">
              <Input
                label={`${t('common.api_key')} #${index + 1}`}
                value={entry.apiKey}
                onChange={(e) => updateEntry(index, 'apiKey', e.target.value)}
              />
              <Input
                label={t('common.proxy_url')}
                value={entry.proxyUrl ?? ''}
                onChange={(e) => updateEntry(index, 'proxyUrl', e.target.value)}
              />
            </div>
            <div className="item-actions">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeEntry(index)}
                disabled={list.length <= 1 || saving}
              >
                {t('common.delete')}
              </Button>
            </div>
          </div>
        ))}
        <Button variant="secondary" size="sm" onClick={addEntry} disabled={saving}>
          {t('ai_providers.openai_keys_add_btn')}
        </Button>
      </div>
    );
  };

  // 预计算所有 apiKey 的状态栏数据（避免每次渲染重复计算）
  const statusBarCache = useMemo(() => {
    const cache = new Map<string, ReturnType<typeof calculateStatusBarData>>();

    // 收集所有需要计算的 apiKey
    const allApiKeys = new Set<string>();
    geminiKeys.forEach((k) => k.apiKey && allApiKeys.add(k.apiKey));
    codexConfigs.forEach((k) => k.apiKey && allApiKeys.add(k.apiKey));
    claudeConfigs.forEach((k) => k.apiKey && allApiKeys.add(k.apiKey));
    openaiProviders.forEach((p) => {
      (p.apiKeyEntries || []).forEach((e) => e.apiKey && allApiKeys.add(e.apiKey));
    });

    // 预计算每个 apiKey 的状态数据
    allApiKeys.forEach((apiKey) => {
      cache.set(apiKey, calculateStatusBarData(usageDetails, apiKey));
    });

    return cache;
  }, [usageDetails, geminiKeys, codexConfigs, claudeConfigs, openaiProviders]);

  // 预计算 OpenAI 提供商的汇总状态栏数据
  const openaiStatusBarCache = useMemo(() => {
    const cache = new Map<string, ReturnType<typeof calculateStatusBarData>>();

    openaiProviders.forEach((provider) => {
      const allKeys = (provider.apiKeyEntries || []).map((e) => e.apiKey).filter(Boolean);
      const filteredDetails = usageDetails.filter((detail) => allKeys.includes(detail.source));
      cache.set(provider.name, calculateStatusBarData(filteredDetails));
    });

    return cache;
  }, [usageDetails, openaiProviders]);

  // 渲染状态监测栏
  const renderStatusBar = (apiKey: string) => {
    const statusData = statusBarCache.get(apiKey) || calculateStatusBarData([], apiKey);
    const hasData = statusData.totalSuccess + statusData.totalFailure > 0;
    const rateClass = !hasData
      ? ''
      : statusData.successRate >= 90
        ? styles.statusRateHigh
        : statusData.successRate >= 50
          ? styles.statusRateMedium
          : styles.statusRateLow;

    return (
      <div className={styles.statusBar}>
        <div className={styles.statusBlocks}>
          {statusData.blocks.map((state, idx) => {
            const blockClass =
              state === 'success'
                ? styles.statusBlockSuccess
                : state === 'failure'
                  ? styles.statusBlockFailure
                  : state === 'mixed'
                    ? styles.statusBlockMixed
                    : styles.statusBlockIdle;
            return <div key={idx} className={`${styles.statusBlock} ${blockClass}`} />;
          })}
        </div>
        <span className={`${styles.statusRate} ${rateClass}`}>
          {hasData ? `${statusData.successRate.toFixed(1)}%` : '--'}
        </span>
      </div>
    );
  };

  // 渲染 OpenAI 提供商的状态栏（汇总多个 apiKey）
  const renderOpenAIStatusBar = (providerName: string) => {
    const statusData = openaiStatusBarCache.get(providerName) || calculateStatusBarData([]);
    const hasData = statusData.totalSuccess + statusData.totalFailure > 0;
    const rateClass = !hasData
      ? ''
      : statusData.successRate >= 90
        ? styles.statusRateHigh
        : statusData.successRate >= 50
          ? styles.statusRateMedium
          : styles.statusRateLow;

    return (
      <div className={styles.statusBar}>
        <div className={styles.statusBlocks}>
          {statusData.blocks.map((state, idx) => {
            const blockClass =
              state === 'success'
                ? styles.statusBlockSuccess
                : state === 'failure'
                  ? styles.statusBlockFailure
                  : state === 'mixed'
                    ? styles.statusBlockMixed
                    : styles.statusBlockIdle;
            return <div key={idx} className={`${styles.statusBlock} ${blockClass}`} />;
          })}
        </div>
        <span className={`${styles.statusRate} ${rateClass}`}>
          {hasData ? `${statusData.successRate.toFixed(1)}%` : '--'}
        </span>
      </div>
    );
  };

  const renderList = <T,>(
    items: T[],
    keyField: (item: T) => string,
    renderContent: (item: T, index: number) => ReactNode,
    onEdit: (index: number) => void,
    onDelete: (item: T) => void,
    addLabel: string,
    emptyTitle: string,
    emptyDescription: string,
    deleteLabel?: string,
    options?: {
      getRowDisabled?: (item: T, index: number) => boolean;
      renderExtraActions?: (item: T, index: number) => ReactNode;
    }
  ) => {
    if (loading) {
      return <div className="hint">{t('common.loading')}</div>;
    }

    if (!items.length) {
      return (
        <EmptyState
          title={emptyTitle}
          description={emptyDescription}
          action={
            <Button onClick={() => onEdit(-1)} disabled={disableControls}>
              {addLabel}
            </Button>
          }
        } catch (err: unknown) {
          const message = getErrorMessage(err);
          showNotification(`${t('notification.delete_failed')}: ${message}`, 'error');
        }
      },
    });
  };

  const deleteVertex = async (index: number) => {
    const entry = vertexConfigs[index];
    if (!entry) return;
    showConfirmation({
      title: t('ai_providers.vertex_delete_title', { defaultValue: 'Delete Vertex Config' }),
      message: t('ai_providers.vertex_delete_confirm'),
      variant: 'danger',
      confirmText: t('common.confirm'),
      onConfirm: async () => {
        try {
          await providersApi.deleteVertexConfig(entry.apiKey);
          const next = vertexConfigs.filter((_, idx) => idx !== index);
          setVertexConfigs(next);
          updateConfigValue('vertex-api-key', next);
          clearCache('vertex-api-key');
          showNotification(t('notification.vertex_config_deleted'), 'success');
        } catch (err: unknown) {
          const message = getErrorMessage(err);
          showNotification(`${t('notification.delete_failed')}: ${message}`, 'error');
        }
      },
    });
  };

  const deleteOpenai = async (index: number) => {
    const entry = openaiProviders[index];
    if (!entry) return;
    showConfirmation({
      title: t('ai_providers.openai_delete_title', { defaultValue: 'Delete OpenAI Provider' }),
      message: t('ai_providers.openai_delete_confirm'),
      variant: 'danger',
      confirmText: t('common.confirm'),
      onConfirm: async () => {
        try {
          await providersApi.deleteOpenAIProvider(entry.name);
          const next = openaiProviders.filter((_, idx) => idx !== index);
          setOpenaiProviders(next);
          updateConfigValue('openai-compatibility', next);
          clearCache('openai-compatibility');
          showNotification(t('notification.openai_provider_deleted'), 'success');
        } catch (err: unknown) {
          const message = getErrorMessage(err);
          showNotification(`${t('notification.delete_failed')}: ${message}`, 'error');
        }
      },
    });
  };

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>{t('ai_providers.title')}</h1>
        <div className={styles.searchBox}>
          <Input
            type="text"
            placeholder={t('ai_providers.search_placeholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>
      <div className={styles.content}>
        {error && <div className="error-box">{error}</div>}

        {normalizedQuery && !hasSearchResults && (
          <div className={styles.searchEmpty}>
            <div className={styles.searchEmptyTitle}>{t('ai_providers.search_empty_title')}</div>
            <div className={styles.searchEmptyDesc}>{t('ai_providers.search_empty_desc')}</div>
          </div>
        )}

        {shouldRenderGeminiSection && (
          <div id="provider-gemini">
            <GeminiSection
              configs={filteredGeminiKeys.map(({ item }) => item)}
              keyStats={keyStats}
              usageDetails={usageDetails}
              loading={loading}
              disableControls={disableControls}
              isSwitching={isSwitching}
              onAdd={() => openEditor('/ai-providers/gemini/new')}
              onEdit={(index) =>
                openEditor(
                  `/ai-providers/gemini/${filteredGeminiKeys[index]?.originalIndex ?? index}`
                )
              }
              onDelete={(index) => deleteGemini(filteredGeminiKeys[index]?.originalIndex ?? index)}
              onToggle={(index, enabled) =>
                void setConfigEnabled(
                  'gemini',
                  filteredGeminiKeys[index]?.originalIndex ?? index,
                  enabled
                )
              }
            />
          </div>
        )}

        {shouldRenderCodexSection && (
          <div id="provider-codex">
            <CodexSection
              configs={filteredCodexConfigs.map(({ item }) => item)}
              keyStats={keyStats}
              usageDetails={usageDetails}
              loading={loading}
              disableControls={disableControls}
              isSwitching={isSwitching}
              onAdd={() => openEditor('/ai-providers/codex/new')}
              onEdit={(index) =>
                openEditor(
                  `/ai-providers/codex/${filteredCodexConfigs[index]?.originalIndex ?? index}`
                )
              }
              onDelete={(index) =>
                void deleteProviderEntry(
                  'codex',
                  filteredCodexConfigs[index]?.originalIndex ?? index
                )
              }
              onToggle={(index, enabled) =>
                void setConfigEnabled(
                  'codex',
                  filteredCodexConfigs[index]?.originalIndex ?? index,
                  enabled
                )
              }
            />
          </div>
        )}

        {shouldRenderClaudeSection && (
          <div id="provider-claude">
            <ClaudeSection
              configs={filteredClaudeConfigs.map(({ item }) => item)}
              keyStats={keyStats}
              usageDetails={usageDetails}
              loading={loading}
              disableControls={disableControls}
              isSwitching={isSwitching}
              onAdd={() => openEditor('/ai-providers/claude/new')}
              onEdit={(index) =>
                openEditor(
                  `/ai-providers/claude/${filteredClaudeConfigs[index]?.originalIndex ?? index}`
                )
              }
              onDelete={(index) =>
                void deleteProviderEntry(
                  'claude',
                  filteredClaudeConfigs[index]?.originalIndex ?? index
                )
              }
              onToggle={(index, enabled) =>
                void setConfigEnabled(
                  'claude',
                  filteredClaudeConfigs[index]?.originalIndex ?? index,
                  enabled
                )
              }
            />
          </div>
        )}

        {shouldRenderVertexSection && (
          <div id="provider-vertex">
            <VertexSection
              configs={filteredVertexConfigs.map(({ item }) => item)}
              keyStats={keyStats}
              usageDetails={usageDetails}
              loading={loading}
              disableControls={disableControls}
              isSwitching={isSwitching}
              onAdd={() => openEditor('/ai-providers/vertex/new')}
              onEdit={(index) =>
                openEditor(
                  `/ai-providers/vertex/${filteredVertexConfigs[index]?.originalIndex ?? index}`
                )
              }
              onDelete={(index) =>
                deleteVertex(filteredVertexConfigs[index]?.originalIndex ?? index)
              }
              onToggle={(index, enabled) =>
                void setConfigEnabled(
                  'vertex',
                  filteredVertexConfigs[index]?.originalIndex ?? index,
                  enabled
                )
              }
            />
          </div>
        )}

        {showAmpcode && (
          <div id="provider-ampcode">
            <AmpcodeSection
              config={config?.ampcode}
              loading={loading}
              disableControls={disableControls}
              isSwitching={isSwitching}
              onEdit={() => openEditor('/ai-providers/ampcode')}
            />
          </div>
        )}

        {shouldRenderOpenaiSection && (
          <div id="provider-openai">
            <OpenAISection
              configs={filteredOpenaiProviders.map(({ item }) => item)}
              keyStats={keyStats}
              usageDetails={usageDetails}
              loading={loading}
              disableControls={disableControls}
              isSwitching={isSwitching}
              resolvedTheme={resolvedTheme}
              onAdd={() => openEditor('/ai-providers/openai/new')}
              onEdit={(index) =>
                openEditor(
                  `/ai-providers/openai/${filteredOpenaiProviders[index]?.originalIndex ?? index}`
                )
              }
              onDelete={(index) =>
                deleteOpenai(filteredOpenaiProviders[index]?.originalIndex ?? index)
              }
            />
          </div>
        )}
      </div>

      <ProviderNav />
    </div>
  );
}
