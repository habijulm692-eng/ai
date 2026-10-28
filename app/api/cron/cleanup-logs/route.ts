import { NextRequest, NextResponse } from 'next/server';

/**
 * 7-Day Auto Log Cleanup Cron Handler
 * Deletes all logs in Firebase Realtime Database older than 7 days (timestamp < now - 7 days).
 * Can be triggered via Vercel Cron or direct authenticated POST/GET request.
 */
export async function GET(req: NextRequest) {
  return handleCleanup(req);
}

export async function POST(req: NextRequest) {
  return handleCleanup(req);
}

async function handleCleanup(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');

  // Verify CRON_SECRET if configured (for Vercel Cron protection)
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized cron request' }, { status: 401 });
  }

  const firebaseUrl = process.env.FIREBASE_DATABASE_URL || '';
  const firebaseSecret = process.env.FIREBASE_DATABASE_SECRET || '';

  if (!firebaseUrl) {
    return NextResponse.json({
      error: 'FIREBASE_DATABASE_URL is not configured.',
      success: false,
    }, { status: 400 });
  }

  const cleanUrl = firebaseUrl.replace(/\/$/, '');
  const authParam = firebaseSecret ? `?auth=${encodeURIComponent(firebaseSecret)}` : '';
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const cutoffTimestamp = Date.now() - SEVEN_DAYS_MS;

  try {
    // 1. Fetch current logs
    const logsRes = await fetch(`${cleanUrl}/logs.json${authParam}`, {
      cache: 'no-store',
    });

    if (!logsRes.ok) {
      return NextResponse.json({
        error: `Failed to fetch logs from Firebase: ${logsRes.statusText}`,
        success: false,
      }, { status: 502 });
    }

    const logs: Record<string, any> = (await logsRes.json()) || {};
    const logEntries = Object.entries(logs);

    let deletedCount = 0;
    const deletePromises: Promise<any>[] = [];

    // 2. Identify logs older than 7 days
    for (const [key, log] of logEntries) {
      if (log && typeof log.timestamp === 'number' && log.timestamp < cutoffTimestamp) {
        deletedCount++;
        deletePromises.push(
          fetch(`${cleanUrl}/logs/${key}.json${authParam}`, {
            method: 'DELETE',
          })
        );
      }
    }

    // Execute deletions in parallel batches
    await Promise.all(deletePromises);

    return NextResponse.json({
      success: true,
      message: `Cleaned up ${deletedCount} logs older than 7 days`,
      deletedCount,
      remainingCount: logEntries.length - deletedCount,
      cutoffTimestamp,
      cutoffDateIso: new Date(cutoffTimestamp).toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json({
      error: error?.message || 'Failed to cleanup logs',
      success: false,
    }, { status: 500 });
  }
}
