const ledger = require('../site/data/farm_actors.json');
const actors = ['jvhoang','elad-cmd','walexrush36','mackla1962','warrenchelsea5','evansnichole6911','esparzajohn7517','walkererica522','wsch40','paulssand27','torresdustin912','mcleanpatricia7','loganfoxdale','williamsjacob1','amanitesham','freegofloper56'];
const cmp = (x, y) => x.localeCompare(y, undefined, { numeric: true });
for (const a of actors) {
  const e = ledger[a];
  if (!e) { console.log(a.padEnd(20), 'NOT IN LEDGER'); continue; }
  const hrs = (e.hours || []).slice().sort(cmp);
  console.log(a.padEnd(20), 'first_seen', hrs[0], 'last_seen', hrs[hrs.length - 1], 'n_hours', hrs.length, 'pushes', JSON.stringify(e.pushes || {}).slice(0, 90));
}
