import { describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import type { JobTimelineEvent } from '@shared/jobs-types';
import { shouldForceConsultationInviteResend } from './consultation-invite-state';

const sentEvent = (templateId: string): JobTimelineEvent => ({
  id: `invite-${templateId}`,
  jobId: 'job-1',
  tipo: 'consulenza_inviata',
  descrizione: 'Richiesta consulenza inviata',
  data: new Timestamp(1, 0),
  metadata: { templateId },
});

describe('shouldForceConsultationInviteResend', () => {
  it('allows an explicit resend when this template already has a workflow event', () => {
    expect(
      shouldForceConsultationInviteResend(
        { workflowEvents: [sentEvent('template-1')] },
        'template-1',
        false,
      ),
    ).toBe(true);
  });

  it('allows an explicit resend when the automatic invite marker is present', () => {
    expect(
      shouldForceConsultationInviteResend(
        {
          workflowEvents: [],
          visioneAutoInviteSentAt: new Timestamp(1, 0),
        },
        'template-1',
        true,
      ),
    ).toBe(true);
  });

  it('keeps the first send on the scheduler-safe path', () => {
    expect(
      shouldForceConsultationInviteResend(
        { workflowEvents: [] },
        'template-1',
        true,
      ),
    ).toBe(false);
  });

  it('does not mistake an invite for another template as a resend', () => {
    expect(
      shouldForceConsultationInviteResend(
        { workflowEvents: [sentEvent('template-1')] },
        'template-2',
        false,
      ),
    ).toBe(false);
  });
});
