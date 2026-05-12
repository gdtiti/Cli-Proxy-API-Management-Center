import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import {
  webImageApi,
  type WebImageAuthAccount,
  type WebImageQuotaRefreshStatus,
  type WebImageTask,
} from '@/services/api';
import { useNotificationStore } from '@/stores';
import styles from './WebImagePage.module.scss';

type ActiveTab = 'accounts' | 'tasks' | 'analytics';
type AccountSortKey = 'account' | 'status' | 'quota' | 'refreshed';
type SortDirection = 'asc' | 'desc';

type Draft = {
  accessToken: string;
  accountId: string;
  email: string;
  planType: string;
  proxyUrl: string;
  note: string;
};

type DistributionItem = {
  key: string;
  count: number;
};

const initialDraft: Draft = {
  accessToken: '',
  accountId: '',
  email: '',
  planType: '',
  proxyUrl: '',
  note: '',
};

const pageSizeOptions = [10, 20, 50, 100];

const formatDate = (value?: string) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

const formatDuration = (value?: number) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return '-';
  if (value < 1000) return `${Math.round(value)}ms`;
  return `${(value / 1000).toFixed(1)}s`;
};

const formatPercent = (value: number) => `${Math.round(value * 100)}%`;

const accountName = (item: WebImageAuthAccount) =>
  item.email || item.account || item.account_id || item.name || item.id || '-';

const quotaRemaining = (item: WebImageAuthAccount) => {
  const value = item.quota?.image_quota_remaining;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
};

const quotaText = (item: WebImageAuthAccount) => {
  const quota = item.quota;
  if (!quota || quota.image_quota_unknown) return 'unknown';
  const reset = quota.image_quota_restore_at
    ? formatDate(quota.image_quota_restore_at)
    : quota.image_quota_reset_after_seconds
      ? `${quota.image_quota_reset_after_seconds}s`
      : '-';
  return `${quota.image_quota_remaining ?? '-'} / reset ${reset}`;
};

const isCooling = (item: WebImageAuthAccount) => {
  const quota = item.quota;
  if (!quota) return false;
  if (quota.image_quota_restore_at) {
    const restoreAt = new Date(quota.image_quota_restore_at).getTime();
    if (Number.isFinite(restoreAt) && restoreAt > Date.now()) return true;
  }
  return (quota.image_quota_remaining ?? 0) <= 0 && (quota.image_quota_reset_after_seconds ?? 0) > 0;
};

const taskStatus = (task: WebImageTask) => (task.status || 'unknown').toLowerCase();

const isSuccessTask = (task: WebImageTask) => {
  const status = taskStatus(task);
  return status === 'success' || status === 'completed' || status === 'succeeded';
};

const isFailedTask = (task: WebImageTask) => {
  const status = taskStatus(task);
  return status === 'failed' || status === 'error' || (typeof task.http_status === 'number' && task.http_status >= 400);
};

const isRunningTask = (task: WebImageTask) => {
  const status = taskStatus(task);
  return status === 'running' || status === 'pending' || status === 'processing';
};

const distribution = (items: WebImageTask[], selector: (task: WebImageTask) => string | undefined) => {
  const counts = new Map<string, number>();
  items.forEach((task) => {
    const key = selector(task) || '-';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return Array.from(counts.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));
};

const fileList = (files?: string[]) => {
  if (!files?.length) return '-';
  return (
    <div className={styles.fileList}>
      {files.map((file) => (
        <code key={file}>{file}</code>
      ))}
    </div>
  );
};

const eventList = (task: WebImageTask) => {
  const events = task.events?.slice(-5) ?? [];
  if (!events.length) return <span className={styles.muted}>{task.stage || '-'}</span>;
  return (
    <div className={styles.eventList}>
      {events.map((event, index) => (
        <div key={`${event.at ?? ''}-${event.stage ?? ''}-${index}`} className={styles.eventItem}>
          <span>{event.stage || '-'}</span>
          <small>{event.status || task.status || '-'}</small>
          {event.message ? <code>{event.message}</code> : null}
        </div>
      ))}
    </div>
  );
};

const normalizeSearch = (value: string) => value.trim().toLowerCase();

export function WebImagePage() {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const [accounts, setAccounts] = useState<WebImageAuthAccount[]>([]);
  const [tasks, setTasks] = useState<WebImageTask[]>([]);
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [activeTab, setActiveTab] = useState<ActiveTab>('accounts');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshStatus, setRefreshStatus] = useState<WebImageQuotaRefreshStatus | null>(null);
  const [refreshConcurrency, setRefreshConcurrency] = useState('4');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<AccountSortKey>('account');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchText, setBatchText] = useState('');
  const [taskRefreshError, setTaskRefreshError] = useState<string | null>(null);
  const streamAbortRef = useRef<AbortController | null>(null);

  const loadTasks = useCallback(async (notify = false) => {
    try {
      const nextTasks = await webImageApi.listTasks();
      setTasks(nextTasks);
      setTaskRefreshError(null);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      setTaskRefreshError(message);
      if (notify) {
        showNotification(message, 'error');
      }
    }
  }, [showNotification]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextAccounts, nextTasks, nextStatus] = await Promise.all([
        webImageApi.listAuths(),
        webImageApi.listTasks(),
        webImageApi.getRefreshQuotaStatus().catch(() => null),
      ]);
      setAccounts(nextAccounts);
      setTasks(nextTasks);
      setTaskRefreshError(null);
      if (nextStatus) setRefreshStatus(nextStatus);
    } catch (error: unknown) {
      showNotification(error instanceof Error ? error.message : String(error), 'error');
    } finally {
      setLoading(false);
    }
  }, [showNotification]);

  useEffect(() => {
    void load();
    return () => streamAbortRef.current?.abort();
  }, [load]);

  const hasRunningTasks = useMemo(() => tasks.some(isRunningTask), [tasks]);

  useEffect(() => {
    if (activeTab === 'tasks' || activeTab === 'analytics') {
      void loadTasks();
    }
  }, [activeTab, loadTasks]);

  useEffect(() => {
    if (activeTab !== 'tasks' && activeTab !== 'analytics' && !hasRunningTasks) {
      return undefined;
    }
    const timer = window.setInterval(() => {
      void loadTasks();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [activeTab, hasRunningTasks, loadTasks]);

  useEffect(() => {
    setPage(1);
  }, [search, pageSize]);

  const accountSummary = useMemo(() => {
    const enabled = accounts.filter((item) => !item.disabled).length;
    const disabled = accounts.length - enabled;
    const unavailable = accounts.filter((item) => item.unavailable).length;
    const cooling = accounts.filter(isCooling).length;
    const knownQuota = accounts.filter((item) => item.quota && !item.quota.image_quota_unknown).length;
    const zeroQuota = accounts.filter((item) => {
      const remaining = quotaRemaining(item);
      return typeof remaining === 'number' && remaining <= 0;
    }).length;
    const remaining = accounts.reduce((sum, item) => sum + (quotaRemaining(item) ?? 0), 0);
    return { enabled, disabled, unavailable, cooling, knownQuota, zeroQuota, remaining };
  }, [accounts]);

  const taskSummary = useMemo(() => {
    const success = tasks.filter(isSuccessTask).length;
    const failed = tasks.filter(isFailedTask).length;
    const running = tasks.filter(isRunningTask).length;
    const totalOutputs = tasks.reduce((sum, task) => sum + (task.output_count ?? task.output_files?.length ?? 0), 0);
    const durations = tasks
      .map((task) => task.duration_millis)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0);
    const avgDuration = durations.length
      ? durations.reduce((sum, value) => sum + value, 0) / durations.length
      : 0;
    const since = Date.now() - 24 * 60 * 60 * 1000;
    const last24h = tasks.filter((task) => {
      if (!task.started_at) return false;
      const startedAt = new Date(task.started_at).getTime();
      return Number.isFinite(startedAt) && startedAt >= since;
    }).length;
    return {
      total: tasks.length,
      success,
      failed,
      running,
      totalOutputs,
      avgDuration,
      last24h,
      successRate: tasks.length ? success / tasks.length : 0,
    };
  }, [tasks]);

  const analytics = useMemo(() => {
    const byStatus = distribution(tasks, (task) => task.status);
    const byModel = distribution(tasks, (task) => task.model);
    const byEndpoint = distribution(tasks, (task) => task.endpoint);
    const byAccount = distribution(tasks, (task) => task.account_id || task.auth_index || task.auth_id);
    const trend = distribution(tasks, (task) => {
      if (!task.started_at) return undefined;
      const date = new Date(task.started_at);
      if (Number.isNaN(date.getTime())) return undefined;
      return date.toISOString().slice(0, 10);
    }).sort((left, right) => left.key.localeCompare(right.key));
    return { byStatus, byModel, byEndpoint, byAccount, trend };
  }, [tasks]);

  const filteredAccounts = useMemo(() => {
    const query = normalizeSearch(search);
    const list = accounts.filter((item) => {
      if (!query) return true;
      return [
        item.id,
        item.name,
        item.email,
        item.account,
        item.account_id,
        item.account_type,
        item.status,
        item.status_message,
        item.provider,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
    const direction = sortDirection === 'asc' ? 1 : -1;
    return [...list].sort((left, right) => {
      let leftValue: string | number = '';
      let rightValue: string | number = '';
      if (sortKey === 'account') {
        leftValue = accountName(left).toLowerCase();
        rightValue = accountName(right).toLowerCase();
      } else if (sortKey === 'status') {
        leftValue = left.disabled ? 'disabled' : left.status || 'active';
        rightValue = right.disabled ? 'disabled' : right.status || 'active';
      } else if (sortKey === 'quota') {
        leftValue = quotaRemaining(left) ?? -1;
        rightValue = quotaRemaining(right) ?? -1;
      } else {
        leftValue = left.quota?.image_quota_last_refreshed_at
          ? new Date(left.quota.image_quota_last_refreshed_at).getTime()
          : 0;
        rightValue = right.quota?.image_quota_last_refreshed_at
          ? new Date(right.quota.image_quota_last_refreshed_at).getTime()
          : 0;
      }
      if (leftValue < rightValue) return -1 * direction;
      if (leftValue > rightValue) return direction;
      return accountName(left).localeCompare(accountName(right));
    });
  }, [accounts, search, sortDirection, sortKey]);

  const pageCount = Math.max(1, Math.ceil(filteredAccounts.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pagedAccounts = filteredAccounts.slice((safePage - 1) * pageSize, safePage * pageSize);

  const refreshPercent = refreshStatus?.total
    ? Math.min(100, Math.round((refreshStatus.processed / refreshStatus.total) * 100))
    : 0;

  const handleSort = (key: AccountSortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDirection('asc');
  };

  const handleCreate = async () => {
    if (!draft.accessToken.trim()) {
      showNotification(t('web_image.access_token_required', { defaultValue: 'access_token 必填' }), 'error');
      return;
    }
    setSaving(true);
    try {
      await webImageApi.createAuth({
        access_token: draft.accessToken.trim(),
        account_id: draft.accountId.trim() || undefined,
        email: draft.email.trim() || undefined,
        plan_type: draft.planType.trim() || undefined,
        proxy_url: draft.proxyUrl.trim() || undefined,
        note: draft.note.trim() || undefined,
      });
      setDraft(initialDraft);
      await load();
      showNotification(t('web_image.create_success', { defaultValue: '已添加 OpenAI AT 账号' }), 'success');
    } catch (error: unknown) {
      showNotification(error instanceof Error ? error.message : String(error), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleBatchCreate = async () => {
    if (!batchText.trim()) {
      showNotification(t('web_image.access_token_required', { defaultValue: 'access_token 必填' }), 'error');
      return;
    }
    setSaving(true);
    try {
      await webImageApi.batchCreateAuths({ text: batchText, note: 'batch imported from management UI' });
      setBatchText('');
      setBatchOpen(false);
      await load();
      showNotification(t('web_image.batch_import_success', { defaultValue: '已批量导入 OpenAI AT' }), 'success');
    } catch (error: unknown) {
      showNotification(error instanceof Error ? error.message : String(error), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleImport = async () => {
    setSaving(true);
    try {
      await webImageApi.importCodex();
      await load();
      showNotification(t('web_image.import_success', { defaultValue: '已从 Codex 同步 AT' }), 'success');
    } catch (error: unknown) {
      showNotification(error instanceof Error ? error.message : String(error), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleRefreshQuota = async () => {
    const concurrency = Number.parseInt(refreshConcurrency, 10);
    setSaving(true);
    try {
      const status = await webImageApi.refreshQuota({
        concurrency: Number.isFinite(concurrency) && concurrency > 0 ? concurrency : undefined,
      });
      setRefreshStatus(status);
      streamAbortRef.current?.abort();
      const controller = new AbortController();
      streamAbortRef.current = controller;
      await webImageApi.streamRefreshQuota((next) => {
        setRefreshStatus(next);
        if (!next.running) {
          void load();
        }
      }, controller.signal);
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      showNotification(error instanceof Error ? error.message : String(error), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (item: WebImageAuthAccount) => {
    const disabled = !item.disabled;
    await webImageApi.setStatus({ name: item.name, auth_id: item.id, disabled });
    await load();
  };

  const handleDelete = async (item: WebImageAuthAccount) => {
    const name = item.name || item.id;
    if (!name) return;
    if (!window.confirm(t('web_image.delete_confirm', { defaultValue: '确认删除该绘图账号？' }))) return;
    await webImageApi.deleteAuth(name);
    await load();
  };

  const renderDistribution = (items: DistributionItem[]) => {
    const max = Math.max(...items.map((item) => item.count), 1);
    if (!items.length) return <div className={styles.muted}>-</div>;
    return (
      <div className={styles.distribution}>
        {items.slice(0, 10).map((item) => (
          <div key={item.key} className={styles.distRow}>
            <span className={styles.distLabel}>{item.key}</span>
            <span className={styles.distBar}>
              <span style={{ width: `${Math.max(6, (item.count / max) * 100)}%` }} />
            </span>
            <strong>{item.count}</strong>
          </div>
        ))}
      </div>
    );
  };

  const renderAccountsTab = () => (
    <div className={styles.tabPanel}>
      <Card
        title={t('web_image.accounts', { defaultValue: '绘图账号独立列表' })}
        subtitle={`${filteredAccounts.length} / ${accounts.length} accounts`}
      >
        <div className={styles.toolbar}>
          <input
            className={styles.searchInput}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('web_image.search_accounts', { defaultValue: '搜索账号、邮箱、状态、账号 ID' })}
          />
          <label className={styles.compactField}>
            concurrency
            <input
              value={refreshConcurrency}
              onChange={(event) => setRefreshConcurrency(event.target.value)}
              inputMode="numeric"
            />
          </label>
          <Button onClick={() => setBatchOpen(true)} disabled={saving}>
            {t('web_image.batch_import', { defaultValue: '批量导入 AT' })}
          </Button>
          <Button onClick={handleImport} disabled={saving}>
            {t('web_image.import_codex', { defaultValue: '从 Codex 同步 AT' })}
          </Button>
          <Button onClick={() => void handleRefreshQuota()} disabled={saving || refreshStatus?.running}>
            {t('web_image.refresh_quota_async', { defaultValue: '异步刷新额度' })}
          </Button>
        </div>

        {refreshStatus ? (
          <div className={styles.progressBox}>
            <div className={styles.progressHeader}>
              <strong>{refreshPercent}%</strong>
              <span>
                {refreshStatus.processed}/{refreshStatus.total} processed, {refreshStatus.succeeded} ok,{' '}
                {refreshStatus.failed} failed
              </span>
              <span>{refreshStatus.running ? 'running' : 'finished'}</span>
            </div>
            <div className={styles.progressTrack}>
              <span style={{ width: `${refreshPercent}%` }} />
            </div>
            <div className={styles.muted}>{refreshStatus.message || refreshStatus.current_auth || '-'}</div>
          </div>
        ) : null}

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th><button type="button" onClick={() => handleSort('account')}>Account</button></th>
                <th>{t('web_image.account_type', { defaultValue: '账号类型' })}</th>
                <th><button type="button" onClick={() => handleSort('status')}>Status</button></th>
                <th><button type="button" onClick={() => handleSort('quota')}>Quota</button></th>
                <th>{t('web_image.restore_at', { defaultValue: '恢复时间' })}</th>
                <th><button type="button" onClick={() => handleSort('refreshed')}>Refreshed</button></th>
                <th>{t('common.actions', { defaultValue: '操作' })}</th>
              </tr>
            </thead>
            <tbody>
              {pagedAccounts.map((item) => (
                <tr key={item.id || item.name}>
                  <td>
                    <div>{accountName(item)}</div>
                    <div className={styles.muted}>{item.account_id || item.name}</div>
                    {item.status_message ? <div className={styles.muted}>{item.status_message}</div> : null}
                  </td>
                  <td>{item.account_type || item.provider || 'openai-at'}</td>
                  <td>
                    <span className={styles.badge}>{item.disabled ? 'disabled' : item.status || 'active'}</span>
                    {item.unavailable ? <span className={styles.badge}>unavailable</span> : null}
                    {isCooling(item) ? <span className={styles.badge}>cooling</span> : null}
                  </td>
                  <td>{quotaText(item)}</td>
                  <td>{formatDate(item.quota?.image_quota_restore_at)}</td>
                  <td>{formatDate(item.quota?.image_quota_last_refreshed_at)}</td>
                  <td>
                    <div className={styles.actions}>
                      <Button size="sm" variant="ghost" onClick={() => void handleToggle(item)}>
                        {item.disabled
                          ? t('common.enable', { defaultValue: '启用' })
                          : t('common.disable', { defaultValue: '禁用' })}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => void handleDelete(item)}>
                        {t('common.delete', { defaultValue: '删除' })}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {pagedAccounts.length === 0 ? (
                <tr>
                  <td colSpan={7} className={styles.muted}>
                    {t('web_image.empty_accounts', { defaultValue: '暂无 OpenAI AT 绘图账号' })}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className={styles.pagination}>
          <span>Page {safePage} / {pageCount}</span>
          <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
            {pageSizeOptions.map((size) => (
              <option key={size} value={size}>{size} / page</option>
            ))}
          </select>
          <Button size="sm" variant="ghost" onClick={() => setPage((prev) => Math.max(1, prev - 1))} disabled={safePage <= 1}>
            Prev
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPage((prev) => Math.min(pageCount, prev + 1))} disabled={safePage >= pageCount}>
            Next
          </Button>
        </div>
      </Card>

      <Card title={t('web_image.add_account', { defaultValue: '添加单个 OpenAI AT' })}>
        <div className={styles.formGrid}>
          <label className={styles.tokenField}>
            access_token
            <input
              value={draft.accessToken}
              onChange={(event) => setDraft((prev) => ({ ...prev, accessToken: event.target.value }))}
              type="password"
              autoComplete="off"
            />
          </label>
          <label>
            account_id
            <input
              value={draft.accountId}
              onChange={(event) => setDraft((prev) => ({ ...prev, accountId: event.target.value }))}
            />
          </label>
          <label>
            email
            <input
              value={draft.email}
              onChange={(event) => setDraft((prev) => ({ ...prev, email: event.target.value }))}
            />
          </label>
          <label>
            plan_type
            <input
              value={draft.planType}
              onChange={(event) => setDraft((prev) => ({ ...prev, planType: event.target.value }))}
            />
          </label>
          <label>
            proxy_url
            <input
              value={draft.proxyUrl}
              onChange={(event) => setDraft((prev) => ({ ...prev, proxyUrl: event.target.value }))}
            />
          </label>
          <label className={styles.tokenField}>
            note
            <input
              value={draft.note}
              onChange={(event) => setDraft((prev) => ({ ...prev, note: event.target.value }))}
            />
          </label>
        </div>
        <div className={styles.actions} style={{ marginTop: 12 }}>
          <Button onClick={handleCreate} disabled={saving}>{t('common.save')}</Button>
        </div>
      </Card>
    </div>
  );

  const renderTasksTab = () => (
    <Card title={t('web_image.tasks', { defaultValue: '绘图任务、使用情况与文件记录' })}>
      {taskRefreshError ? (
        <div className={styles.error}>
          {t('web_image.task_refresh_failed', { defaultValue: '任务记录刷新失败' })}: {taskRefreshError}
        </div>
      ) : null}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>ID</th>
              <th>Model / Endpoint</th>
              <th>Account</th>
              <th>Prompt</th>
              <th>Status</th>
              <th>Process</th>
              <th>Usage</th>
              <th>Files</th>
              <th>Started</th>
              <th>Error</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => (
              <tr key={task.id}>
                <td><code>{task.id}</code></td>
                <td>
                  <div>{task.model || '-'}</div>
                  <div className={styles.muted}>{task.endpoint || '-'}</div>
                </td>
                <td>
                  <div>{task.account_id || task.auth_index || task.auth_id || '-'}</div>
                  <div className={styles.muted}>{task.auth_id || '-'}</div>
                </td>
                <td className={styles.prompt}>{task.prompt || '-'}</td>
                <td>
                  <span className={styles.badge}>{task.status || '-'}</span>
                  {task.stage ? <span className={styles.badge}>{task.stage}</span> : null}
                  {task.http_status ? <span className={styles.badge}>HTTP {task.http_status}</span> : null}
                </td>
                <td>{eventList(task)}</td>
                <td>
                  <div>{task.input_count ?? 0} input / {task.output_count ?? task.output_files?.length ?? 0} output</div>
                  <div className={styles.muted}>{formatDuration(task.duration_millis)}</div>
                </td>
                <td>
                  <div className={styles.fileBlock}><span>上传</span>{fileList(task.upload_files)}</div>
                  <div className={styles.fileBlock}><span>输出</span>{fileList(task.output_files)}</div>
                  <div className={styles.fileBlock}><span>日志</span>{task.request_log_file ? <code>{task.request_log_file}</code> : '-'}</div>
                </td>
                <td>
                  <div>{formatDate(task.started_at)}</div>
                  <div className={styles.muted}>{formatDate(task.completed_at)}</div>
                </td>
                <td className={styles.error}>{task.error || '-'}</td>
              </tr>
            ))}
            {tasks.length === 0 ? (
              <tr>
                <td colSpan={10} className={styles.muted}>
                  {t('web_image.empty_tasks', { defaultValue: '暂无绘图任务记录' })}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </Card>
  );

  const renderAnalyticsTab = () => (
    <div className={styles.tabPanel}>
      <div className={styles.metricGrid}>
        <div className={styles.metricCard}>
          <span>{t('web_image.total_accounts', { defaultValue: '绘图账号' })}</span>
          <strong>{accounts.length}</strong>
          <small>{accountSummary.enabled} enabled / {accountSummary.disabled} disabled</small>
        </div>
        <div className={styles.metricCard}>
          <span>{t('web_image.remaining_quota', { defaultValue: '剩余可画次数' })}</span>
          <strong>{accountSummary.remaining}</strong>
          <small>{accountSummary.zeroQuota} zero / {accountSummary.cooling} cooling / {accountSummary.unavailable} unavailable</small>
        </div>
        <div className={styles.metricCard}>
          <span>{t('web_image.task_success_rate', { defaultValue: '任务成功率' })}</span>
          <strong>{formatPercent(taskSummary.successRate)}</strong>
          <small>{taskSummary.success} success / {taskSummary.failed} failed</small>
        </div>
        <div className={styles.metricCard}>
          <span>{t('web_image.total_tasks', { defaultValue: '绘图任务' })}</span>
          <strong>{taskSummary.total}</strong>
          <small>{taskSummary.running} running / {taskSummary.last24h} last 24h</small>
        </div>
        <div className={styles.metricCard}>
          <span>{t('web_image.output_images', { defaultValue: '输出图片' })}</span>
          <strong>{taskSummary.totalOutputs}</strong>
          <small>avg {formatDuration(taskSummary.avgDuration)}</small>
        </div>
        <div className={styles.metricCard}>
          <span>{t('web_image.known_quota_accounts', { defaultValue: '已知额度账号' })}</span>
          <strong>{accountSummary.knownQuota}</strong>
          <small>{accounts.length - accountSummary.knownQuota} unknown</small>
        </div>
      </div>

      <Card title={t('web_image.statistics_analysis', { defaultValue: '绘图统计分析' })}>
        {taskRefreshError ? (
          <div className={styles.error}>
            {t('web_image.task_refresh_failed', { defaultValue: '任务记录刷新失败' })}: {taskRefreshError}
          </div>
        ) : null}
        <div className={styles.analyticsGrid}>
          <section><h3>按状态</h3>{renderDistribution(analytics.byStatus)}</section>
          <section><h3>按模型</h3>{renderDistribution(analytics.byModel)}</section>
          <section><h3>按接口</h3>{renderDistribution(analytics.byEndpoint)}</section>
          <section><h3>每日趋势</h3>{renderDistribution(analytics.trend)}</section>
          <section className={styles.wide}><h3>账号使用分布</h3>{renderDistribution(analytics.byAccount)}</section>
        </div>
      </Card>
    </div>
  );

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{t('web_image.title', { defaultValue: 'Web 绘图账号' })}</h1>
          <p className={styles.description}>
            {t('web_image.description', {
              defaultValue: '独立管理 gpt-image-2 使用的 OpenAI access token、绘图额度、使用情况、任务记录和统计分析。',
            })}
          </p>
        </div>
        <div className={styles.actions}>
          <Button onClick={load} disabled={loading || saving}>{t('common.refresh')}</Button>
        </div>
      </div>

      <div className={styles.tabs}>
        {[
          ['accounts', '账号管理'],
          ['tasks', '任务记录'],
          ['analytics', '统计分析'],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={activeTab === key ? styles.activeTab : undefined}
            onClick={() => setActiveTab(key as ActiveTab)}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'accounts' ? renderAccountsTab() : null}
      {activeTab === 'tasks' ? renderTasksTab() : null}
      {activeTab === 'analytics' ? renderAnalyticsTab() : null}

      {batchOpen ? (
        <div className={styles.modalBackdrop} role="presentation">
          <div className={styles.modal} role="dialog" aria-modal="true">
            <div className={styles.modalHeader}>
              <h2>{t('web_image.batch_import', { defaultValue: '批量导入 AT' })}</h2>
              <Button size="sm" variant="ghost" onClick={() => setBatchOpen(false)}>×</Button>
            </div>
            <textarea
              className={styles.batchTextarea}
              value={batchText}
              onChange={(event) => setBatchText(event.target.value)}
              placeholder={t('web_image.batch_import_placeholder', { defaultValue: '每行一个 access token' })}
              autoFocus
            />
            <div className={styles.modalActions}>
              <Button variant="ghost" onClick={() => setBatchOpen(false)}>{t('common.cancel', { defaultValue: '取消' })}</Button>
              <Button onClick={() => void handleBatchCreate()} disabled={saving}>
                {t('web_image.batch_import', { defaultValue: '批量导入 AT' })}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
