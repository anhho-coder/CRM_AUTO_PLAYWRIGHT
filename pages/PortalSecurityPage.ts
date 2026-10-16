import { CommonUtils } from '@/helpers/common.utils';
import { BasePage } from './BasePage';

/**
 * Page Object - the client-side half of the prototype-pollution remediation (CRM-8336 / CRM-12609).
 *
 * The server layer answers HTTP 400 for a dangerous parameter name, so the polluted URL never
 * renders and has no console to read. Everything here therefore runs on a CLEAN page and drives
 * the portal's own URL parsers by hand - which is the only way to exercise the client-side guard,
 * because the 400 never reaches it.
 *
 * Grounded on pre-production 2026-09-10 / 2026-09-14: the four parsers the portal exposes are
 * $.deparam, $.deparam.querystring, $.deparam.fragment and $.bbq.getState. Before the fix all
 * four wrote the injected key onto Object.prototype; after it, none of them do.
 */
export class PortalSecurityPage extends BasePage {
  /** Expression wrapper: evaluate like a console line and return a printable string. */
  private static fmt(expr: string): string {
    return (
      '(() => { let v; try { v = (' + expr + '); } catch (e) { return "Uncaught " + e.name + ": " + e.message; }' +
      ' if (v === undefined) return "undefined";' +
      ' if (v === null) return "null";' +
      ' if (typeof v === "string") return JSON.stringify(v);' +
      ' return String(v); })()'
    );
  }

  /** Open a page and let the portal scripts boot. */
  async openPage(url: string): Promise<void> {
    await this.page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: CommonUtils.waitTimes.pageLoad,
    });
    await this.page.waitForTimeout(CommonUtils.waitTimes.extraLong);
  }

  /** Which of the portal's URL-parsing entry points this page actually exposes. */
  async getAvailableParsers(): Promise<string[]> {
    return this.page.evaluate(`(() => {
      const out = [];
      const jq = window.$;
      if (jq && typeof jq.deparam === 'function') out.push('$.deparam');
      if (jq && jq.deparam && typeof jq.deparam.querystring === 'function') out.push('$.deparam.querystring');
      if (jq && jq.deparam && typeof jq.deparam.fragment === 'function') out.push('$.deparam.fragment');
      return out;
    })()`);
  }

  /**
   * Feed one payload to one parser and report whether the key landed on the shared object.
   *
   * @param parser   one of the names returned by {@link getAvailableParsers}
   * @param payload  the query-string fragment to parse, e.g. `__proto__[zzz]=1`
   * @param probeKey the key the payload tries to inject, e.g. `zzz`
   * @returns `polluted` true when `({})[probeKey]` is no longer undefined after the call.
   */
  async feedParser(
    parser: string,
    payload: string,
    probeKey: string
  ): Promise<{ polluted: boolean; value: string; error: string }> {
    return this.page.evaluate(
      `(() => {
        const jq = window.$;
        const call = {
          '$.deparam':             (s) => jq.deparam(s),
          '$.deparam.querystring': (s) => jq.deparam.querystring('http://h/?' + s),
          '$.deparam.fragment':    (s) => jq.deparam.fragment('http://h/#' + s),
          '$.bbq.getState':        (s) => { jq.bbq.pushState(s); return jq.bbq.getState(); },
        }[${JSON.stringify(parser)}];
        let error = '';
        try { call(${JSON.stringify(payload)}); } catch (e) { error = e.name + ': ' + e.message; }
        const raw = ({})[${JSON.stringify(probeKey)}];
        const polluted = raw !== undefined;
        if (polluted) { try { delete Object.prototype[${JSON.stringify(probeKey)}]; } catch (e) {} }
        return { polluted, value: polluted ? String(raw) : 'undefined', error };
      })()`
    );
  }

  /** Read a property through a plain object - i.e. what the console shows for `({}).key`. */
  async readInheritedProperty(key: string): Promise<string> {
    return this.page.evaluate(PortalSecurityPage.fmt(`({}).${key}`));
  }

  /**
   * The fragment path, driven the way an attacker actually reaches it: the payload is put in the
   * URL after `#` - which is never sent to the server, so the HTTP 400 guard cannot see it - the
   * page is loaded, and the fragment readers are then called on that real URL.
   *
   * @returns `polluted` true when the injected key reached the shared object.
   */
  async feedFragmentAndRead(
    pageUrl: string,
    payload: string,
    probeKey: string
  ): Promise<{ polluted: boolean; value: string; getState: string }> {
    await this.page.goto(`${pageUrl}#${payload}`, {
      waitUntil: 'domcontentloaded',
      timeout: CommonUtils.waitTimes.pageLoad,
    });
    await this.page.waitForTimeout(CommonUtils.waitTimes.extraLong);
    return this.page.evaluate(
      `(() => {
        let getState = '';
        try { getState = JSON.stringify(window.$.bbq.getState()); } catch (e) { getState = 'Uncaught ' + e.name; }
        try { window.$.deparam.fragment(); } catch (e) {}
        const raw = ({})[${JSON.stringify(probeKey)}];
        const polluted = raw !== undefined;
        if (polluted) { try { delete Object.prototype[${JSON.stringify(probeKey)}]; } catch (e) {} }
        return { polluted, value: polluted ? String(raw) : 'undefined', getState };
      })()`
    );
  }

  /**
   * OBSERVATION ONLY - `$.bbq.pushState()` given a raw STRING.
   *
   * This is a writer, not a URL-parsing entry point: the page calls it with its own data, so an
   * attacker cannot feed it directly. Measured on pre-production 2026-10-13: the string branch is
   * NOT covered by the remediation - it throws `TypeError: key_obj.push is not a function` and
   * leaves the injected key on the shared object, while `pushState({...})` with an object and
   * `getState()` on its own are both clean. Recorded so every run surfaces it, not asserted,
   * because it is outside the pass criteria agreed on CRM-12609.
   */
  async probePushStateWithString(
    payload: string,
    probeKey: string
  ): Promise<{ polluted: boolean; value: string; error: string }> {
    return this.page.evaluate(
      `(() => {
        let error = '';
        try { window.$.bbq.pushState(${JSON.stringify(payload)}); } catch (e) { error = e.name + ': ' + e.message; }
        const raw = ({})[${JSON.stringify(probeKey)}];
        const polluted = raw !== undefined;
        if (polluted) { try { delete Object.prototype[${JSON.stringify(probeKey)}]; } catch (e) {} }
        return { polluted, value: polluted ? String(raw) : 'undefined', error };
      })()`
    );
  }

  /**
   * The control check: set a property on the shared object by hand, read it back, delete it.
   * Proves an `undefined` elsewhere is a real clean state and not a blind read.
   */
  async runControlProbe(key: string): Promise<{ afterSet: string; afterDelete: string }> {
    return this.page.evaluate(
      `(() => {
        Object.prototype[${JSON.stringify(key)}] = 'visible';
        const afterSet = String(({})[${JSON.stringify(key)}]);
        delete Object.prototype[${JSON.stringify(key)}];
        const raw = ({})[${JSON.stringify(key)}];
        return { afterSet, afterDelete: raw === undefined ? 'undefined' : String(raw) };
      })()`
    );
  }

  /** How many Odoo services came up on this page - the health signal for a clean load. */
  async getStartedServiceCount(): Promise<number> {
    return this.page.evaluate(`(() => {
      if (typeof odoo === 'undefined' || !odoo.__DEBUG__ || !odoo.__DEBUG__.services) return -1;
      return Object.keys(odoo.__DEBUG__.services).length;
    })()`);
  }

  /** jQuery's own version string - it reads back as the injected value on a polluted page. */
  async getJQueryVersion(): Promise<string> {
    return this.page.evaluate(
      PortalSecurityPage.fmt('window.$ && window.$.fn && window.$.fn.jquery')
    );
  }
}
