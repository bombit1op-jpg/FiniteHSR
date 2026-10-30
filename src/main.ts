import { initShell, setRouteEnter } from './ui/shell'
import { initPartyPanel } from './ui/partyPanel'
import { initSimulationPanel } from './ui/simulationPanel'
import { PartyStore } from './ui/partyStore'

/**
 * App entry: Party Setup and Simulation tabs are wired. Both share a single PartyStore instance.
 */
const sharedStore = new PartyStore()

setRouteEnter('team', () => {
  const root = document.getElementById('partyRoot')
  if (root) initPartyPanel(root, sharedStore)
})

setRouteEnter('simulation', () => {
  const root = document.getElementById('simulationRoot')
  if (root) initSimulationPanel(root, sharedStore)
})

initShell()
