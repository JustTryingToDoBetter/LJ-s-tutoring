# POPIA Data Classification Map

This map documents how the platform classifies and protects personal information. It is used as the source of truth for the admin API endpoint `GET /admin/data-classification`.

## Classification Table

| Data type | Sensitivity | Storage location | Access roles |
| --- | --- | --- | --- |
| Student data | High | `students.full_name`, `students.grade`, `students.notes`, `assignments`, `sessions`, `session_history` | ADMIN, TUTOR (assigned/self) |
| Guardian contact details | High | `students.guardian_name`, `students.guardian_phone` | ADMIN, TUTOR (assigned/self) |
| Tutor notes | High | `sessions.notes`, `sessions.location`, `session_history` | ADMIN, TUTOR (self) |
| Payroll and banking fields | High | `invoices`, `invoice_lines`, `adjustments`, `tutor_profiles.default_hourly_rate` | ADMIN |

## Notes

- Banking account details are not stored in the platform database.
- Audit and retention tooling use this map for compliance reporting and access review.
