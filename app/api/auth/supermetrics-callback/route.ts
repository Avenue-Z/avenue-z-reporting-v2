/**
 * @deprecated Supermetrics branded auth has been removed.
 * This route is no longer in use. You can delete this file.
 */
import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({ error: 'Supermetrics integration removed' }, { status: 410 })
}
