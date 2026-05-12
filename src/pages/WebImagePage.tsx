import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { webImageApi, type WebImageAuthAccount, type WebImageTask } from '@/services/api';
import { useNotificationStore } from '@/stores';
import styles from './WebImagePage.module.scss';

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

const quotaText = (item: WebImageAuthAccount) => {
  const quota = item.quota;
  if (!quota || quota.image_quota_unknown) return 'unknown';
  const remaining = quota.image_quota_remaining;
  const reset = quota.image_quota_restore_at
    ? formatDate(quota.image_quota_restore_at)
    : quota.image_quota_reset_after_seconds
      ? `${quota.image_quota_reset_after_seconds}s`
      : '-';
  return `${remaining ?? '-'} / reset ${reset}`;
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

export function WebImagePage() {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const [accounts, setAccounts] = useState<WebImageAuthAccount[]>([]);
  const [tasks, setTasks] = useState<WebImageTask[]>([]);
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextAccounts, nextTasks] = await Promise.all([
        webImageApi.listAuths(),
        webImageApi.listTasks(),
      ]);
      setAccounts(nextAccounts);
      setTasks(nextTasks);
    } catch (error: unknown) {
      showNotification(error instanceof Error ? error.message : String(error), 'error');
    } finally {
      setLoading(false);
    }
  }, [showNotification]);

  useEffect(() => {
    void load();
  }, [load]);

  const accountSummary = useMemo(() => {
    const enabled = accounts.filter((item) => !item.disabled).length;
    const disabled = accounts.length - enabled;
    const unavailable = accounts.filter((item) => item.unavailable).length;
    const cooling = accounts.filter(isCooling).length;
    const knownQuota = accounts.filter((item) => item.quota && !item.quota.image_quota_unknown).length;
    const zeroQuota = accounts.filter((item) => {
      const remaining = item.quota?.image_quota_remaining;
      return typeof remaining === 'number' && remaining <= 0;
    }).length;
    const remaining = accounts.reduce((sum, item) => {
      const value = item.quota?.image_quota_remaining;
      return typeof value === 'number' && Number.isFinite(value) ? sum + value : sum;
    }, 0);
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
    setSaving(true);
    try {
      await webImageApi.refreshQuota();
      await load();
      showNotification(t('web_image.quota_refreshed', { defaultValue: '绘图额度已刷新' }), 'success');
    } catch (error: unknown) {
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
        {items.slice(0, 8).map((item) => (
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

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{t('web_image.title', { defaultValue: 'Web 绘图账号' })}</h1>
          <p className={styles.description}>
            {t('web_image.description', {
              defaultValue:
                '独立管理 gpt-image-2 使用的 OpenAI access token、绘图额度、使用情况、任务记录和统计分析。',
            })}
          </p>
        </div>
        <div className={styles.actions}>
          <Button onClick={load} disabled={loading || saving}>
            {t('common.refresh')}
          </Button>
          <Button onClick={handleImport} disabled={saving}>
            {t('web_image.import_codex', { defaultValue: '从 Codex 同步 AT' })}
          </Button>
          <Button onClick={handleRefreshQuota} disabled={saving}>
            {t('web_image.refresh_quota', { defaultValue: '刷新绘图额度' })}
          </Button>
        </div>
      </div>

      <Card
        title={t('web_image.independent_management', { defaultValue: '绘图独立管理' })}
        subtitle={t('web_image.independent_management_desc', {
          defaultValue: 'OpenAI AT 账号、图片额度、绘图任务与文件记录在这里独立观察和维护。',
        })}
      >
        <div className={styles.metricGrid}>
          <div className={styles.metricCard}>
            <span>{t('web_image.total_accounts', { defaultValue: '绘图账号' })}</span>
            <strong>{accounts.length}</strong>
            <small>{accountSummary.enabled} enabled / {accountSummary.disabled} disabled</small>
          </div>
          <div className={styles.metricCard}>
            <span>{t('web_image.known_quota_accounts', { defaultValue: '已知额度账号' })}</span>
            <strong>{accountSummary.knownQuota}</strong>
            <small>{accountSummary.zeroQuota} zero quota / {accountSummary.cooling} cooling</small>
          </div>
          <div className={styles.metricCard}>
            <span>{t('web_image.remaining_quota', { defaultValue: '剩余可画次数' })}</span>
            <strong>{accountSummary.remaining}</strong>
            <small>{accountSummary.unavailable} unavailable</small>
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
        </div>
      </Card>

      <div className={styles.twoColumn}>
        <Card title={t('web_image.add_account', { defaultValue: '添加 OpenAI AT' })}>
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
            <Button onClick={handleCreate} disabled={saving}>
              {t('common.save')}
            </Button>
          </div>
        </Card>

        <Card title={t('web_image.statistics_analysis', { defaultValue: '绘图统计分析' })}>
          <div className={styles.analyticsGrid}>
            <section>
              <h3>{t('web_image.by_status', { defaultValue: '按状态' })}</h3>
              {renderDistribution(analytics.byStatus)}
            </section>
            <section>
              <h3>{t('web_image.by_model', { defaultValue: '按模型' })}</h3>
              {renderDistribution(analytics.byModel)}
            </section>
            <section>
              <h3>{t('web_image.by_endpoint', { defaultValue: '按接口' })}</h3>
              {renderDistribution(analytics.byEndpoint)}
            </section>
            <section>
              <h3>{t('web_image.daily_trend', { defaultValue: '每日趋势' })}</h3>
              {renderDistribution(analytics.trend)}
            </section>
          </div>
        </Card>
      </div>

      <Card title={t('web_image.accounts', { defaultValue: '绘图账号独立列表' })}>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t('common.account', { defaultValue: '账号' })}</th>
                <th>{t('web_image.account_type', { defaultValue: '账号类型' })}</th>
                <th>{t('common.status', { defaultValue: '状态' })}</th>
                <th>{t('web_image.quota', { defaultValue: '绘图额度' })}</th>
                <th>{t('web_image.restore_at', { defaultValue: '恢复时间' })}</th>
                <th>{t('web_image.refreshed_at', { defaultValue: '刷新时间' })}</th>
                <th>{t('common.actions', { defaultValue: '操作' })}</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((item) => (
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
              {accounts.length === 0 ? (
                <tr>
                  <td colSpan={7} className={styles.muted}>
                    {t('web_image.empty_accounts', { defaultValue: '暂无 OpenAI AT 绘图账号' })}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title={t('web_image.usage_by_account', { defaultValue: '账号使用分布' })}>
        {renderDistribution(analytics.byAccount)}
      </Card>

      <Card title={t('web_image.tasks', { defaultValue: '绘图任务、使用情况与文件记录' })}>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>ID</th>
                <th>Model / Endpoint</th>
                <th>Account</th>
                <th>Prompt</th>
                <th>Status</th>
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
                    {task.http_status ? <span className={styles.badge}>HTTP {task.http_status}</span> : null}
                  </td>
                  <td>
                    <div>{task.input_count ?? 0} input / {task.output_count ?? task.output_files?.length ?? 0} output</div>
                    <div className={styles.muted}>{formatDuration(task.duration_millis)}</div>
                  </td>
                  <td>
                    <div className={styles.fileBlock}>
                      <span>{t('web_image.upload_files', { defaultValue: '上传' })}</span>
                      {fileList(task.upload_files)}
                    </div>
                    <div className={styles.fileBlock}>
                      <span>{t('web_image.output_files', { defaultValue: '输出' })}</span>
                      {fileList(task.output_files)}
                    </div>
                    <div className={styles.fileBlock}>
                      <span>{t('web_image.request_log_file', { defaultValue: '请求日志' })}</span>
                      {task.request_log_file ? <code>{task.request_log_file}</code> : '-'}
                    </div>
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
                  <td colSpan={9} className={styles.muted}>
                    {t('web_image.empty_tasks', { defaultValue: '暂无绘图任务记录' })}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
