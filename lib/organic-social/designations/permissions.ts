import { isInternalStaff } from '@/lib/dashboard/permissions'

/** Decision 4a: any internal Avenue Z staff member may set a post's designation.
 *  Delegates to the shared predicate so the rule lives in one place (matches the
 *  canEditDashboard precedent). If the answer narrows, change isInternalStaff's set. */
export function canSetDesignation(role: string): boolean {
  return isInternalStaff(role)
}
