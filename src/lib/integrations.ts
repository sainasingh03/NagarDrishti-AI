import type { Hazard } from './api'

export type IntegrationStatus = 'not_configured' | 'demo_only'

export type DepartmentPreview = {
  id: string
  label: string
  scope: string
  status: IntegrationStatus
}

/** Example destinations are UI-only until an authorized department API is configured. */
export const DEPARTMENT_PREVIEWS: DepartmentPreview[] = [
  { id: 'city-roads', label: 'City roads office', scope: 'Road surface and pothole reports', status: 'demo_only' },
  { id: 'drainage', label: 'Drainage office', scope: 'Waterlogging and drainage reports', status: 'demo_only' },
  { id: 'state-highways', label: 'State highways office', scope: 'Highway infrastructure reports', status: 'demo_only' },
]

export type ComplaintDraft = {
  reportId: string
  department: string
  text: string
}

/** Builds a local draft from an actual saved report; this function never contacts an authority. */
export function prepareComplaintDraft(report: Hazard, department: DepartmentPreview): ComplaintDraft {
  const location = `${report.latitude.toFixed(6)}, ${report.longitude.toFixed(6)}`
  const description = report.description.trim() || 'No additional description was included in the saved report.'
  return {
    reportId: report.id,
    department: department.label,
    text: [
      'NAGARDRISHTI AI — LOCAL COMPLAINT DRAFT',
      'NOT SUBMITTED TO A GOVERNMENT DEPARTMENT',
      '',
      `Suggested recipient (demo selection): ${department.label}`,
      `Application report reference: ${report.id}`,
      `Hazard category: ${report.category.replaceAll('_', ' ')}`,
      `Reported location (latitude, longitude): ${location}`,
      `Application status: ${report.status.replaceAll('_', ' ')}`,
      `Report date: ${new Date(report.created_at).toLocaleString()}`,
      `Description: ${description}`,
      '',
      'This document was prepared locally from application data. It has not been transmitted or acknowledged by an authority.',
    ].join('\n'),
  }
}

/** Contract for a future authorized connector. No live implementation is registered in this prototype. */
export type ComplaintConnectorResult =
  | { status: 'submitted'; confirmation: string }
  | { status: 'not_configured'; message: string }

export interface GovernmentComplaintConnector {
  readonly id: string
  readonly status: 'not_configured'
  submit(draft: ComplaintDraft): Promise<ComplaintConnectorResult>
}

export const governmentComplaintConnector: GovernmentComplaintConnector = {
  id: 'government-complaints',
  status: 'not_configured',
  async submit() {
    return { status: 'not_configured', message: 'No government complaint service is configured. The local draft was not sent.' }
  },
}
