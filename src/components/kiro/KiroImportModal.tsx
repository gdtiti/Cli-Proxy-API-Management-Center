/**
 * Kiro 凭证导入模态框组件
 * 四步工作流: upload → preview → importing → result
 */

import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { validateKiroFile, isKiroFileName } from '@/services/kiro/validator';
import {
  convertKiroFile,
  downloadCredentials,
  createUploadFile,
} from '@/services/kiro/converter';
import { authFilesApi } from '@/services/api';
import type { KiroPreviewItem, KiroImportResult } from '@/types/kiro';
import { KiroPreviewTable } from './KiroPreviewTable';
import styles from './KiroImport.module.scss';

interface KiroImportModalProps {
  open: boolean;
  onClose: () => void;
  onImportComplete?: () => void;
}

type ImportStep = 'upload' | 'preview' | 'importing' | 'result';

export function KiroImportModal({
  open,
  onClose,
  onImportComplete,
}: KiroImportModalProps) {
  const { t } = useTranslation();

  // 状态管理
  const [step, setStep] = useState<ImportStep>('upload');
  const [fileName, setFileName] = useState('');
  const [previewItems, setPreviewItems] = useState<KiroPreviewItem[]>([]);
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);
  const [importResult, setImportResult] = useState<KiroImportResult | null>(null);
  const [, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);

  // 重置状态
  const resetState = useCallback(() => {
    setStep('upload');
    setFileName('');
    setPreviewItems([]);
    setValidationWarnings([]);
    setImportResult(null);
    setImporting(false);
    setImportProgress(0);
  }, []);

  // 关闭模态框
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
        alert(t('kiro.error_not_json', { defaultValue: '请选择 JSON 文件' }));
        return;
      }

      setFileName(file.name);

      // 读取文件内容
      try {
        const content = await file.text();
        const result = validateKiroFile(content, file.name);

        if (!result.valid) {
          alert(
            `${t('kiro.validation_failed', { defaultValue: '验证失败' })}:\n${result.errors.join('\n')}`
          );
          return;
        }

        // 检查文件名格式
        const warnings = [...result.warnings];
        if (!isKiroFileName(file.name)) {
          warnings.unshift(
            t('kiro.warning_filename', {
              defaultValue: '文件名不符合 Kiro 导出格式，请确认文件来源',
            })
          );
        }

        setValidationWarnings(warnings);
        setPreviewItems(convertKiroFile(result.data!));
        setStep('preview');
      } catch {
        alert(t('kiro.error_reading_file', { defaultValue: '读取文件失败' }));
      }
    },
    [t]
  );

  // 切换选择
  const handleToggleSelect = useCallback((id: string) => {
    setPreviewItems((items) =>
      items.map((item) =>
        item.id === id ? { ...item, selected: !item.selected } : item
      )
    );
  }, []);

  // 全选/取消全选
  const handleToggleAll = useCallback((selected: boolean) => {
    setPreviewItems((items) =>
      items.map((item) =>
        item.status === 'pending' ? { ...item, selected } : item
      )
    );
  }, []);

  // 下载选中的凭证
  const handleDownload = useCallback(async () => {
    const selectedItems = previewItems.filter((item) => item.selected);
    if (selectedItems.length === 0) {
      alert(t('kiro.no_items_selected', { defaultValue: '请选择要处理的凭证' }));
      return;
    }

    try {
      await downloadCredentials(previewItems);
      alert(
        t('kiro.download_success', {
          defaultValue: '已下载 {{count}} 个凭证文件',
          count: selectedItems.length,
        })
      );
    } catch {
      alert(t('kiro.download_failed', { defaultValue: '下载失败' }));
    }
  }, [previewItems, t]);

  // 导入到服务器
  const handleImportToServer = useCallback(async () => {
    const selectedItems = previewItems.filter((item) => item.selected);
    if (selectedItems.length === 0) {
      alert(t('kiro.no_items_selected', { defaultValue: '请选择要处理的凭证' }));
      return;
    }

    setStep('importing');
    setImporting(true);
    setImportProgress(0);

    const result: KiroImportResult = {
      total: selectedItems.length,
      success: 0,
      failed: 0,
      skipped: 0,
    };

    const updatedItems = [...previewItems];

    for (let i = 0; i < previewItems.length; i++) {
      const item = previewItems[i];

      if (!item.selected) {
        updatedItems[i] = { ...updatedItems[i], status: 'skipped' };
        result.skipped++;
        continue;
      }

      try {
        const file = createUploadFile(item);
        await authFilesApi.upload(file);
        updatedItems[i] = { ...updatedItems[i], status: 'success' };
        result.success++;
      } catch (err) {
        updatedItems[i] = {
          ...updatedItems[i],
          status: 'error',
          errorMessage: err instanceof Error ? err.message : 'Unknown error',
        };
        result.failed++;
      }

      setPreviewItems([...updatedItems]);
      setImportProgress(((i + 1) / previewItems.length) * 100);

      // 添加小延迟
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    setImporting(false);
    setImportResult(result);
    setStep('result');

    if (result.success > 0) {
      onImportComplete?.();
    }
  }, [previewItems, t, onImportComplete]);

  // 继续导入更多
  const handleImportMore = useCallback(() => {
    resetState();
  }, [resetState]);

  // 渲染上传步骤
  const renderUploadStep = () => (
    <div className={styles.uploadArea}>
      <div className={styles.dropZone}>
        <input
          type="file"
          accept=".json"
          onChange={handleFileSelect}
          className={styles.fileInput}
          id="kiro-file-input"
        />
        <label htmlFor="kiro-file-input" className={styles.dropZoneLabel}>
          <span className={styles.uploadIcon}>📁</span>
          <span>{t('kiro.drop_or_click', { defaultValue: '点击选择文件' })}</span>
          <span className={styles.hint}>
            {t('kiro.file_format_hint', {
              defaultValue: '支持 Kiro 导出的 JSON 文件 (包含 accounts 数组)',
            })}
          </span>
        </label>
      </div>
    </div>
  );

  // 渲染预览步骤
  const renderPreviewStep = () => {
    const selectedCount = previewItems.filter((item) => item.selected).length;

    return (
      <div className={styles.previewArea}>
        {validationWarnings.length > 0 && (
          <div className={styles.warnings}>
            {validationWarnings.map((warning, index) => (
              <div key={index} className={styles.warningItem}>
                ⚠️ {warning}
              </div>
            ))}
          </div>
        )}

        <div className={styles.previewHeader}>
          <span>
            {t('kiro.file', { defaultValue: '文件' })}: {fileName}
          </span>
          <span>
            {previewItems.length} {t('kiro.accounts', { defaultValue: '个账号' })} |{' '}
            {t('kiro.selected', { defaultValue: '已选择' })}: {selectedCount}
          </span>
        </div>

        <KiroPreviewTable
          items={previewItems}
          onToggleSelect={handleToggleSelect}
          onToggleAll={handleToggleAll}
        />

        <div className={styles.previewActions}>
          <Button variant="secondary" onClick={() => setStep('upload')}>
            {t('kiro.back', { defaultValue: '返回' })}
          </Button>
          <div className={styles.actionButtons}>
            <Button variant="secondary" onClick={handleDownload}>
              {t('kiro.download_selected', { defaultValue: '下载选中' })}
            </Button>
            <Button variant="primary" onClick={handleImportToServer}>
              {t('kiro.import_to_server', { defaultValue: '导入到服务器' })}
            </Button>
          </div>
        </div>
      </div>
    );
  };

  // 渲染导入中步骤
  const renderImportingStep = () => (
    <div className={styles.importingContainer}>
      <div className={styles.importingText}>
        {t('kiro.importing', { defaultValue: '正在导入...' })}
      </div>
      <div className={styles.progressBar}>
        <div
          className={styles.progressFill}
          style={{ width: `${importProgress}%` }}
        />
      </div>
      <div className={styles.progressText}>{Math.round(importProgress)}%</div>
    </div>
  );

  // 渲染结果步骤
  const renderResultStep = () => {
    const failedItems = previewItems.filter((item) => item.status === 'error');

    return (
      <div className={styles.resultContainer}>
        <div className={styles.resultSummary}>
          <div className={styles.resultItem}>
            <span className={styles.resultSuccess}>
              {t('kiro.result_success', {
                defaultValue: '成功: {{count}}',
                count: importResult?.success || 0,
              })}
            </span>
          </div>
          <div className={styles.resultItem}>
            <span className={styles.resultFailed}>
              {t('kiro.result_failed', {
                defaultValue: '失败: {{count}}',
                count: importResult?.failed || 0,
              })}
            </span>
          </div>
        </div>

        {failedItems.length > 0 && (
          <div className={styles.failedList}>
            <div className={styles.failedTitle}>
              {t('kiro.failed_items', { defaultValue: '失败项目' })}:
            </div>
            {failedItems.map((item) => (
              <div key={item.id} className={styles.failedItem}>
                <span>{item.original.email}</span>
                <span className={styles.errorMessage}>{item.errorMessage}</span>
              </div>
            ))}
          </div>
        )}

        <div className={styles.resultActions}>
          <Button variant="secondary" onClick={handleImportMore}>
            {t('kiro.import_more', { defaultValue: '继续导入' })}
          </Button>
          <Button variant="primary" onClick={handleClose}>
            {t('common.done', { defaultValue: '完成' })}
          </Button>
        </div>
      </div>
    );
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={t('kiro.import_title', { defaultValue: '导入 Kiro 凭证' })}
      width={700}
    >
      <div className={styles.modalContent}>
        {step === 'upload' && renderUploadStep()}
        {step === 'preview' && renderPreviewStep()}
        {step === 'importing' && renderImportingStep()}
        {step === 'result' && renderResultStep()}
      </div>
    </Modal>
  );
}
