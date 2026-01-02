/**
 * Kiro 凭证预览表格组件
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { IconCheck, IconX } from '@/components/ui/icons';
import type { KiroPreviewItem } from '@/types/kiro';
import styles from './KiroImport.module.scss';

interface KiroPreviewTableProps {
  items: KiroPreviewItem[];
  onToggleSelect: (id: string) => void;
  onToggleAll: (selected: boolean) => void;
}

/**
 * 遮蔽 token（只显示前后几位）
 */
function maskToken(token: string): string {
  if (token.length <= 12) return '****';
  return `${token.slice(0, 6)}...${token.slice(-4)}`;
}

/**
 * 格式化认证方法显示
 */
function formatAuthMethod(method: string): string {
  const mapping: Record<string, string> = {
    'builder-id': 'Builder ID',
    iam: 'IAM',
  };
  return mapping[method] || method;
}

export function KiroPreviewTable({
  items,
  onToggleSelect,
  onToggleAll,
}: KiroPreviewTableProps) {
  const { t } = useTranslation();

  const allSelected = useMemo(() => items.every((item) => item.selected), [items]);
  const someSelected = useMemo(
    () => items.some((item) => item.selected) && !allSelected,
    [items, allSelected]
  );

  return (
    <div className={styles.tableContainer}>
      <table className={styles.previewTable}>
        <thead>
          <tr>
            <th className={styles.checkboxCell}>
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = someSelected;
                }}
                onChange={(e) => onToggleAll(e.target.checked)}
              />
            </th>
            <th>{t('kiro.column_email', { defaultValue: '邮箱' })}</th>
            <th>{t('kiro.column_auth_method', { defaultValue: '认证方式' })}</th>
            <th>{t('kiro.column_region', { defaultValue: '区域' })}</th>
            <th>{t('kiro.column_token', { defaultValue: 'Token' })}</th>
            <th>{t('kiro.column_status', { defaultValue: '状态' })}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr
              key={item.id}
              className={`${styles.tableRow} ${!item.selected ? styles.rowDisabled : ''}`}
            >
              <td className={styles.checkboxCell}>
                <input
                  type="checkbox"
                  checked={item.selected}
                  onChange={() => onToggleSelect(item.id)}
                  disabled={item.status !== 'pending'}
                />
              </td>
              <td className={styles.emailCell}>{item.original.email}</td>
              <td className={styles.authMethodCell}>
                {formatAuthMethod(item.converted.auth_method)}
              </td>
              <td className={styles.regionCell}>{item.converted.region}</td>
              <td className={styles.tokenCell}>
                <code>{maskToken(item.original.credentials.refreshToken)}</code>
              </td>
              <td className={styles.statusCell}>
                {item.status === 'pending' && (
                  <span className={styles.statusPending}>
                    {t('kiro.status_pending', { defaultValue: '待处理' })}
                  </span>
                )}
                {item.status === 'success' && (
                  <span className={styles.statusSuccess}>
                    <IconCheck size={14} /> {t('kiro.status_success', { defaultValue: '成功' })}
                  </span>
                )}
                {item.status === 'error' && (
                  <span className={styles.statusError} title={item.errorMessage}>
                    <IconX size={14} /> {t('kiro.status_error', { defaultValue: '失败' })}
                  </span>
                )}
                {item.status === 'skipped' && (
                  <span className={styles.statusSkipped}>
                    {t('kiro.status_skipped', { defaultValue: '跳过' })}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
