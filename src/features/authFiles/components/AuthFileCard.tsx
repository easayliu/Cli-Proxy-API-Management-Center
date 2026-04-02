import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { SelectionCheckbox } from '@/components/ui/SelectionCheckbox';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import {
  IconDownload,
  IconInfo,
  IconModelCluster,
  IconSettings,
  IconTrash2,
} from '@/components/ui/icons';
import { ProviderStatusBar } from '@/components/providers/ProviderStatusBar';
import type { AuthFileItem } from '@/types';
import { resolveAuthProvider } from '@/utils/quota';
import { calculateStatusBarData, normalizeAuthIndex, type KeyStats } from '@/utils/usage';
import { formatFileSize } from '@/utils/format';
import {
  QUOTA_PROVIDER_TYPES,
  formatModified,
  getAuthFileIcon,
  getAuthFileStatusMessage,
  getTypeColor,
  getTypeLabel,
  isRuntimeOnlyAuthFile,
  parsePriorityValue,
  resolveAuthFileStats,
  type QuotaProviderType,
  type ResolvedTheme,
} from '@/features/authFiles/constants';
import type { AuthFileStatusBarData } from '@/features/authFiles/hooks/useAuthFilesStatusBarCache';
import { AuthFileQuotaSection } from '@/features/authFiles/components/AuthFileQuotaSection';
import styles from '@/pages/AuthFilesPage.module.scss';

const HEALTHY_STATUS_MESSAGES = new Set(['ok', 'healthy', 'ready', 'success', 'available']);

export type AuthFileCardProps = {
  file: AuthFileItem;
  compact: boolean;
  selected: boolean;
  resolvedTheme: ResolvedTheme;
  disableControls: boolean;
  deleting: string | null;
  statusUpdating: Record<string, boolean>;
  quotaFilterType: QuotaProviderType | null;
  keyStats: KeyStats;
  statusBarCache: Map<string, AuthFileStatusBarData>;
  onShowModels: (file: AuthFileItem) => void;
  onDownload: (name: string) => void;
  onOpenPrefixProxyEditor: (file: AuthFileItem) => void;
  onDelete: (name: string) => void;
  onToggleStatus: (file: AuthFileItem, enabled: boolean) => void;
  onToggleSelect: (name: string) => void;
};

const resolveQuotaType = (file: AuthFileItem): QuotaProviderType | null => {
  const provider = resolveAuthProvider(file);
  if (!QUOTA_PROVIDER_TYPES.has(provider as QuotaProviderType)) return null;
  return provider as QuotaProviderType;
};

export function AuthFileCard(props: AuthFileCardProps) {
  const { t } = useTranslation();
  const {
    file,
    compact,
    selected,
    resolvedTheme,
    disableControls,
    deleting,
    statusUpdating,
    quotaFilterType,
    keyStats,
    statusBarCache,
    onShowModels,
    onDownload,
    onOpenPrefixProxyEditor,
    onDelete,
    onToggleStatus,
    onToggleSelect,
  } = props;

  const fileStats = resolveAuthFileStats(file, keyStats);
  const isRuntimeOnly = isRuntimeOnlyAuthFile(file);
  const isAistudio = (file.type || '').toLowerCase() === 'aistudio';
  const showModelsButton = !isRuntimeOnly || isAistudio;
  const typeColor = getTypeColor(file.type || 'unknown', resolvedTheme);
  const typeLabel = getTypeLabel(t, file.type || 'unknown');
  const providerIcon = getAuthFileIcon(file.type || 'unknown', resolvedTheme);

  const quotaType =
    quotaFilterType && resolveQuotaType(file) === quotaFilterType ? quotaFilterType : null;

  const showQuotaLayout = Boolean(quotaType) && !isRuntimeOnly && !compact;

  const providerCardClass =
    quotaType === 'antigravity'
      ? styles.antigravityCard
      : quotaType === 'claude'
        ? styles.claudeCard
        : quotaType === 'codex'
          ? styles.codexCard
          : quotaType === 'gemini-cli'
            ? styles.geminiCliCard
            : quotaType === 'kimi'
              ? styles.kimiCard
              : '';

  const rawAuthIndex = file['auth_index'] ?? file.authIndex;
  const authIndexKey = normalizeAuthIndex(rawAuthIndex);
  const statusData =
    (authIndexKey && statusBarCache.get(authIndexKey)) || calculateStatusBarData([]);
  const rawStatusMessage = getAuthFileStatusMessage(file);
  const hasStatusWarning =
    Boolean(rawStatusMessage) && !HEALTHY_STATUS_MESSAGES.has(rawStatusMessage.toLowerCase());

  const priorityValue = parsePriorityValue(file.priority ?? file['priority']);
  const rpmValue = parsePriorityValue(file.rpm ?? file['rpm']);
  const maxConcurrentValue = parsePriorityValue(file.max_concurrent ?? file['max_concurrent']);
  const noteValue = typeof file.note === 'string' ? file.note.trim() : '';
  const stateLabel = isRuntimeOnly
    ? t('auth_files.type_virtual') || '虚拟认证文件'
    : file.disabled
      ? t('auth_files.health_status_disabled')
      : hasStatusWarning
        ? t('auth_files.health_status_warning')
        : rawStatusMessage
          ? t('auth_files.health_status_healthy')
          : t('auth_files.status_toggle_label');
  const stateBadgeClass = isRuntimeOnly
    ? styles.stateBadgeVirtual
    : file.disabled
      ? styles.stateBadgeDisabled
      : hasStatusWarning
        ? styles.stateBadgeWarning
        : styles.stateBadgeActive;

  const hasPriority = priorityValue !== undefined;
  const hasRpm = (rpmValue !== undefined && rpmValue > 0) || (maxConcurrentValue !== undefined && maxConcurrentValue > 0);

  return (
    <div
      className={`${styles.fileCard} ${compact ? styles.fileCardCompact : ''} ${providerCardClass} ${selected ? styles.fileCardSelected : ''} ${file.disabled ? styles.fileCardDisabled : ''}`}
    >
      {/* Card header: checkbox + avatar + identity + toggle */}
      <div className={styles.cardHeader}>
        <div className={styles.cardHeaderLeft}>
          {!isRuntimeOnly && (
            <SelectionCheckbox
              checked={selected}
              onChange={() => onToggleSelect(file.name)}
              className={styles.cardSelection}
              aria-label={
                selected ? t('auth_files.batch_deselect') : t('auth_files.batch_select_all')
              }
              title={selected ? t('auth_files.batch_deselect') : t('auth_files.batch_select_all')}
            />
          )}
          <div
            className={styles.providerAvatar}
            style={{
              backgroundColor: typeColor.bg,
              color: typeColor.text,
              ...(typeColor.border ? { border: typeColor.border } : {}),
            }}
          >
            {providerIcon ? (
              <img src={providerIcon} alt="" className={styles.providerAvatarImage} />
            ) : (
              <span className={styles.providerAvatarFallback}>
                {typeLabel.slice(0, 1).toUpperCase()}
              </span>
            )}
          </div>
          <div className={styles.cardIdentity}>
            <span className={styles.fileName} title={file.name}>
              {file.name}
            </span>
            <div className={styles.cardBadgeRow}>
              <span
                className={styles.typeBadge}
                style={{
                  backgroundColor: typeColor.bg,
                  color: typeColor.text,
                  ...(typeColor.border ? { border: typeColor.border } : {}),
                }}
              >
                {typeLabel}
              </span>
              <span className={`${styles.stateBadge} ${stateBadgeClass}`}>{stateLabel}</span>
            </div>
          </div>
        </div>
        {!isRuntimeOnly && (
          <ToggleSwitch
            ariaLabel={t('auth_files.status_toggle_label')}
            checked={!file.disabled}
            disabled={disableControls || statusUpdating[file.name] === true}
            onChange={(value) => onToggleStatus(file, value)}
          />
        )}
      </div>

      {/* Meta grid */}
      <div className={styles.cardMetaGrid}>
        <div className={styles.metaCell}>
          <span className={styles.metaCellLabel}>{t('auth_files.file_size')}</span>
          <span className={styles.metaCellValue}>{file.size ? formatFileSize(file.size) : '-'}</span>
        </div>
        <div className={styles.metaCell}>
          <span className={styles.metaCellLabel}>{t('auth_files.file_modified')}</span>
          <span className={styles.metaCellValue}>{formatModified(file)}</span>
        </div>
        {hasPriority && (
          <div className={`${styles.metaCell} ${styles.metaCellAccent}`}>
            <span className={styles.metaCellLabel}>{t('auth_files.priority_display')}</span>
            <span className={styles.metaCellValue}>{priorityValue}</span>
          </div>
        )}
        {hasRpm && (
          <div className={`${styles.metaCell} ${styles.metaCellAccent}`}>
            <span className={styles.metaCellLabel}>RPM / MC</span>
            <span className={styles.metaCellValue}>
              {rpmValue !== undefined && rpmValue > 0 ? rpmValue : '-'}
              {' / '}
              {maxConcurrentValue !== undefined && maxConcurrentValue > 0 ? maxConcurrentValue : '-'}
            </span>
          </div>
        )}
      </div>

      {/* Note (non-compact only) */}
      {!compact && noteValue && (
        <div className={styles.noteText} title={noteValue}>
          <span className={styles.noteLabel}>{t('auth_files.note_display')}</span>
          <span className={styles.noteValue}>{noteValue}</span>
        </div>
      )}

      {/* Status warning */}
      {rawStatusMessage && hasStatusWarning && (
        <div className={styles.healthStatusMessage} title={rawStatusMessage}>
          <IconInfo className={styles.messageIcon} size={14} />
          <span>{rawStatusMessage}</span>
        </div>
      )}

      {/* Unified status section: inline stats + status bar */}
      <div className={styles.cardStatusSection}>
        <div className={styles.statsInline}>
          <span className={styles.statInlineSuccess}>
            <span className={styles.statInlineLabel}>{t('stats.success')}</span>
            <span className={styles.statInlineValue}>{fileStats.success}</span>
          </span>
          <span className={styles.statInlineSep} />
          <span className={styles.statInlineFailure}>
            <span className={styles.statInlineLabel}>{t('stats.failure')}</span>
            <span className={styles.statInlineValue}>{fileStats.failure}</span>
          </span>
        </div>
        <ProviderStatusBar statusData={statusData} styles={styles} />
      </div>

      {/* Quota (non-compact, provider filtered) */}
      {showQuotaLayout && quotaType && (
        <AuthFileQuotaSection
          file={file}
          quotaType={quotaType}
          disableControls={disableControls}
        />
      )}

      {/* Actions row */}
      <div className={styles.cardActions}>
        <div className={styles.cardActionsMain}>
          {showModelsButton && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onShowModels(file)}
              className={`${styles.primaryActionButton} ${styles.modelsActionButton}`}
              title={t('auth_files.models_button', { defaultValue: '模型' })}
              disabled={disableControls}
            >
              <>
                <span className={styles.modelsActionIconWrap}>
                  <IconModelCluster className={styles.actionIcon} size={16} />
                </span>
                <span className={styles.actionButtonLabel}>
                  {t('auth_files.models_button', { defaultValue: '模型' })}
                </span>
              </>
            </Button>
          )}
          {!isRuntimeOnly && (
            <div className={styles.cardUtilityActions}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onDownload(file.name)}
                className={styles.iconButton}
                title={t('auth_files.download_button')}
                disabled={disableControls}
              >
                <IconDownload className={styles.actionIcon} size={16} />
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onOpenPrefixProxyEditor(file)}
                className={styles.iconButton}
                title={t('auth_files.prefix_proxy_button')}
                disabled={disableControls}
              >
                <IconSettings className={styles.actionIcon} size={16} />
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => onDelete(file.name)}
                className={styles.iconButton}
                title={t('auth_files.delete_button')}
                disabled={disableControls || deleting === file.name}
              >
                {deleting === file.name ? (
                  <LoadingSpinner size={14} />
                ) : (
                  <IconTrash2 className={styles.actionIcon} size={16} />
                )}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
