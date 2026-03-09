/**
 * JSON Editor Modal - 用于编辑认证文件的 JSON 内容
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import CodeMirror, { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { search as cmSearch, searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { keymap } from '@codemirror/view';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useNotificationStore, useThemeStore } from '@/stores';
import { authFilesApi } from '@/services/api';
import type { AuthFileItem, ResolvedTheme } from '@/types';
import styles from '@/pages/AuthFilesPage.module.scss';

interface JsonEditorModalProps {
  open: boolean;
  onClose: () => void;
  file: AuthFileItem | null;
  onSaved?: () => void;
}

export function JsonEditorModal({ open, onClose, file, onSaved }: JsonEditorModalProps) {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const resolvedTheme: ResolvedTheme = useThemeStore((state) => state.resolvedTheme);

  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const editorRef = useRef<ReactCodeMirrorRef>(null);

  const jsonEditorExtensions = useMemo(
    () => [json(), cmSearch(), highlightSelectionMatches(), keymap.of(searchKeymap)],
    []
  );

  // 加载文件内容
  const loadContent = useCallback(async () => {
    if (!file) return;

    setContent('');
    setOriginalContent('');
    setDirty(false);
    setLoading(true);

    try {
      const rawContent = await authFilesApi.downloadText(file.name);
      // 尝试格式化 JSON
      try {
        const parsed = JSON.parse(rawContent);
        const formatted = JSON.stringify(parsed, null, 2);
        setContent(formatted);
        setOriginalContent(formatted);
      } catch {
        // 如果不是有效 JSON，直接使用原始内容
        setContent(rawContent);
        setOriginalContent(rawContent);
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : '';
      showNotification(`${t('notification.load_failed')}: ${errorMessage}`, 'error');
      onClose();
    } finally {
      setLoading(false);
    }
  }, [file, showNotification, t, onClose]);

  // 当弹窗打开且有文件时加载内容
  useState(() => {
    if (open && file) {
      loadContent();
    }
  });

  // 监听 open 和 file 变化
  useMemo(() => {
    if (open && file) {
      loadContent();
    }
  }, [open, file?.name]);

  const handleChange = useCallback(
    (value: string) => {
      setContent(value);
      setDirty(value !== originalContent);
    },
    [originalContent]
  );

  const handleSave = async () => {
    if (!file) return;

    // 验证 JSON 格式
    try {
      JSON.parse(content);
    } catch {
      showNotification(t('auth_files.edit_invalid_json'), 'error');
      return;
    }

    setSaving(true);
    try {
      const blob = new Blob([content], { type: 'application/json' });
      const uploadFile = new File([blob], file.name, { type: 'application/json' });
      await authFilesApi.upload(uploadFile);

      setDirty(false);
      setOriginalContent(content);
      showNotification(t('auth_files.edit_save_success'), 'success');
      onSaved?.();
      onClose();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : '';
      showNotification(`${t('notification.save_failed')}: ${errorMessage}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    if (dirty) {
      if (!window.confirm(t('auth_files.edit_discard_confirm'))) {
        return;
      }
    }
    setContent('');
    setOriginalContent('');
    setDirty(false);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={t('auth_files.edit_title', { name: file?.name || '' })}
      width={900}
      footer={
        <>
          <span className={`${styles.editStatus} ${dirty ? styles.editStatusDirty : ''}`}>
            {loading
              ? t('auth_files.edit_loading')
              : dirty
                ? t('auth_files.edit_status_modified')
                : t('auth_files.edit_status_saved')}
          </span>
          <Button variant="secondary" onClick={handleClose} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSave} loading={saving} disabled={!dirty || loading}>
            {t('auth_files.edit_save')}
          </Button>
        </>
      }
    >
      {loading ? (
        <div className={styles.editLoadingWrapper}>
          <LoadingSpinner size={32} />
          <span>{t('auth_files.edit_loading')}</span>
        </div>
      ) : (
        <div className={styles.editorWrapper}>
          <CodeMirror
            ref={editorRef}
            value={content}
            onChange={handleChange}
            extensions={jsonEditorExtensions}
            theme={resolvedTheme}
            editable={!saving}
            placeholder={t('auth_files.edit_placeholder')}
            height="100%"
            style={{ height: '100%' }}
            basicSetup={{
              lineNumbers: true,
              highlightActiveLineGutter: true,
              highlightActiveLine: true,
              foldGutter: true,
              dropCursor: true,
              allowMultipleSelections: true,
              indentOnInput: true,
              bracketMatching: true,
              closeBrackets: true,
              autocompletion: false,
              rectangularSelection: true,
              crosshairCursor: false,
              highlightSelectionMatches: true,
              closeBracketsKeymap: true,
              searchKeymap: true,
              foldKeymap: true,
              completionKeymap: false,
              lintKeymap: true,
            }}
          />
        </div>
      )}
    </Modal>
  );
}
