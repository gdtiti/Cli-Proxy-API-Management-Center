import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import styles from '@/pages/AuthFilesPage.module.scss';

type BatchEditableField = 'prefix' | 'priority' | 'note' | 'headers';

export type AuthFilesBatchFieldsEditorState = {
  prefixEnabled: boolean;
  prefix: string;
  priorityEnabled: boolean;
  priority: string;
  noteEnabled: boolean;
  note: string;
  headersEnabled: boolean;
  headersText: string;
  saving: boolean;
};

export type AuthFilesBatchFieldsEditorModalProps = {
  open: boolean;
  disableControls: boolean;
  selectedNames: string[];
  state: AuthFilesBatchFieldsEditorState;
  onClose: () => void;
  onToggleField: (field: BatchEditableField, enabled: boolean) => void;
  onChangeField: (field: BatchEditableField, value: string) => void;
  onSubmit: () => void;
};

type BatchFieldEditorBlockProps = {
  checked: boolean;
  disabled: boolean;
  title: string;
  hint?: string;
  children: ReactNode;
  onToggle: (enabled: boolean) => void;
};

function BatchFieldEditorBlock(props: BatchFieldEditorBlockProps) {
  const { checked, disabled, title, hint, children, onToggle } = props;

  return (
    <div className={styles.batchFieldsBlock}>
      <label className={styles.batchFieldsBlockHeader}>
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onToggle(event.currentTarget.checked)}
        />
        <span>{title}</span>
      </label>
      {hint ? <div className={styles.batchFieldsBlockHint}>{hint}</div> : null}
      <div className={styles.batchFieldsBlockBody}>{children}</div>
    </div>
  );
}

export function AuthFilesBatchFieldsEditorModal(props: AuthFilesBatchFieldsEditorModalProps) {
  const { t } = useTranslation();
  const { open, disableControls, selectedNames, state, onClose, onToggleField, onChangeField, onSubmit } =
    props;
  const { prefixEnabled, prefix, priorityEnabled, priority, noteEnabled, note, headersEnabled, headersText, saving } =
    state;

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeDisabled={saving}
      width={760}
      title={t('auth_files.batch_edit_title')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button onClick={onSubmit} loading={saving} disabled={disableControls || saving}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className={styles.batchFieldsEditor}>
        <p className={styles.batchFieldsDescription}>{t('auth_files.batch_edit_description')}</p>

        <div className={styles.batchFieldsSelectedPanel}>
          <div className={styles.batchFieldsSelectedHeader}>
            {t('auth_files.batch_selected', { count: selectedNames.length })}
          </div>
          <div className={styles.batchFieldsSelectedList}>
            {selectedNames.map((name) => (
              <span key={name} className={styles.batchFieldsChip}>
                {name}
              </span>
            ))}
          </div>
        </div>

        <div className={styles.batchFieldsGrid}>
          <BatchFieldEditorBlock
            checked={prefixEnabled}
            disabled={disableControls || saving}
            title={t('auth_files.prefix_label')}
            hint={t('auth_files.batch_edit_prefix_hint')}
            onToggle={(enabled) => onToggleField('prefix', enabled)}
          >
            <Input
              value={prefix}
              placeholder={t('auth_files.prefix_placeholder')}
              disabled={!prefixEnabled || disableControls || saving}
              onChange={(event) => onChangeField('prefix', event.target.value)}
            />
          </BatchFieldEditorBlock>

          <BatchFieldEditorBlock
            checked={priorityEnabled}
            disabled={disableControls || saving}
            title={t('auth_files.priority_label')}
            hint={t('auth_files.batch_edit_priority_hint')}
            onToggle={(enabled) => onToggleField('priority', enabled)}
          >
            <Input
              value={priority}
              placeholder={t('auth_files.priority_placeholder')}
              disabled={!priorityEnabled || disableControls || saving}
              onChange={(event) => onChangeField('priority', event.target.value)}
            />
          </BatchFieldEditorBlock>

          <BatchFieldEditorBlock
            checked={noteEnabled}
            disabled={disableControls || saving}
            title={t('auth_files.note_label')}
            hint={t('auth_files.batch_edit_note_hint')}
            onToggle={(enabled) => onToggleField('note', enabled)}
          >
            <Input
              value={note}
              placeholder={t('auth_files.note_placeholder')}
              disabled={!noteEnabled || disableControls || saving}
              onChange={(event) => onChangeField('note', event.target.value)}
            />
          </BatchFieldEditorBlock>

          <BatchFieldEditorBlock
            checked={headersEnabled}
            disabled={disableControls || saving}
            title={t('auth_files.batch_edit_headers_label')}
            hint={t('auth_files.batch_edit_headers_hint')}
            onToggle={(enabled) => onToggleField('headers', enabled)}
          >
            <textarea
              className={styles.prefixProxyTextarea}
              rows={8}
              value={headersText}
              placeholder={t('auth_files.batch_edit_headers_placeholder')}
              disabled={!headersEnabled || disableControls || saving}
              onChange={(event) => onChangeField('headers', event.target.value)}
            />
          </BatchFieldEditorBlock>
        </div>
      </div>
    </Modal>
  );
}
