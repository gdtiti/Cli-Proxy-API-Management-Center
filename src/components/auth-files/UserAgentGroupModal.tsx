/**
 * User-Agent Group Settings Modal - 用于设置和批量随机化 User-Agent
 */

import { useCallback, useEffect, useState } from 'react';
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

interface UserAgentGroupModalProps {
  open: boolean;
  onClose: () => void;
  files: AuthFileItem[];
  onBatchComplete?: () => void;
}

export function UserAgentGroupModal({ open, onClose, files, onBatchComplete }: UserAgentGroupModalProps) {
  const { t } = useTranslation();
  const { showNotification } = useNotificationStore();

  const [group1, setGroup1] = useState<string[]>(DEFAULT_GROUP1);
  const [group2, setGroup2] = useState<string[]>(DEFAULT_GROUP2);
  const [group1Text, setGroup1Text] = useState('');
  const [group2Text, setGroup2Text] = useState('');
  const [processing, setProcessing] = useState(false);

  // 从 localStorage 加载设置
  useEffect(() => {
    const savedGroup1 = localStorage.getItem(STORAGE_KEY_GROUP1);
    const savedGroup2 = localStorage.getItem(STORAGE_KEY_GROUP2);
    
    if (savedGroup1) {
      try {
        setGroup1(JSON.parse(savedGroup1));
      } catch { /* ignore */ }
    }
    if (savedGroup2) {
      try {
        setGroup2(JSON.parse(savedGroup2));
      } catch { /* ignore */ }
    }
  }, []);

  // 当弹窗打开时，将当前设置加载到文本框
  useEffect(() => {
    if (open) {
      setGroup1Text(group1.join('\n'));
      setGroup2Text(group2.join('\n'));
    }
  }, [open, group1, group2]);

  const handleSave = useCallback(() => {
    const g1 = group1Text.split('\n').map(s => s.trim()).filter(Boolean);
    const g2 = group2Text.split('\n').map(s => s.trim()).filter(Boolean);
    
    setGroup1(g1);
    setGroup2(g2);
    localStorage.setItem(STORAGE_KEY_GROUP1, JSON.stringify(g1));
    localStorage.setItem(STORAGE_KEY_GROUP2, JSON.stringify(g2));
    
    onClose();
    showNotification(t('common.save'), 'success');
  }, [group1Text, group2Text, onClose, showNotification, t]);

  const handleBatchRandomize = useCallback(async () => {
    const g1 = group1Text.split('\n').map(s => s.trim()).filter(Boolean);
    const g2 = group2Text.split('\n').map(s => s.trim()).filter(Boolean);

    if (g1.length === 0 || g2.length === 0) {
      showNotification(t('auth_files.groups_empty'), 'error');
      return;
    }

    if (!window.confirm(t('auth_files.batch_ua_confirm'))) {
      return;
    }

    setProcessing(true);
    let successCount = 0;
    let failCount = 0;

    // 只处理 antigravity 类型的文件
    const targetFiles = files.filter(f => f.type === 'antigravity');

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

        const p1 = g1[Math.floor(Math.random() * g1.length)];
        const p2 = g2[Math.floor(Math.random() * g2.length)];
        const newUserAgent = `${p1} ${p2}`;

        jsonContent.user_agent = newUserAgent;
        const updatedContent = JSON.stringify(jsonContent, null, 2);

        const blob = new Blob([updatedContent], { type: 'application/json' });
        const file = new File([blob], item.name, { type: 'application/json' });
        await authFilesApi.upload(file);
        successCount++;
      } catch (e) {
        console.error(e);
        failCount++;
      }
    }

    setProcessing(false);
    
    // 保存设置
    setGroup1(g1);
    setGroup2(g2);
    localStorage.setItem(STORAGE_KEY_GROUP1, JSON.stringify(g1));
    localStorage.setItem(STORAGE_KEY_GROUP2, JSON.stringify(g2));

    showNotification(
      t('auth_files.batch_ua_result', { 
        success: successCount,
        failed: failCount
      }), 
      failCount > 0 ? 'warning' : 'success'
    );

    onBatchComplete?.();
    onClose();
  }, [group1Text, group2Text, files, showNotification, t, onBatchComplete, onClose]);

  return (
    <Modal
      open={open}
      onClose={onClose}
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
            <Button variant="secondary" onClick={onClose} disabled={processing}>
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
          value={group1Text}
          onChange={(e) => setGroup1Text(e.target.value)}
          placeholder="antigravity/1.14.2..."
          disabled={processing}
        />
      </div>
      <div className={styles.formGroup}>
        <label>{t('auth_files.group_settings_os_arch_label')}</label>
        <textarea
          className={styles.textarea}
          rows={5}
          value={group2Text}
          onChange={(e) => setGroup2Text(e.target.value)}
          placeholder="windows/amd64..."
          disabled={processing}
        />
      </div>
    </Modal>
  );
}

// 导出 hooks 用于快速设置单个文件的 User-Agent
export function useQuickSetUserAgent() {
  const { t } = useTranslation();
  const { showNotification } = useNotificationStore();
  const [quickSetting, setQuickSetting] = useState<string | null>(null);

  const quickSetUserAgent = useCallback(async (item: AuthFileItem, onComplete?: () => void) => {
    if (quickSetting) return;

    // 从 localStorage 获取设置
    let group1 = DEFAULT_GROUP1;
    let group2 = DEFAULT_GROUP2;

    const savedGroup1 = localStorage.getItem(STORAGE_KEY_GROUP1);
    const savedGroup2 = localStorage.getItem(STORAGE_KEY_GROUP2);
    
    if (savedGroup1) {
      try {
        group1 = JSON.parse(savedGroup1);
      } catch { /* ignore */ }
    }
    if (savedGroup2) {
      try {
        group2 = JSON.parse(savedGroup2);
      } catch { /* ignore */ }
    }

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
      const newUserAgent = `${p1} ${p2}`;

      jsonContent.user_agent = newUserAgent;
      const updatedContent = JSON.stringify(jsonContent, null, 2);

      const blob = new Blob([updatedContent], { type: 'application/json' });
      const file = new File([blob], item.name, { type: 'application/json' });
      await authFilesApi.upload(file);

      showNotification(t('auth_files.quick_set_ua_success'), 'success');
      onComplete?.();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : '';
      showNotification(`${t('notification.save_failed')}: ${errorMessage}`, 'error');
    } finally {
      setQuickSetting(null);
    }
  }, [quickSetting, showNotification, t]);

  return { quickSetting, quickSetUserAgent };
}
