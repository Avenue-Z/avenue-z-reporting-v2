import { isInternalStaff } from '@/lib/dashboard/permissions'

/** Any internal Avenue Z staff member may hide an annotation from the client: the same rule
 *  as the Organic/Influencer designation. If the answer narrows, change isInternalStaff. */
export function canHideAnnotation(role: string): boolean {
  return isInternalStaff(role)
}
