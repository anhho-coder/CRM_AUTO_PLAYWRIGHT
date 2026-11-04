import { request } from '@playwright/test';
import { baseUrl } from '@config/users.config';
import { CommonUtils } from '@helpers/common.utils';

/**
 * CRM-11859 TC-CUST-099 (IS-CRM-FUNC-0289-1): "my meetings" = the support meetings the signed-in account CREATED (tester,
 * 2026-11-04). On pre-production that is support.meeting.info (Helpdesk > Configuration > Support meeting Info) with
 * create_uid = me; each one is migrated to the Support service as an NK Meeting whose odoo_info_id = its id.
 * The date windows are taken on OLD meetings (tester: "filter old meetings instead of creating test data and observing for
 * days"): the reference day D stands for "today" - D = the second-latest day (my time zone) holding a meeting of mine, so
 * the day itself, the days before it ("overdue") and the days after it ("upcoming") all hold meetings.
 */
const PREPROD_DB = 'nakivo';

export interface MeetingBaseline {
  uid: number;
  /** the user's time zone on pre-production */
  tz: string;
  /** every support.meeting.info id the user created */
  ids: number[];
  /** D, 'YYYY-MM-DD' in `tz` */
  day: string;
  /** D's bounds in UTC ('YYYY-MM-DD HH:mm:ss') - what Odoo stores and compares */
  utc: { dayStart: string; dayEnd: string };
  /** search_count of the user's meetings on D, before D 00:00:00 and after D 23:59:59 */
  counts: { onDay: number; before: number; after: number };
}

/** READ ONLY, separate API context: the support meetings `login` created on pre-production, and the D windows over them. */
export async function readPreprodMeetingBaseline(login: string, password: string): Promise<MeetingBaseline> {
  // https directly: http:// answers 301 -> https, and a redirected POST comes back as a GET (the login HTML page)
  const api = await request.newContext({ baseURL: baseUrl.replace(/^http:/, 'https:'), ignoreHTTPSErrors: true });
  const call = async (method: string, args: unknown[], kwargs: Record<string, unknown> = {}): Promise<unknown> => {
    const r = await api.post('web/dataset/call_kw', {
      headers: { 'Content-Type': 'application/json' },
      data: { jsonrpc: '2.0', method: 'call', params: { model: 'support.meeting.info', method, args, kwargs } },
      timeout: CommonUtils.waitTimes.abnormalWait,
    });
    const body = await r.json();
    if (body.error) throw new Error(`support.meeting.info.${method} failed: ${String(body.error?.data?.message ?? body.error?.message).slice(0, 200)}`);
    return body.result;
  };
  try {
    const res = await api.post('web/session/authenticate', {
      headers: { 'Content-Type': 'application/json' },
      data: { jsonrpc: '2.0', method: 'call', params: { db: PREPROD_DB, login, password } },
      timeout: CommonUtils.waitTimes.abnormalWait,
    });
    const auth = await res.json();
    if (auth.error || !auth.result?.uid) throw new Error(`pre-production sign-in of ${login} failed: ${String(auth.error?.data?.message ?? auth.error?.message ?? 'no uid').slice(0, 200)}`);
    const uid = Number(auth.result.uid);
    const tz = String(auth.result.user_context?.tz || 'UTC');
    const mine: unknown[] = [['create_uid', '=', uid]];
    const ids = (await call('search', [mine])) as number[];
    const latest = (await call('search_read', [[...mine, ['meeting_time', '!=', false]]], { fields: ['meeting_time'], order: 'meeting_time desc', limit: 60 })) as Array<{ meeting_time: string }>;
    const days = [...new Set(latest.map((m) => localDay(m.meeting_time, tz)))];
    if (days.length < 2) throw new Error(`${login}: fewer than 2 days hold a meeting among the newest 60 - no reference day`);
    const day = days[1];
    const utc = { dayStart: utcOf(`${day} 00:00:00`, tz), dayEnd: utcOf(`${day} 23:59:59`, tz) };
    const counts = {
      onDay: (await call('search_count', [[...mine, ['meeting_time', '>=', utc.dayStart], ['meeting_time', '<=', utc.dayEnd]]])) as number,
      before: (await call('search_count', [[...mine, ['meeting_time', '<', utc.dayStart]]])) as number,
      after: (await call('search_count', [[...mine, ['meeting_time', '>', utc.dayEnd]]])) as number,
    };
    if (!counts.onDay || !counts.before || !counts.after) throw new Error(`${login}: a window around ${day} is empty (${JSON.stringify(counts)}) - the case would not discriminate`);
    return { uid, tz, ids, day, utc, counts };
  } finally {
    await api.dispose();
  }
}

/** The calendar day ('YYYY-MM-DD') in `tz` of a UTC value 'YYYY-MM-DD HH:mm:ss'. */
export function localDay(utcValue: string, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(`${utcValue.replace(' ', 'T')}Z`));
}

/** The UTC value ('YYYY-MM-DD HH:mm:ss') of a wall-clock time 'YYYY-MM-DD HH:mm:ss' in `tz`. */
export function utcOf(wall: string, tz: string): string {
  const asUtc = new Date(`${wall.replace(' ', 'T')}Z`);
  const instant = new Date(asUtc.getTime() - tzOffsetMinutes(asUtc, tz) * 60_000);
  return instant.toISOString().slice(0, 19).replace('T', ' ');
}

function tzOffsetMinutes(at: Date, tz: string): number {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(at).filter((x) => x.type !== 'literal').map((x) => [x.type, Number(x.value)]));
  return (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - at.getTime()) / 60_000;
}
