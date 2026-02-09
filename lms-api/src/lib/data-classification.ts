export type DataClassificationEntry = {
  dataType: string;
  sensitivity: 'high' | 'medium' | 'low' | 'not_collected';
  storageLocations: string[];
  accessRoles: string[];
  notes?: string;
};

export const PII_CLASSIFICATION_MAP: DataClassificationEntry[] = [
  {
    dataType: 'Student data',
    sensitivity: 'high',
    storageLocations: [
      'students (full_name, grade, notes, is_active)',
      'assignments (student_id, subject, schedule)',
      'sessions (student_id, date, time, location, notes)',
      'session_history (before_json, after_json)'
    ],
    accessRoles: ['ADMIN', 'TUTOR (assigned/self)'],
    notes: 'Used for tutoring operations and compliance reporting.'
  },
  {
    dataType: 'Guardian contact details',
    sensitivity: 'high',
    storageLocations: [
      'students (guardian_name, guardian_phone)'
    ],
    accessRoles: ['ADMIN', 'TUTOR (assigned/self)'],
    notes: 'Contact details for minors and billing communications.'
  },
  {
    dataType: 'Tutor notes',
    sensitivity: 'high',
    storageLocations: [
      'sessions (notes, location)',
      'session_history (before_json, after_json)'
    ],
    accessRoles: ['ADMIN', 'TUTOR (self)'],
    notes: 'Operational notes captured during or after sessions.'
  },
  {
    dataType: 'Payroll and banking fields',
    sensitivity: 'high',
    storageLocations: [
      'invoices (invoice_number, period_start, period_end, total_amount)',
      'invoice_lines (description, minutes, rate, amount)',
      'adjustments (type, amount, reason)',
      'tutor_profiles (default_hourly_rate)'
    ],
    accessRoles: ['ADMIN'],
    notes: 'No bank account details are stored in the platform database.'
  }
];
