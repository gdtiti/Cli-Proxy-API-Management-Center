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

  const summary = useMemo(() => {
    const enabled = accounts.filter((item) => !item.disabled).length;
    const disabled = accounts.length - enabled;
    const remaining = accounts.reduce((sum, item) => {
      const value = item.quota?.image_quota_remaining;
      return typeof value === 'number' && Number.isFinite(value) ? sum + value : sum;
    }, 0);
    return { enabled, disabled, remaining };
  }, [accounts]);

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

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{t('web_image.title', { defaultValue: 'Web 绘图账号' })}</h1>
          <p className={styles.description}>
            {t('web_image.description', {
              defaultValue:
                '独立管理 gpt-image-2 使用的 OpenAI access token、绘图额度和任务记录。',
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
        title={t('web_image.summary', { defaultValue: '概览' })}
        subtitle={`${accounts.length} accounts, ${summary.enabled} enabled, ${summary.disabled} disabled, ${summary.remaining} remaining`}
      />

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

      <Card title={t('web_image.accounts', { defaultValue: '账号列表' })}>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t('common.account', { defaultValue: '账号' })}</th>
                <th>{t('common.status', { defaultValue: '状态' })}</th>
                <th>{t('web_image.quota', { defaultValue: '绘图额度' })}</th>
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
                  </td>
                  <td>
                    <span className={styles.badge}>{item.disabled ? 'disabled' : item.status || 'active'}</span>
                  </td>
                  <td>{quotaText(item)}</td>
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
                  <td colSpan={5} className={styles.muted}>
                    {t('web_image.empty_accounts', { defaultValue: '暂无 OpenAI AT 绘图账号' })}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title={t('web_image.tasks', { defaultValue: '绘图任务记录' })}>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>ID</th>
                <th>Model</th>
                <th>Prompt</th>
                <th>Status</th>
                <th>Outputs</th>
                <th>Started</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <tr key={task.id}>
                  <td>{task.id}</td>
                  <td>{task.model || '-'}</td>
                  <td className={styles.prompt}>{task.prompt || '-'}</td>
                  <td><span className={styles.badge}>{task.status || '-'}</span></td>
                  <td>{task.output_count ?? task.output_files?.length ?? 0}</td>
                  <td>{formatDate(task.started_at)}</td>
                  <td className={styles.error}>{task.error || '-'}</td>
                </tr>
              ))}
              {tasks.length === 0 ? (
                <tr>
                  <td colSpan={7} className={styles.muted}>
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
