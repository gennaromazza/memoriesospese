/**
 * Tipi condivisi per i follow-up automatici dei preventivi.
 *
 * Questi tipi sono volutamente indipendenti da Firebase Timestamp: le API
 * restituiscono date ISO e il client non deve conoscere l'Admin SDK.
 */

export type FollowUpMode = "automatic" | "pending_approval";

export type FollowUpStatus =
  | "active"
  | "pending_approval"
  | "snoozed"
  | "dormant"
  | "reactivation_due"
  | "completed"
  | "converted"
  | "not_interested"
  | "superseded"
  | "suspended";

export type FollowUpEventType =
  | "quote_sent"
  | "quote_viewed"
  | "followup_due"
  | "followup_sent"
  | "followup_clicked"
  | "followup_opened"
  | "customer_replied"
  | "manual_contact"
  | "snoozed"
  | "automation_suspended"
  | "quote_signed"
  | "booking_created"
  | "not_interested"
  | "dormant"
  | "reactivated"
  | "superseded";

export interface FollowUpSequenceStep {
  step: number;
  delayDays: number;
  templateId: string;
  enabled: boolean;
}

export interface FollowUpSequence {
  id: string;
  name: string;
  serviceType: string;
  enabled: boolean;
  mode: FollowUpMode;
  steps: FollowUpSequenceStep[];
  dormantAfterStep?: number;
  reactivationDaysBeforeEvent?: number;
  updatedAt?: string;
}

export type FollowUpTemplateCta = "quote" | "configurator" | "custom" | "none";

export interface FollowUpTemplate {
  id: string;
  name: string;
  serviceType: string;
  step: number;
  active: boolean;
  subject: string;
  bodyHtml: string;
  cta: FollowUpTemplateCta;
  ctaLabel?: string;
  customUrl?: string;
  version: number;
  updatedAt?: string;
}

export interface FollowUpState {
  quoteId: string;
  jobId: string;
  clienteId?: string;
  serviceType: string;
  status: FollowUpStatus;
  mode: FollowUpMode;
  sequenceId: string;
  sentSteps: number[];
  nextStep?: number;
  nextDueAt?: string;
  quoteSentAt?: string;
  lastSentAt?: string;
  lastCustomerContactAt?: string;
  snoozedUntil?: string;
  pauseReason?: string;
  signedAt?: string;
  signedValue?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface FollowUpEvent {
  id?: string;
  quoteId: string;
  jobId?: string;
  type: FollowUpEventType;
  step?: number;
  occurredAt: string;
  metadata?: Record<string, unknown>;
}

export interface FollowUpDashboardItem extends FollowUpState {
  clientName: string;
  email?: string;
  eventName?: string;
  eventDate?: string;
  quoteTotal?: number;
  quoteStatus?: string;
  reason?: string;
}

export interface FollowUpDashboardResponse {
  items: FollowUpDashboardItem[];
  stats: {
    active: number;
    due: number;
    snoozed: number;
    dormant: number;
    suspended: number;
    converted: number;
    notInterested: number;
    sentByStep: Record<string, number>;
    assistedValue: number;
  };
  sequences: FollowUpSequence[];
  templates: FollowUpTemplate[];
}