import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useNotificationStore } from '@/stores';
import { authFilesApi } from '@/services/api';
import type { AuthFileItem } from '@/types';
import styles from '@/pages/AuthFilesPage.module.scss';

const STORAGE_KEY_GROUP1 = 'auth_files_group1';
const STORAGE_KEY_GROUP2 = 'auth_files_group2';

const DEFAULT_GROUP1 = ['antigravity/1.14.2', 'antigravity/1.13.3', 'antigravity/1.12.4'];
const DEFAULT_GROUP2 = ['windows/amd64', 'darwin/arm64'];

const parseStoredGroup = (storageKey: string, fallback: string[]): string[] => {
  if (typeof window === 'undefined') return fallback;
  const raw = localStorage.getItem(storageKey);
  if (!raw) return fallback;

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return fallback;
    const normalized = parsed.map((item) => String(item).trim()).filter(Boolean);
    return normalized.length > 0 ? normalized : fallback;
  } catch {
    return fallback;
  }
};

const parseGroupInput = (value: string): string[] =>
  value
    .split('\n')
    .map((segment) => segment.trim())
    .filter(Boolean);

const saveGroups = (group1: string[], group2: string[]) => {
  localStorage.setItem(STORAGE_KEY_GROUP1, JSON.stringify(group1));
  localStorage.setItem(STORAGE_KEY_GROUP2, JSON.stringify(group2));
};

interface UserAgentGroupModalProps {
  open: boolean;
  onClose: () => void;
  files: AuthFileItem[];
  onBatchComplete?: () => void;
}

export function UserAgentGroupModal({ open, onClose, files, onBatchComplete }: UserAgentGroupModalProps) {
  const { t } = useTranslation();
  const { showNotification } = useNotificationStore();

  const [group1, setGroup1] = useState<string[]>(() =>
    parseStoredGroup(STORAGE_KEY_GROUP1, DEFAULT_GROUP1)
  );
  const [group2, setGroup2] = useState<string[]>(() =>
    parseStoredGroup(STORAGE_KEY_GROUP2, DEFAULT_GROUP2)
  );
  const [group1Text, setGroup1Text] = useState<string | null>(null);
  const [group2Text, setGroup2Text] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const currentGroup1Text = group1Text ?? group1.join('\n');
  const currentGroup2Text = group2Text ?? group2.join('\n');

  const handleClose = useCallback(() => {
    setGroup1Text(null);
    setGroup2Text(null);
    onClose();
  }, [onClose]);

  const handleSave = useCallback(() => {
    const nextGroup1 = parseGroupInput(currentGroup1Text);
    const nextGroup2 = parseGroupInput(currentGroup2Text);

    setGroup1(nextGroup1);
    setGroup2(nextGroup2);
    saveGroups(nextGroup1, nextGroup2);

    handleClose();
    showNotification(t('common.save'), 'success');
  }, [currentGroup1Text, currentGroup2Text, handleClose, showNotification, t]);

  const handleBatchRandomize = useCallback(async () => {
    const nextGroup1 = parseGroupInput(currentGroup1Text);
    const nextGroup2 = parseGroupInput(currentGroup2Text);

    if (nextGroup1.length === 0 || nextGroup2.length === 0) {
      showNotification(t('auth_files.groups_empty'), 'error');
      return;
    }

    if (!window.confirm(t('auth_files.batch_ua_confirm'))) {
      return;
    }

    setProcessing(true);
    let successCount = 0;
    let failCount = 0;

    const targetFiles = files.filter((file) => file.type === 'antigravity');

    for (const item of targetFiles) {
      try {
        const content = await authFilesApi.downloadText(item.name);
        let jsonContent: Record<string, unknown>;
        try {
          jsonContent = JSON.parse(content);
        } catch {
          failCount++;
          continue;
        }

        const p1 = nextGroup1[Math.floor(Math.random() * nextGroup1.length)];
        const p2 = nextGroup2[Math.floor(Math.random() * nextGroup2.length)];
        jsonContent.user_agent = `${p1} ${p2}`;

        const updatedContent = JSON.stringify(jsonContent, null, 2);
        const blob = new Blob([updatedContent], { type: 'application/json' });
        const file = new File([blob], item.name, { type: 'application/json' });
        await authFilesApi.upload(file);
        successCount++;
      } catch (error) {
        console.error(error);
        failCount++;
      }
    }

    setProcessing(false);

    setGroup1(nextGroup1);
    setGroup2(nextGroup2);
    saveGroups(nextGroup1, nextGroup2);

    showNotification(
      t('auth_files.batch_ua_result', {
        success: successCount,
        failed: failCount,
      }),
      failCount > 0 ? 'warning' : 'success'
    );

    onBatchComplete?.();
    handleClose();
  }, [currentGroup1Text, currentGroup2Text, files, handleClose, onBatchComplete, showNotification, t]);

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={t('auth_files.group_settings_title')}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
          <Button
            variant="danger"
            onClick={handleBatchRandomize}
            loading={processing}
            disabled={processing}
          >
            {t('auth_files.batch_randomize_ua')}
          </Button>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button variant="secondary" onClick={handleClose} disabled={processing}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleSave} disabled={processing}>
              {t('common.save')}
            </Button>
          </div>
        </div>
      }
    >
      <div className={styles.formGroup}>
        <label>{t('auth_files.group_settings_version_label')}</label>
        <textarea
          className={styles.textarea}
          rows={5}
          value={currentGroup1Text}
          onChange={(event) => setGroup1Text(event.target.value)}
          placeholder="antigravity/1.14.2..."
          disabled={processing}
        />
      </div>
      <div className={styles.formGroup}>
        <label>{t('auth_files.group_settings_os_arch_label')}</label>
        <textarea
          className={styles.textarea}
          rows={5}
          value={currentGroup2Text}
          onChange={(event) => setGroup2Text(event.target.value)}
          placeholder="windows/amd64..."
          disabled={processing}
        />
      </div>
    </Modal>
  );
}

export function useQuickSetUserAgent() {
  const { t } = useTranslation();
  const { showNotification } = useNotificationStore();
  const [quickSetting, setQuickSetting] = useState<string | null>(null);

  const quickSetUserAgent = useCallback(
    async (item: AuthFileItem, onComplete?: () => void) => {
      if (quickSetting) return;

      const group1 = parseStoredGroup(STORAGE_KEY_GROUP1, DEFAULT_GROUP1);
      const group2 = parseStoredGroup(STORAGE_KEY_GROUP2, DEFAULT_GROUP2);

      if (group1.length === 0 || group2.length === 0) {
        showNotification(t('auth_files.groups_empty'), 'error');
        return;
      }

      setQuickSetting(item.name);
      try {
        const content = await authFilesApi.downloadText(item.name);

        let jsonContent: Record<string, unknown>;
        try {
          jsonContent = JSON.parse(content);
        } catch {
          throw new Error(t('auth_files.edit_invalid_json'));
        }

        const p1 = group1[Math.floor(Math.random() * group1.length)];
        const p2 = group2[Math.floor(Math.random() * group2.length)];
        jsonContent.user_agent = `${p1} ${p2}`;

        const updatedContent = JSON.stringify(jsonContent, null, 2);
        const blob = new Blob([updatedContent], { type: 'application/json' });
        const file = new File([blob], item.name, { type: 'application/json' });
        await authFilesApi.upload(file);

        showNotification(t('auth_files.quick_set_ua_success'), 'success');
        onComplete?.();
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : '';
        showNotification(`${t('notification.save_failed')}: ${errorMessage}`, 'error');
      } finally {
        setQuickSetting(null);
      }
    },
    [quickSetting, showNotification, t]
  );

  return { quickSetting, quickSetUserAgent };
}
