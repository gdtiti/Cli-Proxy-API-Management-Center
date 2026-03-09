/**
 * Batch Proxy Settings Modal - 批量设置代理
 */

import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useNotificationStore } from '@/stores';
import { authFilesApi } from '@/services/api';
import type { AuthFileItem } from '@/types';
import styles from '@/pages/AuthFilesPage.module.scss';

interface BatchProxyModalProps {
  open: boolean;
  onClose: () => void;
  files: AuthFileItem[];
  fileProxies: Record<string, string>;
  existingTypes: string[];
  getTypeLabel: (type: string) => string;
  onComplete?: () => void;
}

export function BatchProxyModal({
  open,
  onClose,
  files,
  fileProxies,
  existingTypes,
  getTypeLabel,
  onComplete,
}: BatchProxyModalProps) {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);

  const [proxyUrl, setProxyUrl] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [processing, setProcessing] = useState(false);

  const handleOpen = useCallback(() => {
    setSelectedFiles(new Set());
    setProxyUrl('');
  }, []);

  // 当弹窗打开时重置状态
  useState(() => {
    if (open) {
      handleOpen();
    }
  });

  const toggleSelection = useCallback((name: string) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }, []);

  const handleBatchSetProxy = useCallback(async () => {
    if (!proxyUrl) {
      showNotification(t('auth_files.proxy_url_required'), 'error');
      return;
    }

    if (selectedFiles.size === 0) {
      showNotification(t('auth_files.proxy_select_required'), 'error');
      return;
    }

    setProcessing(true);
    let successCount = 0;
    let failCount = 0;

    const filesToProcess = Array.from(selectedFiles);

    for (const fileName of filesToProcess) {
      try {
        const content = await authFilesApi.downloadText(fileName);
        let jsonContent: Record<string, unknown>;
        try {
          jsonContent = JSON.parse(content);
        } catch {
          failCount++;
          continue;
        }

        jsonContent.proxy_url = proxyUrl;
        const updatedContent = JSON.stringify(jsonContent, null, 2);

        const blob = new Blob([updatedContent], { type: 'application/json' });
        const file = new File([blob], fileName, { type: 'application/json' });
        await authFilesApi.upload(file);
        successCount++;
      } catch (e) {
        console.error(e);
        failCount++;
      }
    }

    setProcessing(false);
    setProxyUrl('');
    setSelectedFiles(new Set());

    showNotification(
      t('auth_files.batch_proxy_result', {
        success: successCount,
        failed: failCount,
      }),
      failCount > 0 ? 'warning' : 'success'
    );

    onComplete?.();
    onClose();
  }, [proxyUrl, selectedFiles, showNotification, t, onComplete, onClose]);

  const handleClose = useCallback(() => {
    if (!processing) {
      setProxyUrl('');
      setSelectedFiles(new Set());
      onClose();
    }
  }, [processing, onClose]);

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={t('auth_files.proxy_settings_title')}
      width={800}
      footer={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={processing}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleBatchSetProxy} loading={processing}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className={styles.proxyModalContent}>
        <div className={styles.fileListSection}>
          <div className={styles.fileListHeader}>
            <span>{t('auth_files.select_files')}</span>
            <span className={styles.selectionCount}>
              {t('auth_files.selected_count', { count: selectedFiles.size })}
            </span>
          </div>
          <div className={styles.fileList}>
            {existingTypes
              .filter((type) => type !== 'all')
              .map((type) => {
                const typeFiles = files.filter((f) => f.type === type);
                if (typeFiles.length === 0) return null;

                const allSelected = typeFiles.every((f) => selectedFiles.has(f.name));
                const someSelected = typeFiles.some((f) => selectedFiles.has(f.name));

                return (
                  <div key={type} className={styles.typeGroup}>
                    <div
                      className={styles.typeGroupHeader}
                      onClick={() => {
                        if (allSelected) {
                          setSelectedFiles((prev) => {
                            const next = new Set(prev);
                            typeFiles.forEach((f) => next.delete(f.name));
                            return next;
                          });
                        } else {
                          setSelectedFiles((prev) => {
                            const next = new Set(prev);
                            typeFiles.forEach((f) => next.add(f.name));
                            return next;
                          });
                        }
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={allSelected}
                        ref={(input) => {
                          if (input) {
                            input.indeterminate = !allSelected && someSelected;
                          }
                        }}
                        readOnly
                      />
                      <span className={styles.typeGroupLabel}>{getTypeLabel(type)}</span>
                    </div>
                    <div className={styles.typeGroupFiles}>
                      {typeFiles.map((file) => {
                        const hasProxy = !!fileProxies[file.name];
                        return (
                          <div
                            key={file.name}
                            className={`${styles.fileItem} ${selectedFiles.has(file.name) ? styles.fileItemSelected : ''} ${hasProxy ? styles.fileItemHasProxy : ''}`}
                            onClick={() => toggleSelection(file.name)}
                            title={hasProxy ? `Proxy: ${fileProxies[file.name]}` : undefined}
                          >
                            <span className={styles.fileName}>{file.name}</span>
                            {hasProxy && <span className={styles.proxyIndicator} />}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        <div className={styles.proxyConfigSection}>
          <div className={styles.formGroup}>
            <label>{t('auth_files.proxy_url_label')}</label>
            <Input
              value={proxyUrl}
              onChange={(e) => setProxyUrl(e.target.value)}
              placeholder="socks5://yourname:yourpassword@ip:port"
              disabled={processing}
            />
            <div className={styles.hint}>{t('auth_files.proxy_url_hint')}</div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
