import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { authFilesApi, codexAuthApi } from '@/services/api';
import { useAuthStore, useNotificationStore } from '@/stores';
import type {
  CodexAuthConfig,
  CodexAuthConfigPayload,
  CodexAuthDetail,
  CodexAuthEvent,
  CodexAuthSnapshot,
  CodexPayloadFilterRule,
  CodexPayloadRule,
  CodexUsageRollup,
} from '@/types';
import styles from './CodexAuthPage.module.scss';

type TabKey = 'accounts' | 'usage' | 'events' | 'config';
type RuleValueType = 'string' | 'number' | 'boolean' | 'json';

type EditableParam = {
  id: string;
  path: string;
  type: RuleValueType;
  value: string;
};

type EditableRule = {
  id: string;
  modelsText: string;
  params: EditableParam[];
};

type EditableFilterRule = {
  id: string;
  modelsText: string;
  filtersText: string;
};

type ConfigEditorState = {
  userAgent: string;
  betaFeatures: string;
  defaultRules: EditableRule[];
  defaultRawRules: EditableRule[];
  overrideRules: EditableRule[];
  overrideRawRules: EditableRule[];
  filterRules: EditableFilterRule[];
  notes: Record<string, unknown>;
};

type DetailState = {
  open: boolean;
  authIndex: string;
  loading: boolean;
  snapshot: CodexAuthSnapshot | null;
  events: CodexAuthEvent[];
};

type SortDirection = 'asc' | 'desc';

type SortState<K extends string> = {
  key: K | null;
  direction: SortDirection;
};

type AccountsSortKey =
  | 'auth_index'
  | 'account'
  | 'file_name'
  | 'status'
  | 'quota'
  | 'recover'
  | 'requests'
  | 'avg_total';

type UsageSortKey =
  | 'auth_index'
  | 'account'
  | 'requests'
  | 'input_tokens'
  | 'output_tokens'
  | 'cached_tokens'
  | 'total_tokens'
  | 'recovered_tokens';

type EventsSortKey =
  | 'created_at'
  | 'auth_index'
  | 'event_type'
  | 'reason'
  | 'requests'
  | 'total_tokens'
  | 'recover';

let localIdSeed = 0;

const PAGE_SIZE_OPTIONS = ['10', '20', '50'];
const RULE_VALUE_OPTIONS = [
  { value: 'string', label: 'string' },
  { value: 'number', label: 'number' },
  { value: 'boolean', label: 'boolean' },
  { value: 'json', label: 'json' },
] as const;

const nextLocalId = (prefix: string) => {
  localIdSeed += 1;
  return `${prefix}-${localIdSeed}`;
};

const createEditableParam = (path = '', type: RuleValueType = 'string', value = ''): EditableParam => ({
  id: nextLocalId('param'),
  path,
  type,
  value,
});

const createEditableRule = (): EditableRule => ({
  id: nextLocalId('rule'),
  modelsText: '',
  params: [createEditableParam()],
});

const createEditableFilterRule = (): EditableFilterRule => ({
  id: nextLocalId('filter'),
  modelsText: '',
  filtersText: '',
});

const createEmptyConfigEditor = (): ConfigEditorState => ({
  userAgent: '',
  betaFeatures: '',
  defaultRules: [],
  defaultRawRules: [],
  overrideRules: [],
  overrideRawRules: [],
  filterRules: [],
  notes: {},
});

const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
};

const formatNumber = (value?: number | null) => {
  if (typeof value !== 'number' || Number.isNaN(value)) return '0';
  return value.toLocaleString();
};

const formatAverage = (value?: number | null) => {
  if (typeof value !== 'number' || Number.isNaN(value)) return '-';
  return value.toLocaleString(undefined, {
    minimumFractionDigits: value >= 100 ? 0 : 2,
    maximumFractionDigits: value >= 100 ? 0 : 2,
  });
};

const normalizeText = (value: unknown) => String(value ?? '').trim().toLowerCase();

const paginate = <T,>(items: T[], page: number, pageSize: number) => {
  const safePage = Math.max(1, page);
  const start = (safePage - 1) * pageSize;
  return items.slice(start, start + pageSize);
};

const uniqueStrings = (values: Array<string | null | undefined>) =>
  Array.from(
    new Set(
      values
        .map((value) => String(value ?? '').trim())
        .filter(Boolean)
    )
  );

const compareText = (left: unknown, right: unknown) =>
  String(left ?? '').trim().localeCompare(String(right ?? '').trim(), undefined, {
    numeric: true,
    sensitivity: 'base',
  });

const compareNumber = (left: unknown, right: unknown) => {
  const leftNumber = typeof left === 'number' ? left : Number(left ?? 0);
  const rightNumber = typeof right === 'number' ? right : Number(right ?? 0);
  return leftNumber - rightNumber;
};

const compareDate = (left: unknown, right: unknown) => {
  const leftTime = left ? new Date(String(left)).getTime() : 0;
  const rightTime = right ? new Date(String(right)).getTime() : 0;
  return leftTime - rightTime;
};

const applySortDirection = (comparison: number, direction: SortDirection) =>
  direction === 'asc' ? comparison : -comparison;

const nextSortState = <K extends string>(current: SortState<K>, key: K): SortState<K> =>
  current.key === key
    ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
    : { key, direction: 'asc' };

const getAriaSort = (
  active: boolean,
  direction: SortDirection
): 'none' | 'ascending' | 'descending' => {
  if (!active) return 'none';
  return direction === 'asc' ? 'ascending' : 'descending';
};

type SortButtonProps = {
  label: string;
  active: boolean;
  direction: SortDirection;
  onClick: () => void;
};

function SortButton({ label, active, direction, onClick }: SortButtonProps) {
  return (
    <button type="button" className={styles.sortButton} onClick={onClick}>
      <span>{label}</span>
      <span className={styles.sortIndicator}>{active ? (direction === 'asc' ? '▲' : '▼') : '↕'}</span>
    </button>
  );
}

const detectRuleValueType = (value: unknown): RuleValueType => {
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'string') return 'string';
  return 'json';
};

const stringifyRuleValue = (value: unknown, type: RuleValueType) => {
  if (type === 'json') return JSON.stringify(value ?? null, null, 2);
  if (type === 'boolean') return value ? 'true' : 'false';
  return value === undefined || value === null ? '' : String(value);
};

const modelsToText = (models: Array<{ name?: string }> | undefined) =>
  Array.isArray(models)
    ? models
        .map((item) => String(item?.name ?? '').trim())
        .filter(Boolean)
        .join(', ')
    : '';

const buildRuleParamsEditor = (params: Record<string, unknown> | undefined) => {
  const entries = Object.entries(params ?? {});
  if (entries.length === 0) return [createEditableParam()];
  return entries.map(([path, value]) => {
    const type = detectRuleValueType(value);
    return createEditableParam(path, type, stringifyRuleValue(value, type));
  });
};

const buildEditableRules = (rules: CodexPayloadRule[] | undefined): EditableRule[] =>
  Array.isArray(rules)
    ? rules.map((rule) => ({
        id: nextLocalId('rule'),
        modelsText: modelsToText(rule.models),
        params: buildRuleParamsEditor(rule.params),
      }))
    : [];

const buildEditableFilterRules = (rules: CodexPayloadFilterRule[] | undefined): EditableFilterRule[] =>
  Array.isArray(rules)
    ? rules.map((rule) => ({
        id: nextLocalId('filter'),
        modelsText: modelsToText(rule.models),
        filtersText: Array.isArray(rule.params) ? rule.params.join('\n') : '',
      }))
    : [];

const buildConfigEditor = (config: CodexAuthConfig): ConfigEditorState => ({
  userAgent: config.codex_header_defaults?.user_agent ?? '',
  betaFeatures: config.codex_header_defaults?.beta_features ?? '',
  defaultRules: buildEditableRules(config.payload?.default),
  defaultRawRules: buildEditableRules(config.payload?.default_raw),
  overrideRules: buildEditableRules(config.payload?.override),
  overrideRawRules: buildEditableRules(config.payload?.override_raw),
  filterRules: buildEditableFilterRules(config.payload?.filter),
  notes: config.notes ?? {},
});

const parseModelsText = (text: string) =>
  text
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((name) => ({ name, protocol: 'codex' as const }));

const parseRuleValue = (type: RuleValueType, rawValue: string, fieldPath: string) => {
  if (type === 'string') return rawValue;
  if (type === 'number') {
    const value = Number(rawValue);
    if (!Number.isFinite(value)) {
      throw new Error(`${fieldPath} must be a valid number`);
    }
    return value;
  }
  if (type === 'boolean') {
    const normalized = rawValue.trim().toLowerCase();
    if (normalized !== 'true' && normalized !== 'false') {
      throw new Error(`${fieldPath} must be true or false`);
    }
    return normalized === 'true';
  }
  try {
    return JSON.parse(rawValue);
  } catch (error) {
    throw new Error(
      `${fieldPath} must be valid JSON${error instanceof Error && error.message ? `: ${error.message}` : ''}`
    );
  }
};

const buildPayloadRules = (rules: EditableRule[], sectionKey: string): CodexPayloadRule[] =>
  rules.map((rule, ruleIndex) => {
    const models = parseModelsText(rule.modelsText);
    if (models.length === 0) {
      throw new Error(`${sectionKey}[${ruleIndex + 1}] requires at least one model name`);
    }

    const params = rule.params.reduce<Record<string, unknown>>((result, param, paramIndex) => {
      const path = param.path.trim();
      if (!path) return result;
      const fieldPath = `${sectionKey}[${ruleIndex + 1}].params[${paramIndex + 1}]`;
      const value = parseRuleValue(param.type, param.value.trim(), fieldPath);
      result[path] = value;
      return result;
    }, {});

    return { models, params };
  });

const buildFilterRules = (rules: EditableFilterRule[], sectionKey: string): CodexPayloadFilterRule[] =>
  rules.map((rule, ruleIndex) => {
    const models = parseModelsText(rule.modelsText);
    if (models.length === 0) {
      throw new Error(`${sectionKey}[${ruleIndex + 1}] requires at least one model name`);
    }
    const params = rule.filtersText
      .split(/\r?\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);
    return { models, params };
  });

const getStatusTone = (item: CodexAuthSnapshot) => {
  if (item.quota_exceeded || item.unavailable) return styles.statusError;
  if (item.disabled) return styles.statusMuted;
  const status = normalizeText(item.status);
  if (status === 'ready' || status === 'ok' || status === 'active') return styles.statusSuccess;
  return styles.statusWarning;
};

const getStatusText = (item: CodexAuthSnapshot) => {
  if (item.quota_exceeded) return 'quota_exceeded';
  if (item.disabled) return 'disabled';
  if (item.unavailable) return 'unavailable';
  return item.status || 'unknown';
};

const collectSearchableText = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value).toLowerCase();
  }
  if (Array.isArray(value)) return value.map((item) => collectSearchableText(item)).join(' ');
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>)
      .map((item) => collectSearchableText(item))
      .join(' ');
  }
  return '';
};

interface PaginationProps {
  page: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

function PaginationBar({ page, total, pageSize, onPageChange }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className={styles.pagination}>
      <span className={styles.paginationMeta}>
        {total === 0 ? '0 / 0' : `${page} / ${totalPages}`}
      </span>
      <div className={styles.paginationActions}>
        <Button size="sm" variant="secondary" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
          Prev
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

interface RuleGroupProps {
  title: string;
  description: string;
  rules: EditableRule[];
  onAddRule: () => void;
  onRemoveRule: (ruleId: string) => void;
  onModelsChange: (ruleId: string, value: string) => void;
  onAddParam: (ruleId: string) => void;
  onRemoveParam: (ruleId: string, paramId: string) => void;
  onParamChange: (ruleId: string, paramId: string, key: 'path' | 'type' | 'value', value: string) => void;
}

function PayloadRuleGroup({
  title,
  description,
  rules,
  onAddRule,
  onRemoveRule,
  onModelsChange,
  onAddParam,
  onRemoveParam,
  onParamChange,
}: RuleGroupProps) {
  return (
    <Card
      title={title}
      subtitle={description}
      extra={
        <Button size="sm" variant="secondary" onClick={onAddRule}>
          Add rule
        </Button>
      }
    >
      <div className={styles.ruleList}>
        {rules.length === 0 ? (
          <EmptyState title="No rules yet" description="Add a visual rule instead of editing JSON directly." />
        ) : (
          rules.map((rule, index) => (
            <div key={rule.id} className={styles.ruleCard}>
              <div className={styles.ruleHeader}>
                <strong>{`Rule ${index + 1}`}</strong>
                <Button size="sm" variant="ghost" onClick={() => onRemoveRule(rule.id)}>
                  Remove
                </Button>
              </div>
              <Input
                label="Models"
                value={rule.modelsText}
                onChange={(event) => onModelsChange(rule.id, event.target.value)}
                placeholder="gpt-5-codex, codex-mini-latest"
                hint="Separate multiple models with commas or new lines."
              />
              <div className={styles.paramSection}>
                <div className={styles.paramSectionHeader}>
                  <span>Params</span>
                  <Button size="sm" variant="secondary" onClick={() => onAddParam(rule.id)}>
                    Add param
                  </Button>
                </div>
                <div className={styles.paramList}>
                  {rule.params.map((param) => (
                    <div key={param.id} className={styles.paramRow}>
                      <Input
                        label="Path"
                        value={param.path}
                        onChange={(event) => onParamChange(rule.id, param.id, 'path', event.target.value)}
                        placeholder="instructions"
                      />
                      <div className={styles.typeField}>
                        <label className={styles.fieldLabel}>Type</label>
                        <Select
                          value={param.type}
                          options={RULE_VALUE_OPTIONS.map((option) => ({
                            value: option.value,
                            label: option.label,
                          }))}
                          onChange={(value) => onParamChange(rule.id, param.id, 'type', value)}
                        />
                      </div>
                      <div className={styles.valueField}>
                        <label className={styles.fieldLabel}>Value</label>
                        <textarea
                          value={param.value}
                          onChange={(event) => onParamChange(rule.id, param.id, 'value', event.target.value)}
                          rows={param.type === 'json' ? 4 : 2}
                          placeholder={param.type === 'json' ? '{"key":"value"}' : 'Value'}
                        />
                      </div>
                      <div className={styles.paramActions}>
                        <Button size="sm" variant="ghost" onClick={() => onRemoveParam(rule.id, param.id)}>
                          Remove
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

interface FilterRuleGroupProps {
  rules: EditableFilterRule[];
  onAddRule: () => void;
  onRemoveRule: (ruleId: string) => void;
  onChange: (ruleId: string, key: 'modelsText' | 'filtersText', value: string) => void;
}

function FilterRuleGroup({ rules, onAddRule, onRemoveRule, onChange }: FilterRuleGroupProps) {
  return (
    <Card
      title="Payload Filter"
      subtitle="Remove or trim fields by model through a visible rule list."
      extra={
        <Button size="sm" variant="secondary" onClick={onAddRule}>
          Add rule
        </Button>
      }
    >
      <div className={styles.ruleList}>
        {rules.length === 0 ? (
          <EmptyState title="No filter rules yet" description="Use filter rules to remove specific params by model." />
        ) : (
          rules.map((rule, index) => (
            <div key={rule.id} className={styles.ruleCard}>
              <div className={styles.ruleHeader}>
                <strong>{`Filter ${index + 1}`}</strong>
                <Button size="sm" variant="ghost" onClick={() => onRemoveRule(rule.id)}>
                  Remove
                </Button>
              </div>
              <Input
                label="Models"
                value={rule.modelsText}
                onChange={(event) => onChange(rule.id, 'modelsText', event.target.value)}
                placeholder="gpt-5-codex, codex-mini-latest"
              />
              <label className={styles.fieldLabel}>Filtered param paths</label>
              <textarea
                value={rule.filtersText}
                onChange={(event) => onChange(rule.id, 'filtersText', event.target.value)}
                rows={4}
                placeholder="store\nverbosity"
              />
              <div className="hint">Separate multiple paths with commas or new lines.</div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

export function CodexAuthPage() {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const connectionStatus = useAuthStore((state) => state.connectionStatus);

  const [activeTab, setActiveTab] = useState<TabKey>('accounts');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pageError, setPageError] = useState('');
  const [savingConfig, setSavingConfig] = useState(false);
  const [accounts, setAccounts] = useState<CodexAuthSnapshot[]>([]);
  const [usage, setUsage] = useState<CodexUsageRollup[]>([]);
  const [events, setEvents] = useState<CodexAuthEvent[]>([]);
  const [configEditor, setConfigEditor] = useState<ConfigEditorState>(createEmptyConfigEditor);
  const [accountsSearch, setAccountsSearch] = useState('');
  const [accountsStatus, setAccountsStatus] = useState('all');
  const [accountsPage, setAccountsPage] = useState(1);
  const [accountsPageSize, setAccountsPageSize] = useState(10);
  const [accountsSort, setAccountsSort] = useState<SortState<AccountsSortKey>>({
    key: null,
    direction: 'asc',
  });
  const [usageSearch, setUsageSearch] = useState('');
  const [usagePage, setUsagePage] = useState(1);
  const [usagePageSize, setUsagePageSize] = useState(10);
  const [usageSort, setUsageSort] = useState<SortState<UsageSortKey>>({
    key: null,
    direction: 'asc',
  });
  const [eventsSearch, setEventsSearch] = useState('');
  const [eventsAuthIndex, setEventsAuthIndex] = useState('all');
  const [eventsPage, setEventsPage] = useState(1);
  const [eventsPageSize, setEventsPageSize] = useState(10);
  const [eventsSort, setEventsSort] = useState<SortState<EventsSortKey>>({
    key: null,
    direction: 'asc',
  });
  const [selectedAccountFiles, setSelectedAccountFiles] = useState<Set<string>>(() => new Set());
  const [batchProxyOpen, setBatchProxyOpen] = useState(false);
  const [batchProxyMode, setBatchProxyMode] = useState<'set' | 'clear'>('set');
  const [batchProxyValue, setBatchProxyValue] = useState('');
  const [batchProxySaving, setBatchProxySaving] = useState(false);
  const [detail, setDetail] = useState<DetailState>({
    open: false,
    authIndex: '',
    loading: false,
    snapshot: null,
    events: [],
  });

  const disableControls = connectionStatus !== 'connected';

  const loadConfig = useCallback(async () => {
    const config = await codexAuthApi.getConfig();
    setConfigEditor(buildConfigEditor(config));
  }, []);

  const loadAccounts = useCallback(async () => {
    const response = await codexAuthApi.getQuota();
    setAccounts(response);
  }, []);

  const loadUsage = useCallback(async () => {
    const response = await codexAuthApi.getUsage();
    setUsage(response);
  }, []);

  const loadEvents = useCallback(async (authIndex: string) => {
    const response = await codexAuthApi.getEvents({
      authIndex: authIndex !== 'all' ? authIndex : undefined,
      limit: 500,
    });
    setEvents(response);
  }, []);

  const refreshAll = useCallback(
    async (silent = false) => {
      if (!silent) setRefreshing(true);
      setPageError('');
      try {
        await Promise.all([loadConfig(), loadAccounts(), loadUsage(), loadEvents(eventsAuthIndex)]);
      } catch (error) {
        const message = error instanceof Error ? error.message : t('notification.refresh_failed');
        setPageError(message);
        showNotification(message, 'error');
      } finally {
        setLoading(false);
        if (!silent) setRefreshing(false);
      }
    },
    [eventsAuthIndex, loadAccounts, loadConfig, loadEvents, loadUsage, showNotification, t]
  );

  useEffect(() => {
    void refreshAll(true);
  }, [refreshAll]);

  useEffect(() => {
    if (loading) return;
    void loadEvents(eventsAuthIndex).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : t('notification.refresh_failed');
      showNotification(message, 'error');
    });
  }, [eventsAuthIndex, loadEvents, loading, showNotification, t]);

  useEffect(() => {
    setAccountsPage(1);
  }, [accountsPageSize, accountsSearch, accountsStatus, accountsSort]);

  useEffect(() => {
    setUsagePage(1);
  }, [usagePageSize, usageSearch, usageSort]);

  useEffect(() => {
    setEventsPage(1);
  }, [eventsAuthIndex, eventsPageSize, eventsSearch, eventsSort]);

  const summary = useMemo(() => {
    const totalRequests = usage.reduce((sum, item) => sum + (item.request_count ?? 0), 0);
    return {
      totalAccounts: accounts.length,
      disabledAccounts: accounts.filter((item) => item.disabled).length,
      quotaExceededAccounts: accounts.filter((item) => item.quota_exceeded).length,
      totalRequests,
    };
  }, [accounts, usage]);

  const statusOptions = useMemo(() => {
    const values = new Set<string>();
    accounts.forEach((item) => {
      values.add(getStatusText(item));
    });
    return [
      { value: 'all', label: t('codex_management.status_all') },
      ...Array.from(values).map((value) => ({ value, label: value })),
    ];
  }, [accounts, t]);

  const authIndexOptions = useMemo(() => {
    const values = new Set<string>();
    accounts.forEach((item) => {
      if (item.auth_index) values.add(String(item.auth_index));
    });
    usage.forEach((item) => {
      if (item.auth_index) values.add(String(item.auth_index));
    });
    return [
      { value: 'all', label: t('codex_management.all_accounts') },
      ...Array.from(values).map((value) => ({ value, label: value })),
    ];
  }, [accounts, t, usage]);

  const filteredAccounts = useMemo(() => {
    const keyword = accountsSearch.trim().toLowerCase();
    return accounts.filter((item) => {
      if (accountsStatus !== 'all' && getStatusText(item) !== accountsStatus) return false;
      if (!keyword) return true;
      return collectSearchableText(item).includes(keyword);
    });
  }, [accounts, accountsSearch, accountsStatus]);

  const filteredUsage = useMemo(() => {
    const keyword = usageSearch.trim().toLowerCase();
    if (!keyword) return usage;
    return usage.filter((item) => collectSearchableText(item).includes(keyword));
  }, [usage, usageSearch]);

  const filteredEvents = useMemo(() => {
    const keyword = eventsSearch.trim().toLowerCase();
    if (!keyword) return events;
    return events.filter((item) => collectSearchableText(item).includes(keyword));
  }, [events, eventsSearch]);

  const sortedAccounts = useMemo(() => {
    const list = [...filteredAccounts];
    if (!accountsSort.key) return list;
    list.sort((left, right) => {
      switch (accountsSort.key) {
        case 'auth_index':
          return applySortDirection(compareText(left.auth_index, right.auth_index), accountsSort.direction);
        case 'account':
          return applySortDirection(
            compareText(left.account || left.label, right.account || right.label),
            accountsSort.direction
          );
        case 'file_name':
          return applySortDirection(compareText(left.file_name, right.file_name), accountsSort.direction);
        case 'status':
          return applySortDirection(compareText(getStatusText(left), getStatusText(right)), accountsSort.direction);
        case 'quota':
          return applySortDirection(
            compareText(left.quota_reason || left.quota_model, right.quota_reason || right.quota_model),
            accountsSort.direction
          );
        case 'recover':
          return applySortDirection(
            compareDate(
              left.next_recover_at || left.next_retry_after || left.next_refresh_after,
              right.next_recover_at || right.next_retry_after || right.next_refresh_after
            ),
            accountsSort.direction
          );
        case 'requests':
          return applySortDirection(
            compareNumber(left.usage?.request_count, right.usage?.request_count),
            accountsSort.direction
          );
        case 'avg_total':
          return applySortDirection(
            compareNumber(left.usage?.avg_total_tokens, right.usage?.avg_total_tokens),
            accountsSort.direction
          );
        default:
          return 0;
      }
    });
    return list;
  }, [accountsSort, filteredAccounts]);

  const sortedUsage = useMemo(() => {
    const list = [...filteredUsage];
    if (!usageSort.key) return list;
    list.sort((left, right) => {
      switch (usageSort.key) {
        case 'auth_index':
          return applySortDirection(compareText(left.auth_index, right.auth_index), usageSort.direction);
        case 'account':
          return applySortDirection(compareText(left.account, right.account), usageSort.direction);
        case 'requests':
          return applySortDirection(compareNumber(left.request_count, right.request_count), usageSort.direction);
        case 'input_tokens':
          return applySortDirection(compareNumber(left.input_tokens, right.input_tokens), usageSort.direction);
        case 'output_tokens':
          return applySortDirection(compareNumber(left.output_tokens, right.output_tokens), usageSort.direction);
        case 'cached_tokens':
          return applySortDirection(compareNumber(left.cached_tokens, right.cached_tokens), usageSort.direction);
        case 'total_tokens':
          return applySortDirection(compareNumber(left.total_tokens, right.total_tokens), usageSort.direction);
        case 'recovered_tokens':
          return applySortDirection(
            compareNumber(left.recovered_tokens, right.recovered_tokens),
            usageSort.direction
          );
        default:
          return 0;
      }
    });
    return list;
  }, [filteredUsage, usageSort]);

  const sortedEvents = useMemo(() => {
    const list = [...filteredEvents];
    if (!eventsSort.key) return list;
    list.sort((left, right) => {
      switch (eventsSort.key) {
        case 'created_at':
          return applySortDirection(compareDate(left.created_at, right.created_at), eventsSort.direction);
        case 'auth_index':
          return applySortDirection(compareText(left.auth_index, right.auth_index), eventsSort.direction);
        case 'event_type':
          return applySortDirection(compareText(left.event_type, right.event_type), eventsSort.direction);
        case 'reason':
          return applySortDirection(
            compareText(left.reason || left.status_message, right.reason || right.status_message),
            eventsSort.direction
          );
        case 'requests':
          return applySortDirection(compareNumber(left.request_count, right.request_count), eventsSort.direction);
        case 'total_tokens':
          return applySortDirection(compareNumber(left.total_tokens, right.total_tokens), eventsSort.direction);
        case 'recover':
          return applySortDirection(compareDate(left.recover_at, right.recover_at), eventsSort.direction);
        default:
          return 0;
      }
    });
    return list;
  }, [eventsSort, filteredEvents]);

  const filteredAccountFileNames = useMemo(
    () => uniqueStrings(sortedAccounts.map((item) => item.file_name)),
    [sortedAccounts]
  );

  const selectedAccountFileNames = useMemo(
    () => Array.from(selectedAccountFiles).sort((left, right) => left.localeCompare(right)),
    [selectedAccountFiles]
  );

  const pagedAccounts = useMemo(
    () => paginate(sortedAccounts, accountsPage, accountsPageSize),
    [accountsPage, accountsPageSize, sortedAccounts]
  );
  const pagedUsage = useMemo(
    () => paginate(sortedUsage, usagePage, usagePageSize),
    [sortedUsage, usagePage, usagePageSize]
  );
  const pagedEvents = useMemo(
    () => paginate(sortedEvents, eventsPage, eventsPageSize),
    [eventsPage, eventsPageSize, sortedEvents]
  );

  const pagedAccountFileNames = useMemo(
    () => uniqueStrings(pagedAccounts.map((item) => item.file_name)),
    [pagedAccounts]
  );

  const allPagedAccountFilesSelected =
    pagedAccountFileNames.length > 0 &&
    pagedAccountFileNames.every((name) => selectedAccountFiles.has(name));
  const somePagedAccountFilesSelected = pagedAccountFileNames.some((name) => selectedAccountFiles.has(name));

  useEffect(() => {
    const available = new Set(uniqueStrings(accounts.map((item) => item.file_name)));
    setSelectedAccountFiles((current) => {
      let changed = false;
      const next = new Set<string>();
      current.forEach((name) => {
        if (available.has(name)) {
          next.add(name);
        } else {
          changed = true;
        }
      });
      return changed ? next : current;
    });
  }, [accounts]);

  const toggleAccountFileSelection = useCallback((fileName: string) => {
    const normalized = String(fileName ?? '').trim();
    if (!normalized) return;
    setSelectedAccountFiles((current) => {
      const next = new Set(current);
      if (next.has(normalized)) {
        next.delete(normalized);
      } else {
        next.add(normalized);
      }
      return next;
    });
  }, []);

  const selectFilteredAccountFiles = useCallback(() => {
    setSelectedAccountFiles(new Set(filteredAccountFileNames));
  }, [filteredAccountFileNames]);

  const clearSelectedAccountFiles = useCallback(() => {
    setSelectedAccountFiles(new Set());
  }, []);

  const togglePagedAccountFiles = useCallback(() => {
    setSelectedAccountFiles((current) => {
      const next = new Set(current);
      if (allPagedAccountFilesSelected) {
        pagedAccountFileNames.forEach((name) => next.delete(name));
      } else {
        pagedAccountFileNames.forEach((name) => next.add(name));
      }
      return next;
    });
  }, [allPagedAccountFilesSelected, pagedAccountFileNames]);

  const openBatchProxyModal = useCallback(() => {
    if (selectedAccountFileNames.length === 0) {
      showNotification(t('codex_management.accounts.batch_proxy_no_files'), 'warning');
      return;
    }
    setBatchProxyOpen(true);
  }, [selectedAccountFileNames.length, showNotification, t]);

  const handleBatchProxySubmit = useCallback(async () => {
    if (selectedAccountFileNames.length === 0) {
      showNotification(t('codex_management.accounts.batch_proxy_no_files'), 'warning');
      return;
    }
    if (batchProxyMode === 'set' && !batchProxyValue.trim()) {
      showNotification(t('codex_management.accounts.batch_proxy_missing_proxy'), 'error');
      return;
    }

    setBatchProxySaving(true);
    try {
      const response = await authFilesApi.patchProxyURLBatch({
        names: selectedAccountFileNames,
        proxyUrl: batchProxyMode === 'clear' ? '' : batchProxyValue.trim(),
      });
      showNotification(
        t('codex_management.accounts.batch_proxy_success', {
          updated: response.summary.updated,
          unchanged: response.summary.unchanged,
          failed: response.summary.failed,
          skipped: response.summary.skipped,
        }),
        response.summary.failed > 0 ? 'warning' : 'success'
      );
      setBatchProxyOpen(false);
      setBatchProxyValue('');
      setBatchProxyMode('set');
      clearSelectedAccountFiles();
      await refreshAll(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : t('notification.save_failed');
      showNotification(message, 'error');
    } finally {
      setBatchProxySaving(false);
    }
  }, [
    batchProxyMode,
    batchProxyValue,
    clearSelectedAccountFiles,
    refreshAll,
    selectedAccountFileNames,
    showNotification,
    t,
  ]);

  const openDetail = useCallback(
    async (authIndex: string) => {
      setDetail({
        open: true,
        authIndex,
        loading: true,
        snapshot: null,
        events: [],
      });
      try {
        const response: CodexAuthDetail = await codexAuthApi.getQuotaDetail(authIndex);
        setDetail({
          open: true,
          authIndex,
          loading: false,
          snapshot: response.snapshot ?? null,
          events: Array.isArray(response.events) ? response.events : [],
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : t('notification.refresh_failed');
        setDetail((current) => ({ ...current, loading: false }));
        showNotification(message, 'error');
      }
    },
    [showNotification, t]
  );

  const updateRuleCollection = useCallback(
    (
      key: 'defaultRules' | 'defaultRawRules' | 'overrideRules' | 'overrideRawRules',
      updater: (rules: EditableRule[]) => EditableRule[]
    ) => {
      setConfigEditor((current) => ({ ...current, [key]: updater(current[key]) }));
    },
    []
  );

  const updateFilterCollection = useCallback((updater: (rules: EditableFilterRule[]) => EditableFilterRule[]) => {
    setConfigEditor((current) => ({ ...current, filterRules: updater(current.filterRules) }));
  }, []);

  const handleConfigSave = async () => {
    setSavingConfig(true);
    try {
      const payload: CodexAuthConfigPayload = {
        codex_header_defaults: {
          user_agent: configEditor.userAgent.trim(),
          beta_features: configEditor.betaFeatures.trim(),
        },
        payload: {
          default: buildPayloadRules(configEditor.defaultRules, 'payload.default'),
          default_raw: buildPayloadRules(configEditor.defaultRawRules, 'payload.default_raw'),
          override: buildPayloadRules(configEditor.overrideRules, 'payload.override'),
          override_raw: buildPayloadRules(configEditor.overrideRawRules, 'payload.override_raw'),
          filter: buildFilterRules(configEditor.filterRules, 'payload.filter'),
        },
      };
      await codexAuthApi.updateConfig(payload);
      showNotification(t('codex_management.config_saved'), 'success');
      await loadConfig();
    } catch (error) {
      const message = error instanceof Error ? error.message : t('notification.save_failed');
      showNotification(message, 'error');
    } finally {
      setSavingConfig(false);
    }
  };

  const tabs = [
    { key: 'accounts' as const, label: t('codex_management.tabs.accounts') },
    { key: 'usage' as const, label: t('codex_management.tabs.usage') },
    { key: 'events' as const, label: t('codex_management.tabs.events') },
    { key: 'config' as const, label: t('codex_management.tabs.config') },
  ];

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>{t('codex_management.title')}</h1>
          <p className={styles.pageDescription}>{t('codex_management.description')}</p>
        </div>
        <div className={styles.pageActions}>
          <Button variant="secondary" onClick={() => void refreshAll()} loading={refreshing} disabled={disableControls}>
            {t('common.refresh')}
          </Button>
        </div>
      </div>

      {pageError ? <div className="error-box">{pageError}</div> : null}

      <div className={styles.summaryGrid}>
        <Card className={styles.summaryCard}>
          <span className={styles.summaryLabel}>{t('codex_management.summary.accounts')}</span>
          <strong className={styles.summaryValue}>{formatNumber(summary.totalAccounts)}</strong>
        </Card>
        <Card className={styles.summaryCard}>
          <span className={styles.summaryLabel}>{t('codex_management.summary.disabled')}</span>
          <strong className={styles.summaryValue}>{formatNumber(summary.disabledAccounts)}</strong>
        </Card>
        <Card className={styles.summaryCard}>
          <span className={styles.summaryLabel}>{t('codex_management.summary.quota_exceeded')}</span>
          <strong className={styles.summaryValue}>{formatNumber(summary.quotaExceededAccounts)}</strong>
        </Card>
        <Card className={styles.summaryCard}>
          <span className={styles.summaryLabel}>{t('codex_management.summary.requests')}</span>
          <strong className={styles.summaryValue}>{formatNumber(summary.totalRequests)}</strong>
        </Card>
      </div>

      <div className={styles.tabs}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`${styles.tabButton} ${activeTab === tab.key ? styles.tabButtonActive : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'accounts' ? (
        <Card title={t('codex_management.accounts.title')} subtitle={t('codex_management.accounts.description')}>
          <div className={styles.toolbar}>
            <Input
              value={accountsSearch}
              onChange={(event) => setAccountsSearch(event.target.value)}
              placeholder={t('codex_management.search_placeholder')}
            />
            <div className={styles.toolbarField}>
              <label className={styles.fieldLabel}>{t('codex_management.status')}</label>
              <Select value={accountsStatus} options={statusOptions} onChange={setAccountsStatus} />
            </div>
            <div className={styles.toolbarField}>
              <label className={styles.fieldLabel}>{t('codex_management.page_size')}</label>
              <Select
                value={String(accountsPageSize)}
                options={PAGE_SIZE_OPTIONS.map((value) => ({ value, label: value }))}
                onChange={(value) => setAccountsPageSize(Number(value))}
              />
            </div>
          </div>
          <div className={styles.toolbarActions}>
            <span className={styles.selectionSummary}>
              {t('codex_management.accounts.selected_files', { count: selectedAccountFileNames.length })}
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={selectFilteredAccountFiles}
              disabled={disableControls || filteredAccountFileNames.length === 0}
            >
              {t('codex_management.accounts.select_filtered')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearSelectedAccountFiles}
              disabled={selectedAccountFileNames.length === 0}
            >
              {t('codex_management.accounts.clear_selection')}
            </Button>
            <Button size="sm" onClick={openBatchProxyModal} disabled={disableControls || selectedAccountFileNames.length === 0}>
              {t('codex_management.accounts.batch_proxy')}
            </Button>
          </div>

          {filteredAccounts.length === 0 ? (
            <EmptyState
              title={t('codex_management.empty.accounts')}
              description={t('codex_management.empty.accounts_description')}
            />
          ) : (
            <>
              <div className={styles.tableWrap}>
                <table className={styles.dataTable}>
                  <thead>
                    <tr>
                      <th>
                        <input
                          type="checkbox"
                          checked={allPagedAccountFilesSelected}
                          ref={(input) => {
                            if (input) {
                              input.indeterminate = !allPagedAccountFilesSelected && somePagedAccountFilesSelected;
                            }
                          }}
                          onChange={togglePagedAccountFiles}
                          aria-label={t('codex_management.table.select')}
                        />
                      </th>
                      <th aria-sort={getAriaSort(accountsSort.key === 'auth_index', accountsSort.direction)}>
                        <SortButton
                          label={t('codex_management.table.auth_index')}
                          active={accountsSort.key === 'auth_index'}
                          direction={accountsSort.direction}
                          onClick={() => setAccountsSort((current) => nextSortState(current, 'auth_index'))}
                        />
                      </th>
                      <th aria-sort={getAriaSort(accountsSort.key === 'account', accountsSort.direction)}>
                        <SortButton
                          label={t('codex_management.table.account')}
                          active={accountsSort.key === 'account'}
                          direction={accountsSort.direction}
                          onClick={() => setAccountsSort((current) => nextSortState(current, 'account'))}
                        />
                      </th>
                      <th aria-sort={getAriaSort(accountsSort.key === 'file_name', accountsSort.direction)}>
                        <SortButton
                          label={t('codex_management.table.file')}
                          active={accountsSort.key === 'file_name'}
                          direction={accountsSort.direction}
                          onClick={() => setAccountsSort((current) => nextSortState(current, 'file_name'))}
                        />
                      </th>
                      <th aria-sort={getAriaSort(accountsSort.key === 'status', accountsSort.direction)}>
                        <SortButton
                          label={t('codex_management.table.status')}
                          active={accountsSort.key === 'status'}
                          direction={accountsSort.direction}
                          onClick={() => setAccountsSort((current) => nextSortState(current, 'status'))}
                        />
                      </th>
                      <th aria-sort={getAriaSort(accountsSort.key === 'quota', accountsSort.direction)}>
                        <SortButton
                          label={t('codex_management.table.quota')}
                          active={accountsSort.key === 'quota'}
                          direction={accountsSort.direction}
                          onClick={() => setAccountsSort((current) => nextSortState(current, 'quota'))}
                        />
                      </th>
                      <th aria-sort={getAriaSort(accountsSort.key === 'recover', accountsSort.direction)}>
                        <SortButton
                          label={t('codex_management.table.recover')}
                          active={accountsSort.key === 'recover'}
                          direction={accountsSort.direction}
                          onClick={() => setAccountsSort((current) => nextSortState(current, 'recover'))}
                        />
                      </th>
                      <th aria-sort={getAriaSort(accountsSort.key === 'requests', accountsSort.direction)}>
                        <SortButton
                          label={t('codex_management.table.requests')}
                          active={accountsSort.key === 'requests'}
                          direction={accountsSort.direction}
                          onClick={() => setAccountsSort((current) => nextSortState(current, 'requests'))}
                        />
                      </th>
                      <th aria-sort={getAriaSort(accountsSort.key === 'avg_total', accountsSort.direction)}>
                        <SortButton
                          label={t('codex_management.table.avg_total')}
                          active={accountsSort.key === 'avg_total'}
                          direction={accountsSort.direction}
                          onClick={() => setAccountsSort((current) => nextSortState(current, 'avg_total'))}
                        />
                      </th>
                      <th>{t('codex_management.table.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedAccounts.map((item) => (
                      <tr key={String(item.auth_index ?? item.auth_id ?? `${item.account}-${item.file_name}`)}>
                        <td>
                          <input
                            type="checkbox"
                            checked={item.file_name ? selectedAccountFiles.has(String(item.file_name)) : false}
                            onChange={() => toggleAccountFileSelection(String(item.file_name ?? ''))}
                            disabled={!item.file_name}
                            aria-label={`${t('codex_management.table.select')} ${item.file_name || item.account || ''}`}
                          />
                        </td>
                        <td className={styles.mono}>{item.auth_index || '-'}</td>
                        <td>
                          <div>{item.account || item.label || '-'}</div>
                          <div className={styles.subtle}>{item.account_type || item.provider || '-'}</div>
                        </td>
                        <td>
                          <div>{item.file_name || '-'}</div>
                          <div className={styles.subtle}>{item.expires_at ? formatDateTime(item.expires_at) : '-'}</div>
                        </td>
                        <td>
                          <span className={`${styles.statusChip} ${getStatusTone(item)}`}>{getStatusText(item)}</span>
                          {item.status_message ? <div className={styles.subtle}>{item.status_message}</div> : null}
                        </td>
                        <td>
                          <div>{item.quota_reason || item.quota_model || '-'}</div>
                          {item.last_error_message ? <div className={styles.subtle}>{item.last_error_message}</div> : null}
                        </td>
                        <td>{formatDateTime(item.next_recover_at || item.next_retry_after || item.next_refresh_after)}</td>
                        <td>{formatNumber(item.usage?.request_count)}</td>
                        <td>{formatAverage(item.usage?.avg_total_tokens)}</td>
                        <td>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => void openDetail(String(item.auth_index ?? ''))}
                            disabled={!item.auth_index}
                          >
                            {t('codex_management.detail')}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <PaginationBar
                page={accountsPage}
                total={filteredAccounts.length}
                pageSize={accountsPageSize}
                onPageChange={setAccountsPage}
              />
            </>
          )}
        </Card>
      ) : null}

      {activeTab === 'usage' ? (
        <Card title={t('codex_management.usage.title')} subtitle={t('codex_management.usage.description')}>
          <div className={styles.toolbar}>
            <Input
              value={usageSearch}
              onChange={(event) => setUsageSearch(event.target.value)}
              placeholder={t('codex_management.search_placeholder')}
            />
            <div className={styles.toolbarField}>
              <label className={styles.fieldLabel}>{t('codex_management.page_size')}</label>
              <Select
                value={String(usagePageSize)}
                options={PAGE_SIZE_OPTIONS.map((value) => ({ value, label: value }))}
                onChange={(value) => setUsagePageSize(Number(value))}
              />
            </div>
          </div>

          {filteredUsage.length === 0 ? (
            <EmptyState
              title={t('codex_management.empty.usage')}
              description={t('codex_management.empty.usage_description')}
            />
          ) : (
            <>
              <div className={styles.tableWrap}>
                <table className={styles.dataTable}>
                  <thead>
                    <tr>
                      <th aria-sort={getAriaSort(usageSort.key === 'auth_index', usageSort.direction)}>
                        <SortButton
                          label={t('codex_management.table.auth_index')}
                          active={usageSort.key === 'auth_index'}
                          direction={usageSort.direction}
                          onClick={() => setUsageSort((current) => nextSortState(current, 'auth_index'))}
                        />
                      </th>
                      <th aria-sort={getAriaSort(usageSort.key === 'account', usageSort.direction)}>
                        <SortButton
                          label={t('codex_management.table.account')}
                          active={usageSort.key === 'account'}
                          direction={usageSort.direction}
                          onClick={() => setUsageSort((current) => nextSortState(current, 'account'))}
                        />
                      </th>
                      <th aria-sort={getAriaSort(usageSort.key === 'requests', usageSort.direction)}>
                        <SortButton
                          label={t('codex_management.table.requests')}
                          active={usageSort.key === 'requests'}
                          direction={usageSort.direction}
                          onClick={() => setUsageSort((current) => nextSortState(current, 'requests'))}
                        />
                      </th>
                      <th aria-sort={getAriaSort(usageSort.key === 'input_tokens', usageSort.direction)}>
                        <SortButton
                          label={t('codex_management.table.input_tokens')}
                          active={usageSort.key === 'input_tokens'}
                          direction={usageSort.direction}
                          onClick={() => setUsageSort((current) => nextSortState(current, 'input_tokens'))}
                        />
                      </th>
                      <th aria-sort={getAriaSort(usageSort.key === 'output_tokens', usageSort.direction)}>
                        <SortButton
                          label={t('codex_management.table.output_tokens')}
                          active={usageSort.key === 'output_tokens'}
                          direction={usageSort.direction}
                          onClick={() => setUsageSort((current) => nextSortState(current, 'output_tokens'))}
                        />
                      </th>
                      <th aria-sort={getAriaSort(usageSort.key === 'cached_tokens', usageSort.direction)}>
                        <SortButton
                          label={t('codex_management.table.cached_tokens')}
                          active={usageSort.key === 'cached_tokens'}
                          direction={usageSort.direction}
                          onClick={() => setUsageSort((current) => nextSortState(current, 'cached_tokens'))}
                        />
                      </th>
                      <th aria-sort={getAriaSort(usageSort.key === 'total_tokens', usageSort.direction)}>
                        <SortButton
                          label={t('codex_management.table.total_tokens')}
                          active={usageSort.key === 'total_tokens'}
                          direction={usageSort.direction}
                          onClick={() => setUsageSort((current) => nextSortState(current, 'total_tokens'))}
                        />
                      </th>
                      <th aria-sort={getAriaSort(usageSort.key === 'recovered_tokens', usageSort.direction)}>
                        <SortButton
                          label={t('codex_management.table.recovered_tokens')}
                          active={usageSort.key === 'recovered_tokens'}
                          direction={usageSort.direction}
                          onClick={() => setUsageSort((current) => nextSortState(current, 'recovered_tokens'))}
                        />
                      </th>
                      <th>{t('codex_management.table.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedUsage.map((item) => (
                      <tr key={String(item.auth_index ?? item.auth_id ?? `${item.account}-${item.provider}`)}>
                        <td className={styles.mono}>{item.auth_index || '-'}</td>
                        <td>
                          <div>{item.account || '-'}</div>
                          <div className={styles.subtle}>{item.provider || '-'}</div>
                        </td>
                        <td>{formatNumber(item.request_count)}</td>
                        <td>{formatNumber(item.input_tokens)}</td>
                        <td>{formatNumber(item.output_tokens)}</td>
                        <td>{formatNumber(item.cached_tokens)}</td>
                        <td>{formatNumber(item.total_tokens)}</td>
                        <td>{formatNumber(item.recovered_tokens)}</td>
                        <td>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => void openDetail(String(item.auth_index ?? ''))}
                            disabled={!item.auth_index}
                          >
                            {t('codex_management.detail')}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <PaginationBar
                page={usagePage}
                total={filteredUsage.length}
                pageSize={usagePageSize}
                onPageChange={setUsagePage}
              />
            </>
          )}
        </Card>
      ) : null}

      {activeTab === 'events' ? (
        <Card title={t('codex_management.events.title')} subtitle={t('codex_management.events.description')}>
          <div className={styles.toolbar}>
            <Input
              value={eventsSearch}
              onChange={(event) => setEventsSearch(event.target.value)}
              placeholder={t('codex_management.search_placeholder')}
            />
            <div className={styles.toolbarField}>
              <label className={styles.fieldLabel}>{t('codex_management.table.auth_index')}</label>
              <Select value={eventsAuthIndex} options={authIndexOptions} onChange={setEventsAuthIndex} />
            </div>
            <div className={styles.toolbarField}>
              <label className={styles.fieldLabel}>{t('codex_management.page_size')}</label>
              <Select
                value={String(eventsPageSize)}
                options={PAGE_SIZE_OPTIONS.map((value) => ({ value, label: value }))}
                onChange={(value) => setEventsPageSize(Number(value))}
              />
            </div>
          </div>

          {filteredEvents.length === 0 ? (
            <EmptyState
              title={t('codex_management.empty.events')}
              description={t('codex_management.empty.events_description')}
            />
          ) : (
            <>
              <div className={styles.tableWrap}>
                <table className={styles.dataTable}>
                  <thead>
                    <tr>
                      <th aria-sort={getAriaSort(eventsSort.key === 'created_at', eventsSort.direction)}>
                        <SortButton
                          label={t('codex_management.table.created_at')}
                          active={eventsSort.key === 'created_at'}
                          direction={eventsSort.direction}
                          onClick={() => setEventsSort((current) => nextSortState(current, 'created_at'))}
                        />
                      </th>
                      <th aria-sort={getAriaSort(eventsSort.key === 'auth_index', eventsSort.direction)}>
                        <SortButton
                          label={t('codex_management.table.auth_index')}
                          active={eventsSort.key === 'auth_index'}
                          direction={eventsSort.direction}
                          onClick={() => setEventsSort((current) => nextSortState(current, 'auth_index'))}
                        />
                      </th>
                      <th aria-sort={getAriaSort(eventsSort.key === 'event_type', eventsSort.direction)}>
                        <SortButton
                          label={t('codex_management.table.event_type')}
                          active={eventsSort.key === 'event_type'}
                          direction={eventsSort.direction}
                          onClick={() => setEventsSort((current) => nextSortState(current, 'event_type'))}
                        />
                      </th>
                      <th aria-sort={getAriaSort(eventsSort.key === 'reason', eventsSort.direction)}>
                        <SortButton
                          label={t('codex_management.table.reason')}
                          active={eventsSort.key === 'reason'}
                          direction={eventsSort.direction}
                          onClick={() => setEventsSort((current) => nextSortState(current, 'reason'))}
                        />
                      </th>
                      <th aria-sort={getAriaSort(eventsSort.key === 'requests', eventsSort.direction)}>
                        <SortButton
                          label={t('codex_management.table.requests')}
                          active={eventsSort.key === 'requests'}
                          direction={eventsSort.direction}
                          onClick={() => setEventsSort((current) => nextSortState(current, 'requests'))}
                        />
                      </th>
                      <th aria-sort={getAriaSort(eventsSort.key === 'total_tokens', eventsSort.direction)}>
                        <SortButton
                          label={t('codex_management.table.total_tokens')}
                          active={eventsSort.key === 'total_tokens'}
                          direction={eventsSort.direction}
                          onClick={() => setEventsSort((current) => nextSortState(current, 'total_tokens'))}
                        />
                      </th>
                      <th aria-sort={getAriaSort(eventsSort.key === 'recover', eventsSort.direction)}>
                        <SortButton
                          label={t('codex_management.table.recover')}
                          active={eventsSort.key === 'recover'}
                          direction={eventsSort.direction}
                          onClick={() => setEventsSort((current) => nextSortState(current, 'recover'))}
                        />
                      </th>
                      <th>{t('codex_management.table.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedEvents.map((item) => (
                      <tr key={String(item.id ?? `${item.auth_index}-${item.created_at}`)}>
                        <td>{formatDateTime(item.created_at)}</td>
                        <td className={styles.mono}>{item.auth_index || '-'}</td>
                        <td>{item.event_type || '-'}</td>
                        <td>
                          <div>{item.reason || item.status_message || '-'}</div>
                          {item.last_error ? <div className={styles.subtle}>{item.last_error}</div> : null}
                        </td>
                        <td>{formatNumber(item.request_count)}</td>
                        <td>{formatNumber(item.total_tokens)}</td>
                        <td>{formatDateTime(item.recover_at)}</td>
                        <td>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => void openDetail(String(item.auth_index ?? ''))}
                            disabled={!item.auth_index}
                          >
                            {t('codex_management.detail')}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <PaginationBar
                page={eventsPage}
                total={filteredEvents.length}
                pageSize={eventsPageSize}
                onPageChange={setEventsPage}
              />
            </>
          )}
        </Card>
      ) : null}

      {activeTab === 'config' ? (
        <div className={styles.configLayout}>
          <Card title={t('codex_management.config.title')} subtitle={t('codex_management.config.description')}>
            <div className={styles.configHeaderGrid}>
              <Input
                label={t('codex_management.config.user_agent')}
                value={configEditor.userAgent}
                onChange={(event) => setConfigEditor((current) => ({ ...current, userAgent: event.target.value }))}
                placeholder="Mozilla/5.0 ..."
              />
              <Input
                label={t('codex_management.config.beta_features')}
                value={configEditor.betaFeatures}
                onChange={(event) => setConfigEditor((current) => ({ ...current, betaFeatures: event.target.value }))}
                placeholder="feature-a, feature-b"
              />
            </div>
            <div className={styles.noticeGrid}>
              <div className={styles.noticeCard}>
                <strong>{t('codex_management.config.instructions_title')}</strong>
                <p>{t('codex_management.config.instructions_note')}</p>
              </div>
              <div className={styles.noticeCard}>
                <strong>{t('codex_management.config.context_title')}</strong>
                <p>{t('codex_management.config.context_note')}</p>
              </div>
            </div>
            {Object.keys(configEditor.notes).length > 0 ? (
              <div className={styles.notesPanel}>
                {Object.entries(configEditor.notes).map(([key, value]) => (
                  <div key={key} className={styles.noteItem}>
                    <span className={styles.noteKey}>{key}</span>
                    <span className={styles.noteValue}>{collectSearchableText(value) || '-'}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </Card>

          <PayloadRuleGroup
            title="payload.default"
            description={t('codex_management.config.default_description')}
            rules={configEditor.defaultRules}
            onAddRule={() => updateRuleCollection('defaultRules', (rules) => [...rules, createEditableRule()])}
            onRemoveRule={(ruleId) => updateRuleCollection('defaultRules', (rules) => rules.filter((rule) => rule.id !== ruleId))}
            onModelsChange={(ruleId, value) =>
              updateRuleCollection('defaultRules', (rules) =>
                rules.map((rule) => (rule.id === ruleId ? { ...rule, modelsText: value } : rule))
              )
            }
            onAddParam={(ruleId) =>
              updateRuleCollection('defaultRules', (rules) =>
                rules.map((rule) =>
                  rule.id === ruleId ? { ...rule, params: [...rule.params, createEditableParam()] } : rule
                )
              )
            }
            onRemoveParam={(ruleId, paramId) =>
              updateRuleCollection('defaultRules', (rules) =>
                rules.map((rule) =>
                  rule.id === ruleId
                    ? {
                        ...rule,
                        params:
                          rule.params.filter((param) => param.id !== paramId).length > 0
                            ? rule.params.filter((param) => param.id !== paramId)
                            : [createEditableParam()],
                      }
                    : rule
                )
              )
            }
            onParamChange={(ruleId, paramId, key, value) =>
              updateRuleCollection('defaultRules', (rules) =>
                rules.map((rule) =>
                  rule.id === ruleId
                    ? {
                        ...rule,
                        params: rule.params.map((param) =>
                          param.id === paramId ? { ...param, [key]: value } : param
                        ),
                      }
                    : rule
                )
              )
            }
          />

          <PayloadRuleGroup
            title="payload.default_raw"
            description={t('codex_management.config.default_raw_description')}
            rules={configEditor.defaultRawRules}
            onAddRule={() => updateRuleCollection('defaultRawRules', (rules) => [...rules, createEditableRule()])}
            onRemoveRule={(ruleId) =>
              updateRuleCollection('defaultRawRules', (rules) => rules.filter((rule) => rule.id !== ruleId))
            }
            onModelsChange={(ruleId, value) =>
              updateRuleCollection('defaultRawRules', (rules) =>
                rules.map((rule) => (rule.id === ruleId ? { ...rule, modelsText: value } : rule))
              )
            }
            onAddParam={(ruleId) =>
              updateRuleCollection('defaultRawRules', (rules) =>
                rules.map((rule) =>
                  rule.id === ruleId ? { ...rule, params: [...rule.params, createEditableParam()] } : rule
                )
              )
            }
            onRemoveParam={(ruleId, paramId) =>
              updateRuleCollection('defaultRawRules', (rules) =>
                rules.map((rule) =>
                  rule.id === ruleId
                    ? {
                        ...rule,
                        params:
                          rule.params.filter((param) => param.id !== paramId).length > 0
                            ? rule.params.filter((param) => param.id !== paramId)
                            : [createEditableParam()],
                      }
                    : rule
                )
              )
            }
            onParamChange={(ruleId, paramId, key, value) =>
              updateRuleCollection('defaultRawRules', (rules) =>
                rules.map((rule) =>
                  rule.id === ruleId
                    ? {
                        ...rule,
                        params: rule.params.map((param) =>
                          param.id === paramId ? { ...param, [key]: value } : param
                        ),
                      }
                    : rule
                )
              )
            }
          />

          <PayloadRuleGroup
            title="payload.override"
            description={t('codex_management.config.override_description')}
            rules={configEditor.overrideRules}
            onAddRule={() => updateRuleCollection('overrideRules', (rules) => [...rules, createEditableRule()])}
            onRemoveRule={(ruleId) =>
              updateRuleCollection('overrideRules', (rules) => rules.filter((rule) => rule.id !== ruleId))
            }
            onModelsChange={(ruleId, value) =>
              updateRuleCollection('overrideRules', (rules) =>
                rules.map((rule) => (rule.id === ruleId ? { ...rule, modelsText: value } : rule))
              )
            }
            onAddParam={(ruleId) =>
              updateRuleCollection('overrideRules', (rules) =>
                rules.map((rule) =>
                  rule.id === ruleId ? { ...rule, params: [...rule.params, createEditableParam()] } : rule
                )
              )
            }
            onRemoveParam={(ruleId, paramId) =>
              updateRuleCollection('overrideRules', (rules) =>
                rules.map((rule) =>
                  rule.id === ruleId
                    ? {
                        ...rule,
                        params:
                          rule.params.filter((param) => param.id !== paramId).length > 0
                            ? rule.params.filter((param) => param.id !== paramId)
                            : [createEditableParam()],
                      }
                    : rule
                )
              )
            }
            onParamChange={(ruleId, paramId, key, value) =>
              updateRuleCollection('overrideRules', (rules) =>
                rules.map((rule) =>
                  rule.id === ruleId
                    ? {
                        ...rule,
                        params: rule.params.map((param) =>
                          param.id === paramId ? { ...param, [key]: value } : param
                        ),
                      }
                    : rule
                )
              )
            }
          />

          <PayloadRuleGroup
            title="payload.override_raw"
            description={t('codex_management.config.override_raw_description')}
            rules={configEditor.overrideRawRules}
            onAddRule={() => updateRuleCollection('overrideRawRules', (rules) => [...rules, createEditableRule()])}
            onRemoveRule={(ruleId) =>
              updateRuleCollection('overrideRawRules', (rules) => rules.filter((rule) => rule.id !== ruleId))
            }
            onModelsChange={(ruleId, value) =>
              updateRuleCollection('overrideRawRules', (rules) =>
                rules.map((rule) => (rule.id === ruleId ? { ...rule, modelsText: value } : rule))
              )
            }
            onAddParam={(ruleId) =>
              updateRuleCollection('overrideRawRules', (rules) =>
                rules.map((rule) =>
                  rule.id === ruleId ? { ...rule, params: [...rule.params, createEditableParam()] } : rule
                )
              )
            }
            onRemoveParam={(ruleId, paramId) =>
              updateRuleCollection('overrideRawRules', (rules) =>
                rules.map((rule) =>
                  rule.id === ruleId
                    ? {
                        ...rule,
                        params:
                          rule.params.filter((param) => param.id !== paramId).length > 0
                            ? rule.params.filter((param) => param.id !== paramId)
                            : [createEditableParam()],
                      }
                    : rule
                )
              )
            }
            onParamChange={(ruleId, paramId, key, value) =>
              updateRuleCollection('overrideRawRules', (rules) =>
                rules.map((rule) =>
                  rule.id === ruleId
                    ? {
                        ...rule,
                        params: rule.params.map((param) =>
                          param.id === paramId ? { ...param, [key]: value } : param
                        ),
                      }
                    : rule
                )
              )
            }
          />

          <FilterRuleGroup
            rules={configEditor.filterRules}
            onAddRule={() => updateFilterCollection((rules) => [...rules, createEditableFilterRule()])}
            onRemoveRule={(ruleId) => updateFilterCollection((rules) => rules.filter((rule) => rule.id !== ruleId))}
            onChange={(ruleId, key, value) =>
              updateFilterCollection((rules) =>
                rules.map((rule) => (rule.id === ruleId ? { ...rule, [key]: value } : rule))
              )
            }
          />

          <div className={styles.configActions}>
            <Button onClick={() => void handleConfigSave()} loading={savingConfig} disabled={disableControls}>
              {t('common.save')}
            </Button>
          </div>
        </div>
      ) : null}

      <Modal
        open={batchProxyOpen}
        onClose={() => {
          if (batchProxySaving) return;
          setBatchProxyOpen(false);
          setBatchProxyMode('set');
          setBatchProxyValue('');
        }}
        width={720}
        closeDisabled={batchProxySaving}
        title={t('codex_management.accounts.batch_proxy_title')}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setBatchProxyOpen(false);
                setBatchProxyMode('set');
                setBatchProxyValue('');
              }}
              disabled={batchProxySaving}
            >
              {t('common.cancel')}
            </Button>
            <Button onClick={() => void handleBatchProxySubmit()} loading={batchProxySaving}>
              {t('codex_management.accounts.batch_proxy_submit')}
            </Button>
          </>
        }
      >
        <div className={styles.batchProxyContent}>
          <p className={styles.batchProxyDescription}>{t('codex_management.accounts.batch_proxy_description')}</p>
          <div className={styles.batchProxyControls}>
            <div className={styles.toolbarField}>
              <label className={styles.fieldLabel}>{t('codex_management.accounts.batch_proxy_mode')}</label>
              <Select
                value={batchProxyMode}
                options={[
                  { value: 'set', label: t('codex_management.accounts.batch_proxy_set') },
                  { value: 'clear', label: t('codex_management.accounts.batch_proxy_clear') },
                ]}
                onChange={(value) => setBatchProxyMode(value as 'set' | 'clear')}
              />
            </div>
            {batchProxyMode === 'set' ? (
              <Input
                label={t('codex_management.accounts.batch_proxy_input_label')}
                value={batchProxyValue}
                onChange={(event) => setBatchProxyValue(event.target.value)}
                placeholder={t('codex_management.accounts.batch_proxy_input_placeholder')}
                disabled={batchProxySaving}
              />
            ) : null}
          </div>
          <div className={styles.batchProxySelectedPanel}>
            <div className={styles.batchProxySelectedHeader}>
              <span>{t('codex_management.accounts.selected_files', { count: selectedAccountFileNames.length })}</span>
            </div>
            <div className={styles.batchProxySelectedList}>
              {selectedAccountFileNames.map((name) => (
                <span key={name} className={styles.batchProxyChip}>
                  {name}
                </span>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={detail.open}
        onClose={() =>
          setDetail({
            open: false,
            authIndex: '',
            loading: false,
            snapshot: null,
            events: [],
          })
        }
        width={1080}
        title={`${t('codex_management.detail')} · ${detail.authIndex || '-'}`}
      >
        {detail.loading ? (
          <div className={styles.modalLoading}>{t('common.loading')}</div>
        ) : detail.snapshot ? (
          <div className={styles.detailContent}>
            <div className={styles.detailGrid}>
              <Card title={t('codex_management.detail_cards.account')}>
                <div className={styles.detailList}>
                  <div>
                    <span>{t('codex_management.table.account')}</span>
                    <strong>{detail.snapshot.account || detail.snapshot.label || '-'}</strong>
                  </div>
                  <div>
                    <span>{t('codex_management.table.file')}</span>
                    <strong>{detail.snapshot.file_name || '-'}</strong>
                  </div>
                  <div>
                    <span>{t('codex_management.table.status')}</span>
                    <strong>{getStatusText(detail.snapshot)}</strong>
                  </div>
                </div>
              </Card>
              <Card title={t('codex_management.detail_cards.quota')}>
                <div className={styles.detailList}>
                  <div>
                    <span>{t('codex_management.table.quota')}</span>
                    <strong>{detail.snapshot.quota_reason || detail.snapshot.quota_model || '-'}</strong>
                  </div>
                  <div>
                    <span>{t('codex_management.table.recover')}</span>
                    <strong>{formatDateTime(detail.snapshot.next_recover_at || detail.snapshot.next_retry_after)}</strong>
                  </div>
                  <div>
                    <span>{t('codex_management.detail_cards.last_refresh')}</span>
                    <strong>{formatDateTime(detail.snapshot.last_refreshed_at || detail.snapshot.updated_at)}</strong>
                  </div>
                </div>
              </Card>
            </div>

            {detail.snapshot.status_message || detail.snapshot.last_error_message ? (
              <Card title={t('codex_management.detail_cards.messages')}>
                <div className={styles.messageStack}>
                  {detail.snapshot.status_message ? <div>{detail.snapshot.status_message}</div> : null}
                  {detail.snapshot.last_error_message ? (
                    <div className={styles.errorText}>{detail.snapshot.last_error_message}</div>
                  ) : null}
                </div>
              </Card>
            ) : null}

            <Card title={t('codex_management.detail_cards.events')}>
              {detail.events.length === 0 ? (
                <EmptyState title={t('codex_management.empty.detail_events')} />
              ) : (
                <div className={styles.tableWrap}>
                  <table className={styles.dataTable}>
                    <thead>
                      <tr>
                        <th>{t('codex_management.table.created_at')}</th>
                        <th>{t('codex_management.table.event_type')}</th>
                        <th>{t('codex_management.table.reason')}</th>
                        <th>{t('codex_management.table.requests')}</th>
                        <th>{t('codex_management.table.total_tokens')}</th>
                        <th>{t('codex_management.table.recover')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.events.map((event) => (
                        <tr key={String(event.id ?? `${event.created_at}-${event.reason}`)}>
                          <td>{formatDateTime(event.created_at)}</td>
                          <td>{event.event_type || '-'}</td>
                          <td>
                            <div>{event.reason || event.status_message || '-'}</div>
                            {event.last_error ? <div className={styles.subtle}>{event.last_error}</div> : null}
                          </td>
                          <td>{formatNumber(event.request_count)}</td>
                          <td>{formatNumber(event.total_tokens)}</td>
                          <td>{formatDateTime(event.recover_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        ) : (
          <EmptyState title={t('codex_management.empty.detail')} description={t('codex_management.empty.detail_description')} />
        )}
      </Modal>
    </div>
  );
}
