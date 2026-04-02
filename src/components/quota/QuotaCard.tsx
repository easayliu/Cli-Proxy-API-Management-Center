/**
 * Generic quota card component.
 */

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { ReactElement, ReactNode } from 'react';
import type { TFunction } from 'i18next';
import type { AuthFileItem, RateLimitEntry, ResolvedTheme, ThemeColors } from '@/types';
import { TYPE_COLORS } from '@/utils/quota';
import { formatQuotaResetTime } from '@/utils/quota/formatters';
import { useQuotaStore } from '@/stores';
import { usageApi } from '@/services/api/usage';
import styles from '@/pages/QuotaPage.module.scss';

type QuotaStatus = 'idle' | 'loading' | 'success' | 'error';

export interface QuotaStatusState {
  status: QuotaStatus;
  error?: string;
  errorStatus?: number;
}

export interface QuotaProgressBarProps {
  percent: number | null;
  highThreshold: number;
  mediumThreshold: number;
}

export function QuotaProgressBar({
  percent,
  highThreshold,
  mediumThreshold
}: QuotaProgressBarProps) {
  const clamp = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value));
  const normalized = percent === null ? null : clamp(percent, 0, 100);
  const fillClass =
    normalized === null
      ? styles.quotaBarFillMedium
      : normalized >= highThreshold
        ? styles.quotaBarFillHigh
        : normalized >= mediumThreshold
          ? styles.quotaBarFillMedium
          : styles.quotaBarFillLow;
  const widthPercent = Math.round(normalized ?? 0);

  return (
    <div className={styles.quotaBar}>
      <div
        className={`${styles.quotaBarFill} ${fillClass}`}
        style={{ width: `${widthPercent}%` }}
      />
    </div>
  );
}

export interface QuotaRenderHelpers {
  styles: typeof styles;
  QuotaProgressBar: (props: QuotaProgressBarProps) => ReactElement;
}

function findRateLimitForItem(
  rateLimits: RateLimitEntry[],
  item: AuthFileItem
): RateLimitEntry | undefined {
  const name = item.name;
  return rateLimits.find(
    (rl) =>
      rl.auth_id === name ||
      rl.file_name === name ||
      rl.auth_label === name
  );
}

function RateLimitDisplay({ entry }: { entry: RateLimitEntry }) {
  const { t } = useTranslation();
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

interface QuotaCardProps<TState extends QuotaStatusState> {
  item: AuthFileItem;
  quota?: TState;
  resolvedTheme: ResolvedTheme;
  i18nPrefix: string;
  cardIdleMessageKey?: string;
  cardClassName: string;
  defaultType: string;
  renderQuotaItems: (quota: TState, t: TFunction, helpers: QuotaRenderHelpers) => ReactNode;
}

export function QuotaCard<TState extends QuotaStatusState>({
  item,
  quota,
  resolvedTheme,
  i18nPrefix,
  cardIdleMessageKey,
  cardClassName,
  defaultType,
  renderQuotaItems
}: QuotaCardProps<TState>) {
  const { t } = useTranslation();

  const rateLimits = useQuotaStore((state) => state.rateLimits);
  const rateLimitsStatus = useQuotaStore((state) => state.rateLimitsStatus);
  const setRateLimits = useQuotaStore((state) => state.setRateLimits);
  const setRateLimitsStatus = useQuotaStore((state) => state.setRateLimitsStatus);

  const isClaude = defaultType === 'claude';

  // Auto-fetch rate limits for Claude cards (once globally).
  useEffect(() => {
    if (!isClaude) return;
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
  }, [isClaude, rateLimitsStatus, setRateLimits, setRateLimitsStatus]);

  const displayType = item.type || item.provider || defaultType;
  const typeColorSet = TYPE_COLORS[displayType] || TYPE_COLORS.unknown;
  const typeColor: ThemeColors =
    resolvedTheme === 'dark' && typeColorSet.dark ? typeColorSet.dark : typeColorSet.light;

  const quotaStatus = quota?.status ?? 'idle';
  const quotaErrorMessage = resolveQuotaErrorMessage(
    t,
    quota?.errorStatus,
    quota?.error || t('common.unknown_error')
  );
  const idleMessageKey = cardIdleMessageKey ?? `${i18nPrefix}.idle`;

  const rateLimitEntry =
    isClaude && quotaStatus === 'idle'
      ? findRateLimitForItem(rateLimits, item)
      : undefined;

  const getTypeLabel = (type: string): string => {
    const key = `auth_files.filter_${type}`;
    const translated = t(key);
    if (translated !== key) return translated;
    if (type.toLowerCase() === 'iflow') return 'iFlow';
    return type.charAt(0).toUpperCase() + type.slice(1);
  };

  return (
    <div className={`${styles.fileCard} ${cardClassName}`}>
      <div className={styles.cardHeader}>
        <span
          className={styles.typeBadge}
          style={{
            backgroundColor: typeColor.bg,
            color: typeColor.text,
            ...(typeColor.border ? { border: typeColor.border } : {})
          }}
        >
          {getTypeLabel(displayType)}
        </span>
        <span className={styles.fileName}>{item.name}</span>
      </div>

      <div className={styles.quotaSection}>
        {quotaStatus === 'loading' ? (
          <div className={styles.quotaMessage}>{t(`${i18nPrefix}.loading`)}</div>
        ) : quotaStatus === 'idle' ? (
          rateLimitEntry ? (
            <RateLimitDisplay entry={rateLimitEntry} />
          ) : (
            <div className={styles.quotaMessage}>{t(idleMessageKey)}</div>
          )
        ) : quotaStatus === 'error' ? (
          <div className={styles.quotaError}>
            {t(`${i18nPrefix}.load_failed`, {
              message: quotaErrorMessage
            })}
          </div>
        ) : quota ? (
          renderQuotaItems(quota, t, { styles, QuotaProgressBar })
        ) : (
          <div className={styles.quotaMessage}>{t(idleMessageKey)}</div>
        )}
      </div>
    </div>
  );
}

const resolveQuotaErrorMessage = (
  t: TFunction,
  status: number | undefined,
  fallback: string
): string => {
  if (status === 404) return t('common.quota_update_required');
  if (status === 403) return t('common.quota_check_credential');
  return fallback;
};
