import { raw } from '../_helpers/battle'
import { fmt, fmtStatVal, escapeHtml } from '../../src/ui/dom'
import { n, dmg } from '../../src/ui/render'

/**
 * §84 G6 — presentation honesty helpers (§84.2). `n()`/`dmg()` must never turn missing data into
 * a real 0; percent stats render with the trailing `%`; the escaper neutralises raw HTML before
 * any `innerHTML` path. These are the pure edges of the render layer (no DOM needed).
 */
export default () => {
  return [
    raw('n: undefined renders N/A, not 0', n(undefined) === 'N/A', n(undefined)),
    raw('n: null renders N/A', n(null) === 'N/A', n(null)),
    raw('n: NaN renders N/A', n(NaN) === 'N/A', n(NaN)),
    raw('n: a real zero stays 0', n(0) === '0', n(0)),
    raw('n: integers render without decimals', n(1234) === '1234', n(1234)),
    raw('n: floats round to the requested digits', n(1.23456, 2) === '1.23', n(1.23456, 2)),
    raw('dmg: millions render as M', dmg(2_500_000) === '2.50M', dmg(2_500_000)),
    raw('dmg: thousands render as k', dmg(1520) === '1.5k', dmg(1520)),
    raw('dmg: missing renders N/A', dmg(null) === 'N/A', dmg(null)),
    raw('fmtStatVal: percent stat gets a % suffix', fmtStatVal('critRate', 0.386) === '38.6%', fmtStatVal('critRate', 0.386)),
    raw('fmtStatVal: flat stat has no suffix', fmtStatVal('hpFlat', 1234.56) === '1234.6', fmtStatVal('hpFlat', 1234.56)),
    raw('fmt: large numbers compress to k', fmt(12345) === '12.3k', fmt(12345)),
    raw('fmt: sub-10000 stays integer', fmt(9999) === '9999', fmt(9999)),
    raw('escapeHtml neutralises angle brackets and ampersands', escapeHtml('<b>&</b>') === '&lt;b&gt;&amp;&lt;/b&gt;', escapeHtml('<b>&</b>')),
  ]
}
