import type { Job } from '@shared/jobs-types';

/**
 * The send endpoint accepts force=true for an explicit admin resend. Keep the
 * first send on its normal path so the server can still serialize it against
 * the automatic invitation scheduler.
 */
export function shouldForceConsultationInviteResend(
  job: Pick<Job, 'workflowEvents' | 'visioneAutoInviteSentAt'> | null | undefined,
  templateId: string | null | undefined,
  isAutoInviteTemplate: boolean,
): boolean {
  if (!job || !templateId) return false;

  const alreadySentForTemplate = (job.workflowEvents ?? []).some(
    (event) =>
      event.tipo === 'consulenza_inviata' &&
      event.metadata?.templateId === templateId,
  );

  return alreadySentForTemplate || (isAutoInviteTemplate && !!job.visioneAutoInviteSentAt);
}
