/**
 * Antigravity 凭证导入对话框组件
 */

import { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { IconDownload, IconCheck, IconX } from '@/components/ui/icons';
import { useNotificationStore } from '@/stores';
import { authFilesApi } from '@/services/api';
import {
  validateAntigravityFile,
  isAntigravityFileName,
} from '@/services/antigravity/validator';
import {
  convertAntigravityFile,
  downloadCredentials,
  createUploadFile,
} from '@/services/antigravity/converter';
import type { AntigravityPreviewItem, ImportResult } from '@/types/antigravity';
import { AntigravityPreviewTable } from './AntigravityPreviewTable';
import styles from './AntigravityImport.module.scss';

interface AntigravityImportModalProps {
  open: boolean;
  onClose: () => void;
  onImportComplete?: () => void;
}

type ImportStep = 'upload' | 'preview' | 'importing' | 'result';

export function AntigravityImportModal({
  open,
  onClose,
  onImportComplete,
}: AntigravityImportModalProps) {
  const { t } = useTranslation();
  const { showNotification } = useNotificationStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<ImportStep>('upload');
  const [fileName, setFileName] = useState('');
  const [previewItems, setPreviewItems] = useState<AntigravityPreviewItem[]>([]);
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [, setImporting] = useState(false);

  // 重置状态
  const resetState = useCallback(() => {
    setStep('upload');
    setFileName('');
    setPreviewItems([]);
    setValidationWarnings([]);
    setImportResult(null);
    setImporting(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  // 处理关闭
  const handleClose = useCallback(() => {
    resetState();
    onClose();
  }, [resetState, onClose]);

  // 处理文件选择
  const handleFileSelect = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      // 检查文件类型
      if (!file.name.endsWith('.json')) {
        showNotification(
          t('antigravity.error_not_json', { defaultValue: '请选择 JSON 文件' }),
          'error'
        );
        return;
      }

      // 检查文件名格式（可选警告）
      if (!isAntigravityFileName(file.name)) {
        console.warn('File name does not match expected Antigravity format');
      }

      setFileName(file.name);

      try {
        const content = await file.text();
        const validation = validateAntigravityFile(content);

        if (!validation.valid) {
          showNotification(
            `${t('antigravity.validation_failed', { defaultValue: '验证失败' })}: ${validation.errors[0]}`,
            'error'
          );
          return;
        }

        setValidationWarnings(validation.warnings);
        const items = convertAntigravityFile(validation.data!);
        setPreviewItems(items);
        setStep('preview');
      } catch (err) {
        showNotification(
          t('antigravity.error_reading_file', { defaultValue: '读取文件失败' }) +
            ': ' +
            (err instanceof Error ? err.message : ''),
          'error'
        );
      }
    },
    [showNotification, t]
  );

  // 切换选择状态
  const handleToggleSelect = useCallback((id: string) => {
    setPreviewItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, selected: !item.selected } : item
      )
    );
  }, []);

  // 全选/取消全选
  const handleToggleAll = useCallback((selected: boolean) => {
    setPreviewItems((prev) => prev.map((item) => ({ ...item, selected })));
  }, []);

  // 下载选中的凭证文件
  const handleDownload = useCallback(async () => {
    const selectedItems = previewItems.filter((item) => item.selected);
    if (selectedItems.length === 0) {
      showNotification(
        t('antigravity.no_items_selected', { defaultValue: '请选择要导出的凭证' }),
        'warning'
      );
      return;
    }

    try {
      await downloadCredentials(selectedItems);
      showNotification(
        t('antigravity.download_success', {
          defaultValue: '已下载 {{count}} 个凭证文件',
          count: selectedItems.length,
        }),
        'success'
      );
    } catch (err) {
      showNotification(
        t('antigravity.download_failed', { defaultValue: '下载失败' }),
        'error'
      );
    }
  }, [previewItems, showNotification, t]);

  // 直接导入到服务器
  const handleImport = useCallback(async () => {
    const selectedItems = previewItems.filter((item) => item.selected);
    if (selectedItems.length === 0) {
      showNotification(
        t('antigravity.no_items_selected', { defaultValue: '请选择要导入的凭证' }),
        'warning'
      );
      return;
    }

    setImporting(true);
    setStep('importing');

    const result: ImportResult = {
      total: selectedItems.length,
      success: 0,
      failed: 0,
      skipped: 0,
    };
    const updatedItems = [...previewItems];

    for (const item of selectedItems) {
      const index = updatedItems.findIndex((i) => i.id === item.id);
      if (index === -1) continue;

      try {
        const file = createUploadFile(item);
        await authFilesApi.upload(file);
        updatedItems[index] = { ...updatedItems[index], status: 'success' };
        result.success++;
      } catch (err) {
        updatedItems[index] = {
          ...updatedItems[index],
          status: 'error',
          errorMessage: err instanceof Error ? err.message : 'Unknown error',
        };
        result.failed++;
      }

      setPreviewItems([...updatedItems]);
    }

    // 标记未选中的为 skipped
    updatedItems.forEach((item, index) => {
      if (!item.selected && item.status === 'pending') {
        updatedItems[index] = { ...updatedItems[index], status: 'skipped' };
        result.skipped++;
      }
    });

    setPreviewItems(updatedItems);
    setImportResult(result);
    setImporting(false);
    setStep('result');

    if (result.success > 0) {
      onImportComplete?.();
    }
  }, [previewItems, showNotification, t, onImportComplete]);

  // 渲染上传步骤
  const renderUploadStep = () => (
    <div className={styles.uploadArea}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        onChange={handleFileSelect}
        className={styles.fileInput}
      />
      <div
        className={styles.dropZone}
        onClick={() => fileInputRef.current?.click()}
      >
        <IconDownload size={48} className={styles.uploadIcon} />
        <p className={styles.uploadText}>
          {t('antigravity.drop_or_click', { defaultValue: '点击选择文件' })}
        </p>
        <p className={styles.uploadHint}>
          {t('antigravity.file_format_hint', {
            defaultValue: '支持 Antigravity 导出的 JSON 文件',
          })}
        </p>
      </div>
    </div>
  );

  // 渲染预览步骤
  const renderPreviewStep = () => {
    const selectedCount = previewItems.filter((item) => item.selected).length;

    return (
      <div className={styles.previewContainer}>
        {validationWarnings.length > 0 && (
          <div className={styles.warningBox}>
            {validationWarnings.map((warning, index) => (
              <div key={index}>{warning}</div>
            ))}
          </div>
        )}

        <div className={styles.previewHeader}>
          <span className={styles.fileInfo}>
            {t('antigravity.file', { defaultValue: '文件' })}: {fileName} (
            {previewItems.length}{' '}
            {t('antigravity.accounts', { defaultValue: '个账号' })})
          </span>
          <span className={styles.selectedInfo}>
            {t('antigravity.selected', { defaultValue: '已选择' })}:{' '}
            {selectedCount}
          </span>
        </div>

        <AntigravityPreviewTable
          items={previewItems}
          onToggleSelect={handleToggleSelect}
          onToggleAll={handleToggleAll}
        />
      </div>
    );
  };

  // 渲染导入中步骤
  const renderImportingStep = () => {
    const completed = previewItems.filter(
      (item) => item.status === 'success' || item.status === 'error'
    ).length;
    const total = previewItems.filter((item) => item.selected).length;

    return (
      <div className={styles.importingContainer}>
        <LoadingSpinner size={48} />
        <p className={styles.importingText}>
          {t('antigravity.importing', { defaultValue: '正在导入...' })} (
          {completed}/{total})
        </p>
        <div className={styles.progressBar}>
          <div
            className={styles.progressFill}
            style={{ width: `${total > 0 ? (completed / total) * 100 : 0}%` }}
          />
        </div>
      </div>
    );
  };

  // 渲染结果步骤
  const renderResultStep = () => {
    if (!importResult) return null;

    return (
      <div className={styles.resultContainer}>
        <div className={styles.resultSummary}>
          <div className={styles.resultItem}>
            <IconCheck size={20} className={styles.successIcon} />
            <span>
              {t('antigravity.result_success', {
                defaultValue: '成功: {{count}}',
                count: importResult.success,
              })}
            </span>
          </div>
          {importResult.failed > 0 && (
            <div className={styles.resultItem}>
              <IconX size={20} className={styles.errorIcon} />
              <span>
                {t('antigravity.result_failed', {
                  defaultValue: '失败: {{count}}',
                  count: importResult.failed,
                })}
              </span>
            </div>
          )}
        </div>

        {importResult.failed > 0 && (
          <div className={styles.failedList}>
            <p className={styles.failedTitle}>
              {t('antigravity.failed_items', { defaultValue: '失败项目' })}:
            </p>
            {previewItems
              .filter((item) => item.status === 'error')
              .map((item) => (
                <div key={item.id} className={styles.failedItem}>
                  <span>{item.original.email}</span>
                  <span className={styles.errorMessage}>
                    {item.errorMessage}
                  </span>
                </div>
              ))}
          </div>
        )}
      </div>
    );
  };

  // 渲染 Footer
  const renderFooter = () => {
    switch (step) {
      case 'upload':
        return (
          <Button variant="secondary" onClick={handleClose}>
            {t('common.cancel', { defaultValue: '取消' })}
          </Button>
        );

      case 'preview':
        return (
          <>
            <Button variant="secondary" onClick={resetState}>
              {t('antigravity.back', { defaultValue: '返回' })}
            </Button>
            <Button variant="secondary" onClick={handleDownload}>
              {t('antigravity.download_selected', { defaultValue: '下载选中' })}
            </Button>
            <Button
              onClick={handleImport}
              disabled={previewItems.every((i) => !i.selected)}
            >
              {t('antigravity.import_to_server', { defaultValue: '导入到服务器' })}
            </Button>
          </>
        );

      case 'importing':
        return null;

      case 'result':
        return (
          <>
            <Button variant="secondary" onClick={resetState}>
              {t('antigravity.import_more', { defaultValue: '继续导入' })}
            </Button>
            <Button onClick={handleClose}>
              {t('common.done', { defaultValue: '完成' })}
            </Button>
          </>
        );

      default:
        return null;
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={t('antigravity.import_title', { defaultValue: '导入 Antigravity 凭证' })}
      width={720}
      footer={renderFooter()}
    >
      {step === 'upload' && renderUploadStep()}
      {step === 'preview' && renderPreviewStep()}
      {step === 'importing' && renderImportingStep()}
      {step === 'result' && renderResultStep()}
    </Modal>
  );
}
