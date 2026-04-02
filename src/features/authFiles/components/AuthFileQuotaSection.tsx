import { useCallback, useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  ANTIGRAVITY_CONFIG,
  CLAUDE_CONFIG,
  CODEX_CONFIG,
  GEMINI_CLI_CONFIG,
  KIMI_CONFIG
} from '@/components/quota';
import { useNotificationStore, useQuotaStore } from '@/stores';
import type { AuthFileItem, RateLimitEntry } from '@/types';
import { getStatusFromError } from '@/utils/quota';
import { formatQuotaResetTime } from '@/utils/quota/formatters';
import {
  isRuntimeOnlyAuthFile,
  resolveQuotaErrorMessage,
  type QuotaProviderType
} from '@/features/authFiles/constants';
import { QuotaProgressBar } from '@/features/authFiles/components/QuotaProgressBar';
import { usageApi } from '@/services/api/usage';
import styles from '@/pages/AuthFilesPage.module.scss';

type QuotaState = { status?: string; error?: string; errorStatus?: number } | undefined;

const getQuotaConfig = (type: QuotaProviderType) => {
  if (type === 'antigravity') return ANTIGRAVITY_CONFIG;
  if (type === 'claude') return CLAUDE_CONFIG;
  if (type === 'codex') return CODEX_CONFIG;
  if (type === 'kimi') return KIMI_CONFIG;
  return GEMINI_CLI_CONFIG;
};

/**
 * Find the rate limit entry matching this auth file by file_name or auth_label.
 */
function findRateLimitForFile(
  rateLimits: RateLimitEntry[],
  file: AuthFileItem
): RateLimitEntry | undefined {
  return rateLimits.find(
    (rl) => rl.file_name === file.name || rl.auth_label === file.name
  );
}

/**
 * Render rate limit data inline (5h + 7d utilization bars).
 */
function RateLimitDisplay({ entry, t }: { entry: RateLimitEntry; t: TFunction }) {
  const fiveHourUsed = Math.round(entry.five_hour_utilization * 100);
  const sevenDayUsed = Math.round(entry.seven_day_utilization * 100);
  const fiveHourRemaining = Math.max(0, 100 - fiveHourUsed);
  const sevenDayRemaining = Math.max(0, 100 - sevenDayUsed);

  const fiveHourReset = entry.five_hour_reset
    ? formatQuotaResetTime(new Date(entry.five_hour_reset * 1000).toISOString())
    : '-';
  const sevenDayReset = entry.seven_day_reset
    ? formatQuotaResetTime(new Date(entry.seven_day_reset * 1000).toISOString())
    : '-';

  const updatedLabel = entry.updated_at
    ? formatQuotaResetTime(entry.updated_at)
    : '';

  return (
    <>
      <div className={styles.quotaRow}>
        <div className={styles.quotaRowHeader}>
          <span className={styles.quotaModel}>{t('claude_quota.five_hour')}</span>
          <div className={styles.quotaMeta}>
            <span className={styles.quotaPercent}>{fiveHourRemaining}%</span>
            <span className={styles.quotaReset}>{fiveHourReset}</span>
          </div>
        </div>
        <QuotaProgressBar percent={fiveHourRemaining} highThreshold={80} mediumThreshold={50} />
      </div>
      <div className={styles.quotaRow}>
        <div className={styles.quotaRowHeader}>
          <span className={styles.quotaModel}>{t('claude_quota.seven_day')}</span>
          <div className={styles.quotaMeta}>
            <span className={styles.quotaPercent}>{sevenDayRemaining}%</span>
            <span className={styles.quotaReset}>{sevenDayReset}</span>
          </div>
        </div>
        <QuotaProgressBar percent={sevenDayRemaining} highThreshold={80} mediumThreshold={50} />
      </div>
      {updatedLabel && (
        <div className={styles.quotaMeta}>
          <span className={styles.quotaReset}>
            {t('claude_quota.rate_limit_updated_at', { time: updatedLabel })}
          </span>
        </div>
      )}
    </>
  );
}

export type AuthFileQuotaSectionProps = {
  file: AuthFileItem;
  quotaType: QuotaProviderType;
  disableControls: boolean;
};

export function AuthFileQuotaSection(props: AuthFileQuotaSectionProps) {
  const { file, quotaType, disableControls } = props;
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);

  const quota = useQuotaStore((state) => {
    if (quotaType === 'antigravity') return state.antigravityQuota[file.name] as QuotaState;
    if (quotaType === 'claude') return state.claudeQuota[file.name] as QuotaState;
    if (quotaType === 'codex') return state.codexQuota[file.name] as QuotaState;
    if (quotaType === 'kimi') return state.kimiQuota[file.name] as QuotaState;
    return state.geminiCliQuota[file.name] as QuotaState;
  });

  const rateLimits = useQuotaStore((state) => state.rateLimits);
  const rateLimitsStatus = useQuotaStore((state) => state.rateLimitsStatus);
  const setRateLimits = useQuotaStore((state) => state.setRateLimits);
  const setRateLimitsStatus = useQuotaStore((state) => state.setRateLimitsStatus);

  // Auto-fetch rate limits for Claude on mount (once globally).
  useEffect(() => {
    if (quotaType !== 'claude') return;
    if (rateLimitsStatus !== 'idle') return;

    setRateLimitsStatus('loading');
    usageApi
      .getRateLimits()
      .then((res) => {
        setRateLimits(res?.rate_limits ?? []);
        setRateLimitsStatus('done');
      })
      .catch(() => {
        setRateLimitsStatus('error');
      });
  }, [quotaType, rateLimitsStatus, setRateLimits, setRateLimitsStatus]);

  const updateQuotaState = useQuotaStore((state) => {
    if (quotaType === 'antigravity') return state.setAntigravityQuota as unknown as (updater: unknown) => void;
    if (quotaType === 'claude') return state.setClaudeQuota as unknown as (updater: unknown) => void;
    if (quotaType === 'codex') return state.setCodexQuota as unknown as (updater: unknown) => void;
    if (quotaType === 'kimi') return state.setKimiQuota as unknown as (updater: unknown) => void;
    return state.setGeminiCliQuota as unknown as (updater: unknown) => void;
  });

  const refreshQuotaForFile = useCallback(async () => {
    if (disableControls) return;
    if (isRuntimeOnlyAuthFile(file)) return;
    if (file.disabled) return;
    if (quota?.status === 'loading') return;

    const config = getQuotaConfig(quotaType) as unknown as {
      i18nPrefix: string;
      fetchQuota: (file: AuthFileItem, t: TFunction) => Promise<unknown>;
      buildLoadingState: () => unknown;
      buildSuccessState: (data: unknown) => unknown;
      buildErrorState: (message: string, status?: number) => unknown;
      renderQuotaItems: (quota: unknown, t: TFunction, helpers: unknown) => unknown;
    };

    updateQuotaState((prev: Record<string, unknown>) => ({
      ...prev,
      [file.name]: config.buildLoadingState()
    }));

    try {
      const data = await config.fetchQuota(file, t);
      updateQuotaState((prev: Record<string, unknown>) => ({
        ...prev,
        [file.name]: config.buildSuccessState(data)
      }));
      showNotification(t('auth_files.quota_refresh_success', { name: file.name }), 'success');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('common.unknown_error');
      const status = getStatusFromError(err);
      updateQuotaState((prev: Record<string, unknown>) => ({
        ...prev,
        [file.name]: config.buildErrorState(message, status)
      }));
      showNotification(t('auth_files.quota_refresh_failed', { name: file.name, message }), 'error');
    }
  }, [disableControls, file, quota?.status, quotaType, showNotification, t, updateQuotaState]);

  const config = getQuotaConfig(quotaType) as unknown as {
    i18nPrefix: string;
    renderQuotaItems: (quota: unknown, t: TFunction, helpers: unknown) => unknown;
  };

  const quotaStatus = quota?.status ?? 'idle';
  const canRefreshQuota = !disableControls && !file.disabled;
  const quotaErrorMessage = resolveQuotaErrorMessage(
    t,
    quota?.errorStatus,
    quota?.error || t('common.unknown_error')
  );

  // For Claude in idle state, show passively collected rate limit data instead of "click to refresh".
  const rateLimitEntry =
    quotaType === 'claude' && quotaStatus === 'idle'
      ? findRateLimitForFile(rateLimits, file)
      : undefined;

  return (
    <div className={styles.quotaSection}>
      {quotaStatus === 'loading' ? (
        <div className={styles.quotaMessage}>{t(`${config.i18nPrefix}.loading`)}</div>
      ) : quotaStatus === 'idle' ? (
        rateLimitEntry ? (
          <>
            <RateLimitDisplay entry={rateLimitEntry} t={t} />
            <button
              type="button"
              className={`${styles.quotaMessage} ${styles.quotaMessageAction}`}
              onClick={() => void refreshQuotaForFile()}
              disabled={!canRefreshQuota}
            >
              {t('claude_quota.refresh_button')}
            </button>
          </>
        ) : (
          <button
            type="button"
            className={`${styles.quotaMessage} ${styles.quotaMessageAction}`}
            onClick={() => void refreshQuotaForFile()}
            disabled={!canRefreshQuota}
          >
            {t(`${config.i18nPrefix}.idle`)}
          </button>
        )
      ) : quotaStatus === 'error' ? (
        <div className={styles.quotaError}>
          {t(`${config.i18nPrefix}.load_failed`, {
            message: quotaErrorMessage
          })}
        </div>
      ) : quota ? (
        (config.renderQuotaItems(quota, t, { styles, QuotaProgressBar }) as ReactNode)
      ) : (
        <div className={styles.quotaMessage}>{t(`${config.i18nPrefix}.idle`)}</div>
      )}
    </div>
  );
}
