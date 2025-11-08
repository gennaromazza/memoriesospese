import { Job } from '@shared/jobs-types';
import { DEFAULT_WORKFLOW_STEPS, WorkflowStep } from '@shared/job-workflow-types';
import { Checkbox } from '@/components/ui/checkbox';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { 
  CalendarPlus, 
  CalendarCheck, 
  FileText, 
  CheckCircle, 
  Calendar, 
  Image, 
  Eye, 
  CheckCircle2,
  LucideIcon
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface WorkflowTimelineProps {
  job: Job;
  workflowSteps?: WorkflowStep[];
  onToggleStep?: (stepId: string, completed: boolean) => void;
  isAdmin?: boolean;
}

const ICON_MAP: Record<string, LucideIcon> = {
  'calendar-plus': CalendarPlus,
  'calendar-check': CalendarCheck,
  'file-text': FileText,
  'check-circle': CheckCircle,
  'calendar': Calendar,
  'image': Image,
  'eye': Eye,
  'check-circle-2': CheckCircle2,
};

export default function WorkflowTimeline({ 
  job, 
  workflowSteps,
  onToggleStep,
  isAdmin = false 
}: WorkflowTimelineProps) {
  const steps = workflowSteps || DEFAULT_WORKFLOW_STEPS.map(config => ({
    id: config.id,
    label: config.label,
    order: config.order,
    icon: config.icon,
    completedAt: undefined,
    completedBy: undefined
  }));

  const sortedSteps = [...steps].sort((a, b) => a.order - b.order);

  const handleToggle = (stepId: string, currentlyCompleted: boolean) => {
    if (onToggleStep && isAdmin) {
      onToggleStep(stepId, !currentlyCompleted);
    }
  };

  return (
    <div className="space-y-4">
      {sortedSteps.map((step, index) => {
        const Icon = step.icon ? ICON_MAP[step.icon] || CheckCircle : CheckCircle;
        const isCompleted = !!step.completedAt;
        const isLast = index === sortedSteps.length - 1;

        return (
          <div key={step.id} className="relative" data-testid={`workflow-step-${step.id}`}>
            {/* Connector Line */}
            {!isLast && (
              <div 
                className={cn(
                  "absolute left-[15px] top-8 w-0.5 h-6 -ml-px",
                  isCompleted ? "bg-green-500" : "bg-gray-300 dark:bg-gray-600"
                )}
              />
            )}

            {/* Step Content */}
            <div className="flex items-start gap-3">
              {/* Icon/Checkbox */}
              <div className="flex-shrink-0 mt-1">
                {isAdmin ? (
                  <Checkbox
                    checked={isCompleted}
                    onCheckedChange={() => handleToggle(step.id, isCompleted)}
                    className="h-5 w-5"
                    data-testid={`checkbox-step-${step.id}`}
                  />
                ) : (
                  <div className={cn(
                    "h-8 w-8 rounded-full flex items-center justify-center",
                    isCompleted 
                      ? "bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-400" 
                      : "bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500"
                  )}>
                    <Icon className="h-4 w-4" />
                  </div>
                )}
              </div>

              {/* Step Details */}
              <div className="flex-1 min-w-0">
                <p className={cn(
                  "text-sm font-medium",
                  isCompleted 
                    ? "text-gray-900 dark:text-white" 
                    : "text-gray-500 dark:text-gray-400"
                )}>
                  {step.label}
                </p>
                {step.completedAt && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {format(step.completedAt.toDate(), 'dd/MM/yyyy', { locale: it })}
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
