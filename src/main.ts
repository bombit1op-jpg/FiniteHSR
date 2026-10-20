import { initShell, setRouteEnter } from './ui/shell'
import { initPartyPanel } from './ui/partyPanel'

/**
 * App entry: only the Party Setup tab is wired. Every other UI page module was removed from the
 * shipped shell — the engine, store and party layer stay intact.
 */
setRouteEnter('team', () => {
  const root = document.getElementById('partyRoot')
  if (root) initPartyPanel(root)
})
initShell()
