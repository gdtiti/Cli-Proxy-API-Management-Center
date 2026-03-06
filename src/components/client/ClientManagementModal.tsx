/**
 * 客户端管理弹窗组件
 * 用于添加、编辑、删除客户端配置
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useClientCacheStore, type ClientConfig } from '@/stores/useClientCacheStore';

interface ClientManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ClientManagementModal({ isOpen, onClose }: ClientManagementModalProps) {
  const { t } = useTranslation();
  const clients = useClientCacheStore((state) => state.clients);
  const addClient = useClientCacheStore((state) => state.addClient);
  const updateClient = useClientCacheStore((state) => state.updateClient);
  const deleteClient = useClientCacheStore((state) => state.deleteClient);
  const setActiveClient = useClientCacheStore((state) => state.setActiveClient);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [formName, setFormName] = useState('');
  const [formApiBase, setFormApiBase] = useState('');
  const [formKey, setFormKey] = useState('');
  const [formError, setFormError] = useState('');

  const resetForm = () => {
    setFormName('');
    setFormApiBase('');
    setFormKey('');
    setFormError('');
    setEditingId(null);
    setShowForm(false);
  };

  const handleAdd = () => {
    setFormError('');
    try {
      addClient({
        name: formName,
        apiBase: formApiBase,
        managementKey: formKey,
      });
      resetForm();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t('common.unknown_error'));
    }
  };

  const handleUpdate = () => {
    if (!editingId) return;

    setFormError('');
    try {
      const updates: Partial<Pick<ClientConfig, 'name' | 'apiBase' | 'managementKey'>> = {};
      if (formName.trim()) updates.name = formName;
      if (formApiBase.trim()) updates.apiBase = formApiBase;
      if (formKey.trim()) updates.managementKey = formKey;

      updateClient(editingId, updates);
      resetForm();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t('common.unknown_error'));
    }
  };

  const handleDelete = (id: string) => {
    if (!window.confirm(t('client_management.delete_confirm'))) return;

    deleteClient(id);
  };

  const handleSelect = (id: string) => {
    setActiveClient(id);
    onClose();
  };

  const startEdit = (client: ClientConfig) => {
    setEditingId(client.id);
    setFormName(client.name);
    setFormApiBase(client.apiBase);
    setFormKey('');
    setFormError('');
    setShowForm(true);
  };

  return (
    <Modal open={isOpen} onClose={onClose} title={t('client_management.title')} width={760}>
      <div style={{ display: 'grid', gap: 16, padding: '4px 0 8px' }}>
        <div>
          <div style={{ marginBottom: 10, fontWeight: 600 }}>
            {t('client_management.saved_clients')}
          </div>
          {clients.length === 0 ? (
            <div className="hint">{t('client_management.empty')}</div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {clients.map((client) => (
                <div
                  key={client.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 12px',
                    border: '1px solid var(--border-color)',
                    borderRadius: 8,
                  }}
                >
                  <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
                    <strong>{client.name}</strong>
                    <span className="hint" style={{ wordBreak: 'break-all' }}>
                      {client.apiBase}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <Button size="sm" variant="secondary" onClick={() => handleSelect(client.id)}>
                      {t('client_management.select')}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => startEdit(client)}>
                      {t('client_management.edit')}
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => handleDelete(client.id)}>
                      {t('client_management.delete')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {showForm ? (
          <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 12 }}>
            <div style={{ marginBottom: 12, fontWeight: 600 }}>
              {editingId ? t('client_management.edit_client') : t('client_management.add_client')}
            </div>
            <Input
              label={t('client_management.name_label')}
              value={formName}
              onChange={(event) => setFormName(event.target.value)}
              placeholder={t('client_management.name_placeholder')}
            />
            <Input
              label={t('client_management.api_base_label')}
              value={formApiBase}
              onChange={(event) => setFormApiBase(event.target.value)}
              placeholder={t('client_management.api_base_placeholder')}
            />
            <Input
              label={t('client_management.key_label')}
              type="password"
              value={formKey}
              onChange={(event) => setFormKey(event.target.value)}
              placeholder={
                editingId
                  ? t('client_management.key_placeholder_edit')
                  : t('client_management.key_placeholder')
              }
            />
            {formError && <div className="error-box">{formError}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              <Button variant="secondary" onClick={resetForm}>
                {t('common.cancel')}
              </Button>
              <Button onClick={editingId ? handleUpdate : handleAdd}>
                {editingId ? t('common.save') : t('common.add')}
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <Button onClick={() => setShowForm(true)}>{t('client_management.add_new')}</Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
